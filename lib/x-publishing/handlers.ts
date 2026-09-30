import { createRateLimiter } from "@/lib/ops/mission-control/n8n/config";

import { getXPublishingConfig, verifyXPublisherAuthorization } from "./config";
import { X_POST_ID_RE } from "./constants";
import { fail, json, readJsonObject, unexpectedKeys, UUID_RE, type Parsed } from "./http";
import {
  claimXWork,
  gateForMode,
  reportXCreateResult,
  reportXIdentity,
  reportXLookup,
  requestXDispatchPermit,
  type XMode,
} from "./machine-store";
import type { XResult } from "./records";
import { getXPublishingSchemaState } from "./schema";
import type { CreateReport, LookupData, LookupReport } from "./verify";

export type XMachineAction =
  | { kind: "claim" }
  | { kind: "identity"; attemptId: string }
  | { kind: "dispatch"; attemptId: string }
  | { kind: "result"; attemptId: string }
  | { kind: "lookup"; attemptId: string };

export const X_MACHINE_REQUESTS_PER_MINUTE = 20;
export const X_MACHINE_MAX_BODY_BYTES = 2048;
export const X_LOOKUP_MAX_BODY_BYTES = 8192;

const limiter = createRateLimiter(X_MACHINE_REQUESTS_PER_MINUTE, 60_000);

/** Test-only. */
export function __resetXMachineRateLimiterForTests(): void {
  limiter.reset();
}

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const EXECUTION_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

function token(body: Record<string, unknown>): Parsed<string> {
  return typeof body.token === "string" && TOKEN_RE.test(body.token)
    ? { ok: true, value: body.token }
    : fail(400, "token must be the work token returned by claim.");
}

function httpStatus(v: unknown): Parsed<number | null> {
  if (v === null || v === undefined || v === 0) return { ok: true, value: null };
  if (typeof v !== "number" || !Number.isInteger(v) || v < 100 || v > 599) {
    return fail(400, "httpStatus must be an integer HTTP status or null.");
  }
  return { ok: true, value: v };
}

/** IDs exceed Number.MAX_SAFE_INTEGER; a numeric JSON value means precision may already be lost. */
function idString(v: unknown, field: string, nullable = true): Parsed<string | null> {
  if ((v === null || v === undefined) && nullable) return { ok: true, value: null };
  if (typeof v === "number") return fail(400, `${field} must be a JSON string, never a number (X IDs exceed JavaScript number precision).`);
  if (typeof v !== "string" || !X_POST_ID_RE.test(v)) return fail(400, `${field} must be a string of digits.`);
  return { ok: true, value: v };
}

function parseClaim(body: Record<string, unknown>): Parsed<{ mode: XMode; trigger: "manual" | "schedule"; executionId: string }> {
  const extra = unexpectedKeys(body, ["mode", "trigger", "executionId"]);
  if (extra) return fail(400, extra);
  if (body.mode !== "live" && body.mode !== "dry_run") return fail(400, 'mode must be "live" or "dry_run".');
  if (body.trigger !== "manual" && body.trigger !== "schedule") return fail(400, 'trigger must be "manual" or "schedule".');
  if (typeof body.executionId !== "string" || !EXECUTION_ID_RE.test(body.executionId)) {
    return fail(400, "executionId must be 1-64 characters of [A-Za-z0-9_-].");
  }
  return { ok: true, value: { mode: body.mode, trigger: body.trigger, executionId: body.executionId } };
}

function parseIdentity(body: Record<string, unknown>): Parsed<{ token: string; httpStatus: number | null; accountId: string | null }> {
  const extra = unexpectedKeys(body, ["token", "httpStatus", "accountId"]);
  if (extra) return fail(400, extra);
  const t = token(body);
  if (!t.ok) return t;
  const s = httpStatus(body.httpStatus);
  if (!s.ok) return s;
  if (typeof body.accountId === "number") return fail(400, "accountId must be a JSON string, never a number (X IDs exceed JavaScript number precision).");
  const accountId = typeof body.accountId === "string" && body.accountId.length <= 32 ? body.accountId : null;
  if (body.accountId !== null && body.accountId !== undefined && accountId === null) return fail(400, "accountId must be a string or null.");
  return { ok: true, value: { token: t.value, httpStatus: s.value, accountId } };
}

