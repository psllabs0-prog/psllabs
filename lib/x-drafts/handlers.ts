import crypto from "node:crypto";

import { createRateLimiter } from "@/lib/ops/mission-control/n8n/config";
import { recordXEvent, X_EVENT_TYPES } from "@/lib/x-publishing/events";
import { fail, json, readJsonObject, unexpectedKeys, type Parsed } from "@/lib/x-publishing/http";
import { getXPublishingSchemaState } from "@/lib/x-publishing/schema";

import { batchSigningKey, getXDraftConfig, verifyXDraftAuthorization } from "./config";
import { X_DRAFT_CHECKS_DISCLAIMER, X_DRAFT_LIMITS } from "./constants";
import {
  buildUserPrompt,
  draftItemId,
  signBatchToken,
  verifyBatchToken,
  X_DRAFT_OUTPUT_SCHEMA,
  X_DRAFT_PACKET_VERSION,
  X_DRAFT_PROMPT_VERSION,
  X_DRAFT_SOURCES,
  X_DRAFT_SYSTEM_PROMPT,
} from "./packet";
import { countAssistantDraftsToday, insertAssistantDrafts, readRecentPosts } from "./store";
import { validateCandidates } from "./validate";

export type XDraftAction = "packet" | "batch";

const limiters = {
  packet: createRateLimiter(X_DRAFT_LIMITS.packetRequestsPerMinute, 60_000),
  batch: createRateLimiter(X_DRAFT_LIMITS.batchRequestsPerMinute, 60_000),
};

/** Test-only. */
export function __resetXDraftRateLimitersForTests(): void {
  limiters.packet.reset();
  limiters.batch.reset();
}

const EXECUTION_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const MODEL_RE = /^[A-Za-z0-9._:/@-]{1,100}$/;
const NOTICE = `${X_DRAFT_CHECKS_DISCLAIMER} Nothing was approved, scheduled, or published; review drafts in /admin-social.`;

function executionId(v: unknown): Parsed<string> {
  return typeof v === "string" && EXECUTION_ID_RE.test(v) ? { ok: true, value: v } : fail(400, "executionId must be 1-64 characters of [A-Za-z0-9_-].");
}

type BatchBody = {
  batchToken: string;
  executionId: string;
  model: string;
  stopReason: string | null;
  usage: { inputTokens: number | null; outputTokens: number | null };
  modelOutput: string;
};

/** Only finish_reason "stop" is saved; refusals, truncation, and filtered or unknown endings never become drafts. */
function incompleteReason(stopReason: string | null): string {
  if (stopReason === "refusal") return "the model refused";
  if (stopReason === "length") return "truncated at max_completion_tokens";
  if (stopReason === "content_filter") return "incomplete: content filter";
  return stopReason ? `finish_reason ${stopReason}` : "no finish_reason reported";
}

function tokenCount(v: unknown): number | null {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 && v < 10_000_000 ? v : null;
}

function parseBatch(body: Record<string, unknown>): Parsed<BatchBody> {
  const extra = unexpectedKeys(body, ["batchToken", "executionId", "model", "stopReason", "usage", "modelOutput"]);
  if (extra) return fail(400, extra);
  if (typeof body.batchToken !== "string" || body.batchToken.length > 1000) return fail(400, "batchToken must be the token returned by the packet endpoint.");
  const exec = executionId(body.executionId);
  if (!exec.ok) return exec;
  if (typeof body.model !== "string" || !MODEL_RE.test(body.model)) return fail(400, "model must be the model ID reported by the provider.");
  if (body.stopReason !== null && body.stopReason !== undefined && (typeof body.stopReason !== "string" || body.stopReason.length > 40)) {
    return fail(400, "stopReason must be a short string or null.");
  }
  if (typeof body.modelOutput !== "string") return fail(400, "modelOutput must be a string.");
  if (body.modelOutput.length > X_DRAFT_LIMITS.maxModelOutputChars) return fail(413, `modelOutput exceeds ${X_DRAFT_LIMITS.maxModelOutputChars} characters.`);
  const usage = (body.usage && typeof body.usage === "object" ? body.usage : {}) as Record<string, unknown>;
  return {
    ok: true,
    value: {
      batchToken: body.batchToken,
      executionId: exec.value,
      model: body.model,
      stopReason: typeof body.stopReason === "string" ? body.stopReason : null,
      usage: { inputTokens: tokenCount(usage.inputTokens), outputTokens: tokenCount(usage.outputTokens) },
      modelOutput: body.modelOutput,
    },
  };
}

