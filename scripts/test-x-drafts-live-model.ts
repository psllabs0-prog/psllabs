/**
 * LIVE-MODEL check for the X draft assistant. Opt-in only; it spends provider
 * credit (one request, no retry) and writes nothing anywhere:
 *
 *   X_DRAFTS_LIVE_MODEL_TEST=1 X_DRAFTS_LIVE_MODEL_ID=<model id> ANTHROPIC_API_KEY=<dedicated key> npm run test:x-drafts-live-model
 *
 * Sends the exact packet prompt the endpoint issues (with an empty recent
 * queue) to the Anthropic Messages API, then runs the server validator on the
 * reply and prints counts, block reasons, and token usage. The database client
 * is replaced with one that throws, so no database can be read or written.
 * The API key is read from the environment and never printed.
 */
import crypto from "node:crypto";

import type { NeonQueryFunction } from "@neondatabase/serverless";

import { __setSqlClientForTests } from "../lib/db/sql";
import { X_DRAFT_LIMITS } from "../lib/x-drafts/constants";
import { buildUserPrompt, X_DRAFT_PACKET_VERSION, X_DRAFT_SOURCES, X_DRAFT_SYSTEM_PROMPT } from "../lib/x-drafts/packet";
import { validateCandidates } from "../lib/x-drafts/validate";

const MAX_TOKENS = 2000;

async function main() {
  if (process.env.X_DRAFTS_LIVE_MODEL_TEST !== "1") {
    console.log("[x-drafts-live] skipped: set X_DRAFTS_LIVE_MODEL_TEST=1, X_DRAFTS_LIVE_MODEL_ID, and ANTHROPIC_API_KEY (spends provider credit).");
    return;
  }
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  const model = process.env.X_DRAFTS_LIVE_MODEL_ID?.trim();
  if (!key || !model || !/^[A-Za-z0-9._:-]{3,100}$/.test(model)) throw new Error("ANTHROPIC_API_KEY and a valid X_DRAFTS_LIVE_MODEL_ID are required.");

  const noDb = (() => {
    throw new Error("database access is not allowed in the live-model test");
  }) as unknown as NeonQueryFunction<false, false>;
  __setSqlClientForTests(noDb);

  const batchId = crypto.randomUUID();
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    redirect: "error",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model,
      max_tokens: MAX_TOKENS,
      temperature: 0.3,
      system: X_DRAFT_SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserPrompt(batchId, []) }],
    }),
    signal: AbortSignal.timeout(120_000),
  });
  const body = (await res.json()) as {
    model?: string;
    stop_reason?: string;
    usage?: { input_tokens?: number; output_tokens?: number };
    content?: Array<{ type: string; text?: string }>;
    error?: { type?: string; message?: string };
  };
  if (!res.ok) throw new Error(`provider returned HTTP ${res.status}: ${body.error?.type ?? "error"}`);
  const output = (body.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n");

  const result = validateCandidates({
    modelOutput: output.slice(0, X_DRAFT_LIMITS.maxModelOutputChars),
    stopReason: body.stop_reason ?? null,
    sources: X_DRAFT_SOURCES,
    existing: [],
    batchId,
    packetVersion: X_DRAFT_PACKET_VERSION,
    model: body.model ?? model,
  });
  console.log(`[x-drafts-live] model ${body.model ?? model}; stop ${body.stop_reason}; usage in=${body.usage?.input_tokens} out=${body.usage?.output_tokens}`);
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
  if (result.parseError || result.candidateCount > X_DRAFT_LIMITS.maxCandidates) process.exit(1);
}

main().catch((error) => {
  console.error("[x-drafts-live] FAILED:", error instanceof Error ? error.message : error);
  process.exit(1);
});