function parseDispatch(body: Record<string, unknown>): Parsed<{ token: string }> {
  const extra = unexpectedKeys(body, ["token"]);
  if (extra) return fail(400, extra);
  const t = token(body);
  return t.ok ? { ok: true, value: { token: t.value } } : t;
}

function optionalString(v: unknown, max: number, field: string): Parsed<string | null> {
  if (v === null || v === undefined || v === "") return { ok: true, value: null };
  if (typeof v !== "string") return fail(400, `${field} must be a string or null.`);
  return { ok: true, value: v.slice(0, max) };
}

function parseResult(body: Record<string, unknown>): Parsed<{ token: string; report: CreateReport }> {
  const extra = unexpectedKeys(body, ["token", "transportError", "httpStatus", "postId", "errorTitle", "rateLimitReset"]);
  if (extra) return fail(400, extra);
  const t = token(body);
  if (!t.ok) return t;
  if (typeof body.transportError !== "boolean") return fail(400, "transportError must be a boolean.");
  const s = httpStatus(body.httpStatus);
  if (!s.ok) return s;
  let postId: string | null = null;
  if (body.postId !== null && body.postId !== undefined) {
    if (typeof body.postId === "number") return fail(400, "postId must be a JSON string, never a number (X IDs exceed JavaScript number precision).");
    postId = typeof body.postId === "string" ? body.postId.slice(0, 32) : null;
    if (postId === null) return fail(400, "postId must be a string or null.");
  }
  const title = optionalString(body.errorTitle, 300, "errorTitle");
  if (!title.ok) return title;
  let reset: string | null = null;
  if (body.rateLimitReset !== null && body.rateLimitReset !== undefined && body.rateLimitReset !== "") {
    const raw = String(body.rateLimitReset);
    if (!/^\d{1,12}$/.test(raw)) return fail(400, "rateLimitReset must be epoch seconds.");
    reset = raw;
  }
  return {
    ok: true,
    value: {
      token: t.value,
      report: { transportError: body.transportError, httpStatus: s.value, postId, errorTitle: title.value, rateLimitReset: reset },
    },
  };
}

/** `data` is X's post object; only the fields used for verification are read. */
function parseLookupData(v: unknown): Parsed<LookupData | null> {
  if (v === null || v === undefined) return { ok: true, value: null };
  if (typeof v !== "object" || Array.isArray(v)) return fail(400, "data must be an object or null.");
  const d = v as Record<string, unknown>;
  const id = idString(d.id, "data.id");
  if (!id.ok) return id;
  const author = idString(d.author_id, "data.author_id");
  if (!author.ok) return author;
  if (d.text !== undefined && d.text !== null && (typeof d.text !== "string" || d.text.length > 2000)) {
    return fail(400, "data.text must be a string.");
  }
  const createdAt = typeof d.created_at === "string" ? d.created_at.slice(0, 40) : null;
  const urls: LookupData["urls"] = [];
  const entities = d.entities as Record<string, unknown> | undefined;
  if (entities && typeof entities === "object" && Array.isArray(entities.urls)) {
    if (entities.urls.length > 10) return fail(400, "Too many URL entities.");
    for (const u of entities.urls as Array<Record<string, unknown>>) {
      if (u && typeof u.url === "string" && typeof u.expanded_url === "string") {
        urls.push({ url: u.url.slice(0, 100), expandedUrl: u.expanded_url.slice(0, 2000) });
      }
    }
  }
  return {
    ok: true,
    value: { id: id.value, authorId: author.value, text: typeof d.text === "string" ? d.text : null, createdAt, urls },
  };
}