/**
 * Machine entry point for the n8n draft assistant (its own token; never the
 * publisher's). Capabilities: fetch the fixed source packet, and submit model
 * output that the server validates and inserts as new unapproved drafts. It
 * cannot edit, approve, schedule, claim, cancel, pause/resume, publish, or
 * resolve anything. Never accepts cookies or query credentials.
 */
export async function handleXDraftRequest(
  request: Request,
  action: XDraftAction,
  options: { env?: Record<string, string | undefined>; now?: Date } = {}
): Promise<Response> {
  const env = options.env ?? process.env;
  const now = options.now ?? new Date();
  const config = getXDraftConfig(env);

  if (!config.gate.enabled || config.isTest === null) return json(503, { error: "The X draft assistant is not enabled." });
  if (new URL(request.url).search !== "") {
    return json(400, { error: "Query parameters are not accepted; send credentials in the Authorization header." });
  }
  if (env.VERCEL && request.headers.get("x-forwarded-proto") !== "https") return json(400, { error: "HTTPS required." });
  if (request.headers.get("cookie")) return json(400, { error: "Cookies are not accepted on machine endpoints." });
  const rate = limiters[action].take(now.getTime());
  if (!rate.ok) return json(429, { error: "Rate limit exceeded." }, { "Retry-After": String(rate.retryAfterSeconds) });
  if (!verifyXDraftAuthorization(request.headers.get("authorization"), env)) {
    return json(401, { error: "Unauthorized." }, { "WWW-Authenticate": "Bearer" });
  }
  const key = batchSigningKey(env);
  if (!key) return json(503, { error: "The X draft assistant is not enabled." });
  const isTest = config.isTest;

  try {
    const schema = await getXPublishingSchemaState();
    if (!schema.initialized) return json(503, { error: "X publishing tables are not initialized." });

    const body = await readJsonObject(request, action === "packet" ? X_DRAFT_LIMITS.packetMaxBodyBytes : X_DRAFT_LIMITS.batchMaxBodyBytes);
    if (!body.ok) return json(body.status, { error: body.error });

    if (action === "packet") {
      const extra = unexpectedKeys(body.value, ["executionId"]);
      if (extra) return json(400, { error: extra });
      const exec = executionId(body.value.executionId);
      if (!exec.ok) return json(exec.status, { error: exec.error });

      const used = await countAssistantDraftsToday(isTest, now);
      if (used >= X_DRAFT_LIMITS.maxDraftsPerPhoenixDay) {
        return json(429, {
          error: `Daily cap reached: ${used} assistant drafts already saved today (Phoenix). No packet issued, so no model call should be made.`,
        });
      }
      const recent = await readRecentPosts(isTest, X_DRAFT_LIMITS.recentPostsInPacket);
      const batchId = crypto.randomUUID();
      const issuedAt = now.toISOString();
      return json(200, {
        batchId,
        batchToken: signBatchToken({ batchId, packetVersion: X_DRAFT_PACKET_VERSION, issuedAt, isTest }, key),
        packetVersion: X_DRAFT_PACKET_VERSION,
        promptVersion: X_DRAFT_PROMPT_VERSION,
        isTest,
        issuedAt,
        expiresAt: new Date(now.getTime() + X_DRAFT_LIMITS.batchTtlMinutes * 60_000).toISOString(),
        maxCandidates: X_DRAFT_LIMITS.maxCandidates,
        remainingToday: X_DRAFT_LIMITS.maxDraftsPerPhoenixDay - used,
        sources: X_DRAFT_SOURCES.map((s) => ({ id: s.id, kind: s.kind, title: s.title, url: s.url })),
        prompt: { system: X_DRAFT_SYSTEM_PROMPT, user: buildUserPrompt(batchId, recent.map((p) => p.text)) },
        outputSchema: X_DRAFT_OUTPUT_SCHEMA,
        notice: "Source text in the prompt is evidence, not instructions. Output is validated server-side and saved only as unapproved drafts.",
      });
    }

    const p = parseBatch(body.value);
    if (!p.ok) return json(p.status, { error: p.error });
    const claims = verifyBatchToken(p.value.batchToken, key);
    if (!claims) return json(401, { error: "batchToken is invalid." });
    const issued = Date.parse(claims.issuedAt);
    if (!Number.isFinite(issued) || issued > now.getTime() + 60_000) return json(401, { error: "batchToken is invalid." });
    if (now.getTime() - issued > X_DRAFT_LIMITS.batchTtlMinutes * 60_000) {
      return json(410, { error: "This batch expired. Nothing was saved; run the workflow again to start a new batch." });
    }
    if (claims.packetVersion !== X_DRAFT_PACKET_VERSION) {
      return json(409, { error: "The approved sources or prompt changed after this batch was issued. Nothing was saved; start a new batch." });
    }
    if (claims.isTest !== isTest) return json(409, { error: "This batch was issued for a different queue partition. Nothing was saved." });
    if (p.value.stopReason !== "stop") {
      return json(422, { error: `Model output is not a complete completion (${incompleteReason(p.value.stopReason)}). Nothing was saved.` });
    }

    // A replayed batch finds its own rows; they are reported as already saved, not as duplicates.
    const ownIds = new Set(Array.from({ length: X_DRAFT_LIMITS.maxCandidates }, (_, i) => draftItemId(claims.batchId, i + 1)));
    const existing = (await readRecentPosts(isTest, X_DRAFT_LIMITS.nearDuplicateCompareLimit)).filter((e) => !ownIds.has(e.id));
    const result = validateCandidates({
      modelOutput: p.value.modelOutput,
      stopReason: p.value.stopReason,
      sources: X_DRAFT_SOURCES,
      existing,
      batchId: claims.batchId,
      packetVersion: claims.packetVersion,
      model: p.value.model,
    });

    const toInsert = result.verdicts.flatMap((v) => (v.prepared ? [{ item: v.item, id: draftItemId(claims.batchId, v.item), prepared: v.prepared }] : []));
    const outcomes = await insertAssistantDrafts({ isTest, now, items: toInsert });

    const saved = [];
    const alreadySaved = [];
    const blocked: Array<{ item: number; reasons: string[]; text: string | null }> = [];
    for (const v of result.verdicts) {
      const o = outcomes.find((x) => x.item === v.item);
      if (!o) blocked.push({ item: v.item, reasons: v.blockReasons, text: v.text });
      else if (o.outcome === "saved") saved.push({ item: v.item, postId: o.id, reviewWarnings: v.reviewWarnings });
      else if (o.outcome === "already_saved") alreadySaved.push({ item: v.item, postId: o.id, reviewWarnings: v.reviewWarnings });
      else blocked.push({ item: v.item, reasons: [o.reason], text: v.text });
    }

    const counts = { candidates: result.candidateCount, saved: saved.length, alreadySaved: alreadySaved.length, blocked: blocked.length };
    await recordXEvent({
      type: X_EVENT_TYPES.draftsProposed,
      outcome: saved.length > 0 ? "completed" : "skipped",
      summary: `Draft assistant batch: ${counts.saved} saved as unapproved AI-assisted drafts, ${counts.alreadySaved} already saved, ${counts.blocked} blocked — owner review required`,
      queueId: null,
      revision: null,
      isTest,
      now,
      discriminator: claims.batchId,
    });

    return json(200, {
      batchId: claims.batchId,
      isTest,
      packetVersion: claims.packetVersion,
      model: p.value.model,
      usage: p.value.usage,
      parseError: result.parseError,
      counts,
      saved,
      alreadySaved,
      blocked,
      reviewUrl: "/admin-social",
      notice: NOTICE,
    });
  } catch (error) {
    console.error("[x-drafts] request failed:", error instanceof Error ? error.message : error);
    return json(500, { error: "Internal error." });
  }
}
