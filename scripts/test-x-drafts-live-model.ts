/**
 * LIVE-MODEL check for the X draft assistant. Opt-in only; it spends OpenAI
 * credit (one request, no retry) and writes nothing anywhere:
 *
 *   X_DRAFTS_LIVE_MODEL_TEST=1 OPENAI_API_KEY=<key from the dedicated project> npm run test:x-drafts-live-model
 *
 * Sends the exact packet prompt and strict output schema the endpoint issues
 * (with an empty recent queue) to OpenAI Chat Completions using gpt-4o-mini,
 * applies the same response decision the workflow uses, then runs the server
 * validator on the reply and prints counts, block reasons, and token usage.
 * The database client is replaced with one that throws, so no database can be
 * read or written. The API key is read from the environment and never printed.
 */
import crypto from "node:crypto";

import type { NeonQueryFunction } from "@neondatabase/serverless";

import { __setSqlClientForTests } from "../lib/db/sql";
import {
  buildOpenAIRequestBody,
  decideOpenAIAttempt,
  X_DRAFT_OPENAI_ENDPOINT,
  X_DRAFT_OPENAI_MAX_COMPLETION_TOKENS,
  X_DRAFT_OPENAI_MODEL,
  type OpenAIAttempt,
} from "../lib/x-drafts/openai";
import { buildUserPrompt, X_DRAFT_OUTPUT_SCHEMA, X_DRAFT_PACKET_VERSION, X_DRAFT_SOURCES, X_DRAFT_SYSTEM_PROMPT } from "../lib/x-drafts/packet";
import { validateCandidates } from "../lib/x-drafts/validate";

async function main() {
  if (process.env.X_DRAFTS_LIVE_MODEL_TEST !== "1") {
    console.log("[x-drafts-live] skipped: set X_DRAFTS_LIVE_MODEL_TEST=1 and OPENAI_API_KEY (spends OpenAI credit).");
    return;
  }
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error("OPENAI_API_KEY is required.");

  const noDb = (() => {
    throw new Error("database access is not allowed in the live-model test");
  }) as unknown as NeonQueryFunction<false, false>;
  __setSqlClientForTests(noDb);

  const batchId = crypto.randomUUID();
  let attempt: OpenAIAttempt;
  try {
    const res = await fetch(X_DRAFT_OPENAI_ENDPOINT, {
      method: "POST",
      redirect: "error",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify(
        buildOpenAIRequestBody({
          model: X_DRAFT_OPENAI_MODEL,
          maxCompletionTokens: X_DRAFT_OPENAI_MAX_COMPLETION_TOKENS,
          prompt: { system: X_DRAFT_SYSTEM_PROMPT, user: buildUserPrompt(batchId, []) },
          outputSchema: X_DRAFT_OUTPUT_SCHEMA,
        })
      ),
      signal: AbortSignal.timeout(120_000),
    });
    attempt = { statusCode: res.status, body: await res.json() };
  } catch (error) {
    attempt = { transportError: error instanceof Error ? error.message : String(error) };
  }

  const decision = decideOpenAIAttempt(attempt, X_DRAFT_OPENAI_MODEL);
  if (decision.action !== "submit") {
    throw new Error(`nothing would be submitted (${decision.action}: ${decision.reason}); this test never retries`);
  }
  const s = decision.submission;
  const result = validateCandidates({
    modelOutput: s.modelOutput,
    stopReason: s.stopReason,
    sources: X_DRAFT_SOURCES,
    existing: [],
    batchId,
    packetVersion: X_DRAFT_PACKET_VERSION,
    model: s.model,
  });
  console.log(`[x-drafts-live] model ${s.model}; finish_reason ${s.stopReason}; usage prompt=${s.usage.inputTokens} completion=${s.usage.outputTokens}`);
  if (result.parseError) console.log(`[x-drafts-live] parse error: ${result.parseError}`);
  for (const v of result.verdicts) {
    const state = v.blockReasons.length === 0 ? "WOULD SAVE (draft)" : "BLOCKED";
    console.log(`\n[${v.item}] ${state}\n  text: ${v.text}\n  sources: ${v.sourceIds.join(", ")}`);
    if (v.blockReasons.length) console.log(`  reasons: ${v.blockReasons.join(" | ")}`);
    if (v.reviewWarnings.length) console.log(`  review: ${v.reviewWarnings.join(" | ")}`);
  }
  const ok = result.verdicts.filter((v) => v.blockReasons.length === 0).length;
  console.log(`\n[x-drafts-live] ${result.candidateCount} candidates: ${ok} would be saved as drafts, ${result.verdicts.length - ok} blocked. Nothing was written.`);
  __setSqlClientForTests(null);
  if (result.parseError || result.candidateCount > 5) process.exit(1);
}

main().catch((error) => {
  console.error("[x-drafts-live] FAILED:", error instanceof Error ? error.message : error);
  process.exit(1);
});