function parseLookup(body: Record<string, unknown>): Parsed<{ token: string; report: LookupReport }> {
  const extra = unexpectedKeys(body, ["token", "transportError", "httpStatus", "data"]);
  if (extra) return fail(400, extra);
  const t = token(body);
  if (!t.ok) return t;
  if (typeof body.transportError !== "boolean") return fail(400, "transportError must be a boolean.");
  const s = httpStatus(body.httpStatus);
  if (!s.ok) return s;
  const data = parseLookupData(body.data);
  if (!data.ok) return data;
  return { ok: true, value: { token: t.value, report: { transportError: body.transportError, httpStatus: s.value, data: data.value } } };
}

/**
 * Machine entry point for the n8n X publisher (separate token from the B1
 * connection test). Capabilities: claim one unit of work, report the account
 * check, request a one-time dispatch permit, report the create response, and
 * report lookup evidence. It cannot create, edit, approve, unpause, change
 * settings, or clear uncertainty. Never accepts cookies or query credentials.
 */
export async function handleXMachineRequest(
  request: Request,
  action: XMachineAction,
  options: { env?: Record<string, string | undefined>; now?: Date } = {}
): Promise<Response> {
  const env = options.env ?? process.env;
  const now = options.now ?? new Date();
  const config = getXPublishingConfig(env);

  if (!config.machine.enabled) return json(503, { error: "X publishing endpoints are not enabled." });
  if (new URL(request.url).search !== "") {
    return json(400, { error: "Query parameters are not accepted; send credentials in the Authorization header." });
  }
  if (env.VERCEL && request.headers.get("x-forwarded-proto") !== "https") return json(400, { error: "HTTPS required." });
  if (request.headers.get("cookie")) return json(400, { error: "Cookies are not accepted on machine endpoints." });
  const rate = limiter.take(now.getTime());
  if (!rate.ok) return json(429, { error: "Rate limit exceeded." }, { "Retry-After": String(rate.retryAfterSeconds) });
  if (!verifyXPublisherAuthorization(request.headers.get("authorization"), env)) {
    return json(401, { error: "Unauthorized." }, { "WWW-Authenticate": "Bearer" });
  }
  if (action.kind !== "claim" && !UUID_RE.test(action.attemptId)) return json(400, { error: "Invalid attemptId." });

  try {
    const schema = await getXPublishingSchemaState();
    if (!schema.initialized) return json(503, { error: "X publishing tables are not initialized." });

    const body = await readJsonObject(
      request,
      action.kind === "lookup" ? X_LOOKUP_MAX_BODY_BYTES : X_MACHINE_MAX_BODY_BYTES
    );
    if (!body.ok) return json(body.status, { error: body.error });

    let result: XResult;
    switch (action.kind) {
      case "claim": {
        const p = parseClaim(body.value);
        if (!p.ok) return json(p.status, { error: p.error });
        const gate = gateForMode(config, p.value.mode);
        if (!gate.enabled) return json(503, { work: null, error: gate.reason });
        result = await claimXWork({ ...p.value, now, autopilotReady: schema.autopilotReady, environment: config.environment });
        break;
      }
      case "identity": {
        const p = parseIdentity(body.value);
        if (!p.ok) return json(p.status, { error: p.error });
        result = await reportXIdentity({ attemptId: action.attemptId, ...p.value, now, config });
        break;
      }
      case "dispatch": {
        const p = parseDispatch(body.value);
        if (!p.ok) return json(p.status, { error: p.error });
        result = await requestXDispatchPermit({ attemptId: action.attemptId, token: p.value.token, now, config });
        break;
      }
      case "result": {
        const p = parseResult(body.value);
        if (!p.ok) return json(p.status, { error: p.error });
        result = await reportXCreateResult({ attemptId: action.attemptId, ...p.value, now });
        break;
      }
      case "lookup": {
        const p = parseLookup(body.value);
        if (!p.ok) return json(p.status, { error: p.error });
        result = await reportXLookup({ attemptId: action.attemptId, ...p.value, now });
        break;
      }
    }
    return json(result.status, result.body);
  } catch (error) {
    console.error("[x-publishing] machine request failed:", error instanceof Error ? error.message : error);
    return json(500, { error: "Internal error." });
  }
}
