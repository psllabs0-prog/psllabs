/**
 * OFFLINE (mocked) tests for approved X publishing: identity strings, time
 * and slot rules, content validation, approval hashing, response
 * classification, lookup verification, configuration gates, HTTP gate order,
 * admin CSRF, Mission Control event contract, and static/graph checks on the
 * n8n workflow exports. Every SQL statement goes to a recording fake; there is
 * no database and no network. The queue state machine itself is exercised
 * against real Postgres in test-x-publishing-db.ts.
 * Run: npm run test:x-publishing
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { NeonQueryFunction } from "@neondatabase/serverless";

import { __setSqlClientForTests } from "../lib/db/sql";
import { normalizeActivityEvent } from "../lib/ops/mission-control/events";
import { checkAdminCsrf, handleXAdminGet, handleXAdminPost, X_ADMIN_ACTION_HEADER, X_ADMIN_MAX_OFFSET, X_ADMIN_PAGE_SIZE } from "../lib/x-publishing/admin-api";
import { scheduleProblem } from "../lib/x-publishing/admin-store";
import { getXPublishingConfig, verifyXPublisherAuthorization } from "../lib/x-publishing/config";
import { X_ACCOUNT_ID, X_API, X_LIMITS } from "../lib/x-publishing/constants";
import {
  checkPostText,
  normalizeDraftText,
  X_CONTENT_POLICY_FILES,
  X_CONTENT_POLICY_VERSION,
} from "../lib/x-publishing/content";
import { recordXEvent, X_EVENT_TYPES } from "../lib/x-publishing/events";
import {
  __resetXMachineRateLimiterForTests,
  handleXMachineRequest,
  X_MACHINE_REQUESTS_PER_MINUTE,
  type XMachineAction,
} from "../lib/x-publishing/handlers";
import { approvalHash, canonicalJson, previewHash, textHash } from "../lib/x-publishing/hash";
import { formatPhoenix, isSlotAligned, parsePhoenixLocal, phoenixDay } from "../lib/x-publishing/time";
import { displayState, displayStateOf, isDispatchOverdue, isUnresolved, type XPostRecord } from "../lib/x-publishing/records";
import { readXPublishingPanel } from "../lib/x-publishing/summary";
import { classifyCreateResult, expandXText, verifyLookup } from "../lib/x-publishing/verify";

let passed = 0;
function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
  passed++;
}

const TOKEN = "x-publisher-test-token-0123456789abcdef-XYZ";
const UUID = "3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b";
const NOW = new Date("2026-09-29T18:00:00.000Z");

type FakeOpts = { tables: boolean; failOn?: RegExp };
function createFakeSql(opts: FakeOpts) {
  const calls: string[] = [];
  const run = (text: string): unknown[] => {
    calls.push(text);
    if (opts.failOn?.test(text)) throw Object.assign(new Error("simulated failure"), { code: "XX000" });
    if (/to_regclass/.test(text)) {
      const v = (name: string) => (opts.tables ? name : null);
      return [{ x_posts: v("x_publishing_posts"), x_attempts: v("x_publishing_attempts"), x_control: v("x_publishing_control") }];
    }
    return [];
  };
  const pending = (raw: string) => {
    const text = raw.replace(/\s+/g, " ").trim();
    return {
      text,
      then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
        Promise.resolve().then(() => run(text)).then(res, rej),
    };
  };
  const transactions: Array<{ readOnly?: boolean; isolationLevel?: string }> = [];
  const fn = ((strings: TemplateStringsArray) => pending(strings.join("$?"))) as unknown as NeonQueryFunction<false, false> & {
    transaction: unknown;
    query: unknown;
  };
  (fn as unknown as { query: (text: string) => unknown }).query = (text) => pending(text);
  (fn as unknown as {
    transaction: (q: Array<{ text: string }>, o?: { readOnly?: boolean; isolationLevel?: string }) => Promise<unknown[]>;
  }).transaction = async (q, o) => {
    transactions.push(o ?? {});
    return q.map((x) => run(x.text));
  };
  return { sql: fn as NeonQueryFunction<false, false>, calls, transactions };
}

const baseEnv = {
  X_PUBLISHER_TOKEN: TOKEN,
  X_EXPECTED_ACCOUNT_ID: X_ACCOUNT_ID,
};
const liveEnv = { ...baseEnv, VERCEL: "1", VERCEL_ENV: "production", X_PUBLISHING_ENABLED: "true" };

function machineRequest(
  path: string,
  body: unknown,
  init: { auth?: string | null; headers?: Record<string, string>; rawBody?: string } = {}
): Request {
  const headers: Record<string, string> = { "content-type": "application/json", "x-forwarded-proto": "https", ...init.headers };
  if (init.auth !== null) headers.authorization = init.auth ?? `Bearer ${TOKEN}`;
  return new Request(`https://psl.test/api/integrations/n8n/x-publishing/${path}`, {
    method: "POST",
    headers,
    body: init.rawBody ?? JSON.stringify(body),
  });
}

async function call(req: Request, action: XMachineAction, env: Record<string, string | undefined> = liveEnv) {
  __resetXMachineRateLimiterForTests();
  const res = await handleXMachineRequest(req, action, { env, now: NOW });
  return { status: res.status, body: (await res.json()) as Record<string, unknown>, headers: res.headers };
}

function testIdentityStrings() {
  assert(typeof X_ACCOUNT_ID === "string" && X_ACCOUNT_ID === "2094368418443280384", "account ID is the exact string");
  assert(BigInt(X_ACCOUNT_ID) > BigInt(Number.MAX_SAFE_INTEGER), "account ID exceeds MAX_SAFE_INTEGER");
  assert(String(Number(X_ACCOUNT_ID)) !== X_ACCOUNT_ID, "Number() would corrupt the account ID (why it stays a string)");
  const rounded = String(Number(X_ACCOUNT_ID));
  assert(!getXPublishingConfig({ ...liveEnv, X_EXPECTED_ACCOUNT_ID: rounded }).live.enabled, "a number-rounded expected ID fails closed");
}

function testTime() {
  const d = parsePhoenixLocal("2026-10-01T09:30");
  assert(d?.toISOString() === "2026-10-01T16:30:00.000Z", "Phoenix is UTC-7 (no DST)");
  assert(parsePhoenixLocal("2026-02-30T09:00") === null, "invalid dates rejected");
  assert(parsePhoenixLocal("2026-10-01 09:30") === null, "malformed input rejected");
  assert(isSlotAligned(d!) && !isSlotAligned(new Date("2026-10-01T16:45:00.000Z")), "30-minute slots");
  assert(phoenixDay(new Date("2026-10-02T06:59:00.000Z")) === "2026-10-01", "Phoenix day boundary at 07:00 UTC");
  assert(phoenixDay(new Date("2026-10-02T07:00:00.000Z")) === "2026-10-02", "Phoenix day rolls over at midnight local");
  assert(formatPhoenix(d!).includes("Phoenix"), "display labels the time zone");

  assert(scheduleProblem(null, NOW) !== null, "time required for scheduled approval");
  assert(/30-minute/.test(scheduleProblem("2026-09-30T16:15:00.000Z", NOW) ?? ""), "unaligned slot refused");
  assert(/passed/.test(scheduleProblem("2026-09-29T17:30:00.000Z", NOW) ?? ""), "past slot refused, never rescheduled");
  assert(/midnight/.test(scheduleProblem(parsePhoenixLocal("2026-10-01T23:30")!.toISOString(), NOW) ?? ""), "window crossing Phoenix midnight refused");
  assert(scheduleProblem(parsePhoenixLocal("2026-10-01T23:00")!.toISOString(), NOW) === null, "23:00 slot allowed (expires at midnight)");
  assert(/days ahead/.test(scheduleProblem("2026-11-15T16:00:00.000Z", NOW) ?? ""), "horizon enforced");
}

function codes(text: string) {
  const c = checkPostText(normalizeDraftText(text));
  return { errors: c.errors.map((e) => e.code), warnings: c.warnings.map((w) => w.code), check: c };
}

function testContent() {
  const ok = codes("New lot COAs are live at https://psllabs.org/coa — third-party HPLC and MS for every batch.");
  assert(ok.errors.length === 0 && ok.warnings.length === 0, `clean post passes: ${ok.errors.join(",")} ${ok.warnings.join(",")}`);
  assert(ok.check.links[0] === "https://psllabs.org/coa", "links extracted in full");

  assert(codes("x".repeat(280)).check.ok && !codes("x".repeat(281)).check.ok, "280 weighted-character limit");
  assert(!codes("中".repeat(141)).check.ok && codes("中".repeat(140)).check.ok, "CJK counts double (twitter-text weighting)");
  assert(codes("🧪".repeat(140)).check.ok && !codes("🧪".repeat(141)).check.ok, "emoji weighting");
  assert(codes("hello @someone").errors.includes("mention"), "mentions blocked");
  assert(!codes("email support@psllabs.org for COAs").errors.includes("mention"), "email address is not a mention");
  assert(codes("see http://psllabs.org").errors.includes("link_not_https"), "http blocked");
  assert(codes("see psllabs.org/coa").errors.includes("link_not_https"), "bare domains must be written with https://");
  assert(codes("see https://bit.ly/abc").errors.includes("link_shortener"), "shorteners blocked");
  assert(codes("see https://1.2.3.4/x").errors.length > 0, "IP links blocked");
  assert(codes("see https://user:pw@psllabs.org/x").errors.length > 0, "credential links blocked");
  assert(codes("a\u200bb").errors.includes("hidden_characters"), "zero-width characters blocked");
  assert(codes("a https://psllabs.org https://psllabs.org/a https://psllabs.org/b").errors.includes("too_many_links"), "link count limit");
  for (const [text, code] of [
    ["Recommended dosing for BPC-157", "claim:dosing"],
    ["It cures everything", "claim:treat_cure_heal"],
    ["Great for weight loss", "claim:weight_loss"],
    ["You will feel better", "claim:outcome_promise"],
    ["For human use", "claim:human_use"],
    ["A natural Ozempic", "claim:drug_comparison"],
    ["Clinically proven purity", "claim:clinically_proven"],
  ] as const) {
    assert(codes(text).errors.includes(code), `prohibited claim blocked: ${code}`);
  }
  assert(codes("This boosts output").warnings.includes("claim:biomarker_claim"), "boost claim requires acknowledgement");
  assert(codes("Lab safety first").warnings.includes("claim:safety_efficacy"), "safety language requires acknowledgement");
  assert(codes("Read https://example.com/paper").warnings.includes("external_link:example.com"), "external links require acknowledgement");

  assert(normalizeDraftText("  Cafe\u0301\r\nline  ") === "Café\nline", "normalize: NFC, CRLF→LF, trim (before preview only)");
  assert(checkPostText(" padded").errors.some((e) => e.code === "not_normalized"), "unnormalized text cannot be approved");
}

function testHashes() {
  assert(canonicalJson({ b: 1, a: [2, { d: 1, c: 2 }] }) === canonicalJson({ a: [2, { c: 2, d: 1 }], b: 1 }), "canonical JSON is key-order independent");
  const base = {
    postId: UUID, accountId: X_ACCOUNT_ID, text: "t", revision: 1, isTest: false,
    scheduleKind: "scheduled" as const, scheduledFor: "2026-10-01T16:30:00.000Z", validityMinutes: null,
    links: [] as string[], sourceRefs: [] as string[], policyVersion: X_CONTENT_POLICY_VERSION,
  };
  const h = previewHash(base);
  for (const [k, v] of Object.entries({
    text: "t2", revision: 2, scheduledFor: "2026-10-01T17:00:00.000Z", scheduleKind: "next_manual_run",
    sourceRefs: ["x"], policyVersion: "other", accountId: "1", isTest: true, links: ["https://psllabs.org"],
  })) {
    assert(previewHash({ ...base, [k]: v }) !== h, `preview hash binds ${k}`);
  }
  const a = { previewHash: h, approvedAt: NOW.toISOString(), scheduledFor: base.scheduledFor, expiresAt: "2026-10-01T17:30:00.000Z", approvedEnv: "production", acknowledgedWarnings: ["b", "a"] };
  assert(approvalHash(a) === approvalHash({ ...a, acknowledgedWarnings: ["a", "b"] }), "warning order does not matter");
  assert(approvalHash(a) !== approvalHash({ ...a, expiresAt: "2026-10-01T17:31:00.000Z" }), "approval hash binds expiry");
  assert(approvalHash(a) !== approvalHash({ ...a, approvedEnv: "preview" }), "approval hash binds environment");
  assert(textHash(X_ACCOUNT_ID, "a") !== textHash("1", "a"), "duplicate key is per account");
}

function testClassification() {
  const r = (httpStatus: number | null, postId: string | null = null, extra: Partial<Parameters<typeof classifyCreateResult>[0]> = {}) =>
    classifyCreateResult({ transportError: false, httpStatus, postId, errorTitle: null, rateLimitReset: null, ...extra });
  const created = r(201, "1987654321098765432");
  assert(created.kind === "created" && created.postId === "1987654321098765432", "201 + ID → created (string ID preserved)");
  assert(r(201).kind === "uncertain", "201 without ID → uncertain");
  assert(r(201, "12abc").kind === "uncertain", "201 with malformed ID → uncertain");
  for (const s of [400, 401, 403, 404, 422]) assert(r(s).kind === "rejected", `${s} → rejected`);
  const limited = r(429, null, { rateLimitReset: "1790000000" });
  assert(limited.kind === "rejected" && limited.rateLimitResetAt === new Date(1790000000 * 1000).toISOString(), "429 → rejected with reset time");
  for (const s of [408, 500, 502, 503, 504]) assert(r(s).kind === "uncertain", `${s} → uncertain (never retried)`);
  assert(classifyCreateResult({ transportError: true, httpStatus: null, postId: null, errorTitle: null, rateLimitReset: null }).kind === "uncertain", "timeout/network → uncertain");
}

function testLookup() {
  const text = "COAs: https://psllabs.org/coa & more";
  const data = (over: Partial<{ id: string; authorId: string; text: string }> = {}) => ({
    id: "1987654321098765432",
    authorId: X_ACCOUNT_ID,
    text: "COAs: https://t.co/abc123 &amp; more",
    createdAt: "2026-09-29T18:00:01.000Z",
    urls: [{ url: "https://t.co/abc123", expandedUrl: "https://psllabs.org/coa" }],
    ...over,
  });
  const v = (d: ReturnType<typeof data> | null, httpStatus: number | null = 200, transportError = false) =>
    verifyLookup({ expectedPostId: "1987654321098765432", expectedAuthorId: X_ACCOUNT_ID, approvedText: text, report: { transportError, httpStatus, data: d } });
  assert(expandXText("a https://t.co/x", [{ url: "https://t.co/x", expandedUrl: "https://psllabs.org/" }]) === "a https://psllabs.org/", "t.co expansion");
  assert(v(data()).kind === "confirmed", "ID + author + text (t.co, &amp;) → confirmed");
  assert(
    verifyLookup({ expectedPostId: "1", expectedAuthorId: X_ACCOUNT_ID, approvedText: "see https://psllabs.org", report: { transportError: false, httpStatus: 200, data: { id: "1", authorId: X_ACCOUNT_ID, text: "see https://t.co/q", createdAt: null, urls: [{ url: "https://t.co/q", expandedUrl: "https://psllabs.org/" }] } } }).kind === "confirmed",
    "trailing-slash URL normalization by X tolerated"
  );
  assert(v(data({ authorId: "2094368418443280385" })).kind === "mismatch", "author mismatch");
  assert(v(data({ id: "1" })).kind === "mismatch", "ID mismatch");
  assert(v(data({ text: "different" })).kind === "mismatch", "text mismatch");
  assert(v(null, 404).kind === "retry", "404 → retry read-only");
  assert(v(null, null, true).kind === "retry", "transport failure → retry read-only");
  assert(v(null, 429).kind === "retry", "429 → retry read-only");
}

function testConfig() {
  const off = getXPublishingConfig({});
  assert(!off.machine.enabled && !off.live.enabled && !off.dryRun.enabled, "everything off by default");
  assert(off.admin.mode === "disabled", "admin disabled without expected account");
  assert(!getXPublishingConfig({ ...liveEnv, X_PUBLISHER_TOKEN: "short" }).machine.enabled, "short token refused");
  assert(!getXPublishingConfig({ ...liveEnv, MISSION_CONTROL_N8N_TOKEN: TOKEN }).machine.enabled, "reusing the B1 n8n token refused");
  assert(!getXPublishingConfig({ ...liveEnv, ADMIN_PASSWORD: `x${TOKEN}x` }).machine.enabled, "token embedded in another secret refused");
  const live = getXPublishingConfig(liveEnv);
  assert(live.live.enabled && live.admin.mode === "live" && !live.dryRun.enabled, "production + flag + account → live; dry-run refused on Vercel");
  assert(!getXPublishingConfig({ ...liveEnv, X_PUBLISHING_ENABLED: undefined }).live.enabled, "live requires X_PUBLISHING_ENABLED");
  assert(!getXPublishingConfig({ ...liveEnv, X_EXPECTED_ACCOUNT_ID: undefined }).live.enabled, "missing expected account fails closed");
  const preview = getXPublishingConfig({ ...liveEnv, VERCEL_ENV: "preview", X_PUBLISHING_DRY_RUN_ENABLED: "true" });
  assert(!preview.machine.enabled && !preview.live.enabled && !preview.dryRun.enabled && preview.admin.mode === "disabled", "Preview: no machine access, no live, no dry-run, read-only admin");
  const local = getXPublishingConfig({ ...baseEnv, X_PUBLISHING_ENABLED: "true", X_PUBLISHING_DRY_RUN_ENABLED: "true" });
  assert(!local.live.enabled && local.dryRun.enabled && local.admin.mode === "test", "local: never live; dry-run and TEST items only");
  assert(verifyXPublisherAuthorization(`Bearer ${TOKEN}`, liveEnv) && !verifyXPublisherAuthorization(`Bearer ${TOKEN}x`, liveEnv), "bearer check");
  assert(!verifyXPublisherAuthorization(TOKEN, liveEnv), "raw token without Bearer refused");
}

function testPolicyDrift() {
  const expected = X_CONTENT_POLICY_FILES.map((file) => {
    const text = readFileSync(join(process.cwd(), file), "utf8");
    assert(/^status:\s*approved\s*$/m.test(text), `${file} is approved guidance`);
    const reviewed = /^last_reviewed:\s*(\S+)\s*$/m.exec(text)?.[1];
    assert(reviewed, `${file} has last_reviewed`);
    return `${file.replace("ops-knowledge/", "").replace(/\.md$/, "")}@${reviewed}`;
  }).join(";");
  assert(expected === X_CONTENT_POLICY_VERSION, `content policy drift — recheck lib/x-publishing/content.ts rules: ${expected}`);
}

async function testMachineGates() {
  const fake = createFakeSql({ tables: true });
  __setSqlClientForTests(fake.sql);
  const claim = { mode: "live", trigger: "manual", executionId: "123" };

  let r = await call(machineRequest("claim", claim), { kind: "claim" }, {});
  assert(r.status === 503 && fake.calls.length === 0, "no token configured → 503 before any SQL");
  r = await call(machineRequest("claim", claim), { kind: "claim" }, { ...liveEnv, VERCEL_ENV: "preview" });
  assert(r.status === 503 && fake.calls.length === 0, "Preview → 503 (no override)");
  r = await call(new Request("https://psl.test/api/integrations/n8n/x-publishing/claim?token=x", { method: "POST", headers: { authorization: `Bearer ${TOKEN}`, "x-forwarded-proto": "https" }, body: "{}" }), { kind: "claim" });
  assert(r.status === 400 && fake.calls.length === 0, "query strings refused");
  r = await call(machineRequest("claim", claim, { headers: { "x-forwarded-proto": "http" } }), { kind: "claim" });
  assert(r.status === 400 && fake.calls.length === 0, "HTTPS required on Vercel");
  r = await call(machineRequest("claim", claim, { headers: { cookie: "psl_admin_session=abc" } }), { kind: "claim" });
  assert(r.status === 400 && fake.calls.length === 0, "admin cookies refused on machine endpoints");
  r = await call(machineRequest("claim", claim, { auth: "Bearer wrong-token-wrong-token-wrong-token-1" }), { kind: "claim" });
  assert(r.status === 401 && r.headers.get("www-authenticate") === "Bearer" && fake.calls.length === 0, "bad bearer → 401 before SQL");
  r = await call(machineRequest("claim", claim, { auth: null }), { kind: "claim" });
  assert(r.status === 401 && fake.calls.length === 0, "missing bearer → 401");
  r = await call(machineRequest("attempts/nope/identity", {}), { kind: "identity", attemptId: "nope" });
  assert(r.status === 400 && fake.calls.length === 0, "attemptId must be a UUID");

  __resetXMachineRateLimiterForTests();
  let limited = 0;
  for (let i = 0; i < X_MACHINE_REQUESTS_PER_MINUTE + 1; i++) {
    const res = await handleXMachineRequest(machineRequest("claim", claim, { auth: "Bearer x" }), { kind: "claim" }, { env: liveEnv, now: NOW });
    if (res.status === 429) limited++;
  }
  assert(limited === 1, "rate limit applies before authentication");

  const missing = createFakeSql({ tables: false });
  __setSqlClientForTests(missing.sql);
  r = await call(machineRequest("claim", claim), { kind: "claim" });
  assert(r.status === 503 && missing.calls.length === 1 && /to_regclass/.test(missing.calls[0]), "schema missing → 503, catalog probe only (no DDL)");

  __setSqlClientForTests(fake.sql);
  fake.calls.length = 0;
  r = await call(machineRequest("claim", claim), { kind: "claim" }, { ...liveEnv, X_PUBLISHING_ENABLED: "false" });
  assert(r.status === 503 && r.body.work === null && fake.calls.every((c) => /to_regclass/.test(c)), "live disabled → no claim, no X work");
  r = await call(machineRequest("claim", { ...claim, mode: "dry_run" }), { kind: "claim" });
  assert(r.status === 503 && fake.calls.every((c) => /to_regclass/.test(c)), "dry-run refused on Vercel/production");
  r = await call(machineRequest("claim", { ...claim, extra: 1 }), { kind: "claim" });
  assert(r.status === 400 && /Unexpected/.test(String(r.body.error)), "strict JSON: unknown fields refused");
  r = await call(machineRequest("claim", null, { rawBody: "x".repeat(5000) }), { kind: "claim" });
  assert(r.status === 413, "oversized body refused");
  r = await call(machineRequest("claim", claim, { headers: { "content-type": "text/plain" } }), { kind: "claim" });
  assert(r.status === 415, "JSON content type required");

  const tok = "A".repeat(43);
  r = await call(machineRequest(`attempts/${UUID}/identity`, { token: tok, httpStatus: 200, accountId: 2094368418443280384 }), { kind: "identity", attemptId: UUID });
  assert(r.status === 400 && /never a number/.test(String(r.body.error)), "numeric accountId refused (precision loss)");
  r = await call(machineRequest(`attempts/${UUID}/result`, { token: tok, transportError: false, httpStatus: 201, postId: 1987654321098765432, errorTitle: null, rateLimitReset: null }), { kind: "result", attemptId: UUID });
  assert(r.status === 400 && /never a number/.test(String(r.body.error)), "numeric postId refused (precision loss)");
  r = await call(machineRequest(`attempts/${UUID}/lookup`, { token: tok, transportError: false, httpStatus: 200, data: { id: 1, author_id: X_ACCOUNT_ID, text: "x" } }), { kind: "lookup", attemptId: UUID });
  assert(r.status === 400, "numeric lookup ID refused");
  r = await call(machineRequest(`attempts/${UUID}/dispatch`, { token: "short" }), { kind: "dispatch", attemptId: UUID });
  assert(r.status === 400, "malformed work token refused");
  const writes = fake.calls.filter((c) => /\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/i.test(c));
  assert(writes.length === 0, "no writes on any refused request");
  __setSqlClientForTests(null);
}

async function testAdmin() {
  const h = (extra: Record<string, string>) => new Headers({ host: "psllabs.org", ...extra });
  assert(checkAdminCsrf(h({})) !== null, "admin mutation needs the custom header");
  assert(checkAdminCsrf(h({ [X_ADMIN_ACTION_HEADER]: "1", origin: "https://evil.example" })) !== null, "cross-origin refused");
  assert(checkAdminCsrf(h({ [X_ADMIN_ACTION_HEADER]: "1", origin: "https://psllabs.org" })) === null, "same origin accepted");
  assert(checkAdminCsrf(h({ [X_ADMIN_ACTION_HEADER]: "1" })) !== null, "no Origin and no Sec-Fetch-Site refused");
  assert(checkAdminCsrf(h({ [X_ADMIN_ACTION_HEADER]: "1", "sec-fetch-site": "same-origin" })) === null, "Sec-Fetch-Site same-origin accepted");

  const fake = createFakeSql({ tables: true });
  __setSqlClientForTests(fake.sql);
  const post = (body: unknown, headers: Record<string, string> = { [X_ADMIN_ACTION_HEADER]: "1", origin: "https://psllabs.org", host: "psllabs.org" }) =>
    new Request("https://psllabs.org/api/admin/x-publishing", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

  let r = await handleXAdminPost(post({ action: "pause" }, { host: "psllabs.org", origin: "https://evil.example", [X_ADMIN_ACTION_HEADER]: "1" }), { env: liveEnv, now: NOW });
  assert(r.status === 403 && fake.calls.length === 0, "CSRF refused before any SQL");
  r = await handleXAdminPost(post({ action: "pause" }), { env: { ...liveEnv, VERCEL_ENV: "preview" }, now: NOW });
  assert(r.status === 503 && fake.calls.length === 0, "Preview cannot change the queue");
  r = await handleXAdminPost(post({ action: "approve", id: UUID, expectedRevision: 1, scheduleKind: "scheduled", previewHash: "0".repeat(64) }), { env: { ...liveEnv, X_EXPECTED_ACCOUNT_ID: undefined }, now: NOW });
  assert(r.status === 503, "approval fails closed without the expected account ID");

  const missing = createFakeSql({ tables: false });
  __setSqlClientForTests(missing.sql);
  const g = await handleXAdminGet({ env: liveEnv, now: NOW });
  assert(g.status === 200 && g.body.initialized === false && typeof g.body.migrationRequired === "string", "GET with schema missing degrades gracefully");
  assert(missing.calls.every((c) => !/\b(CREATE|ALTER|INSERT|UPDATE)\b/i.test(c)), "GET never runs DDL or writes");
  r = await handleXAdminPost(post({ action: "pause" }), { env: liveEnv, now: NOW });
  assert(r.status === 503, "mutations refused while schema missing");

  __setSqlClientForTests(fake.sql);
  fake.calls.length = 0;
  fake.transactions.length = 0;
  const empty = await handleXAdminGet({ env: liveEnv, now: NOW, query: new URLSearchParams("reviewOffset=-5&openOffset=abc&historyOffset=99999999999") });
  type SectionBody = { total: number; offset: number; limit: number; posts: unknown[] };
  const sections = empty.body.sections as Record<"review" | "open" | "history", SectionBody>;
  assert(
    empty.status === 200 && empty.body.totalPosts === 0 && !("posts" in empty.body) &&
      (["review", "open", "history"] as const).every((s) => sections[s].total === 0 && sections[s].posts.length === 0),
    "empty queue reads fine (exact totals, per-section pages)"
  );
  assert(sections.review.offset === 0 && sections.open.offset === 0 && sections.history.offset === X_ADMIN_MAX_OFFSET, "invalid offsets fall back to 0; huge offsets are capped");
  assert(sections.review.limit === X_ADMIN_PAGE_SIZE.review && sections.history.limit === X_ADMIN_PAGE_SIZE.history, "section pages are bounded");
  assert((empty.body.account as { id: string }).id === X_ACCOUNT_ID, "GET exposes the account ID as a string");
  assert(fake.calls.every((c) => !/\b(CREATE|ALTER|INSERT|UPDATE|DELETE)\b/i.test(c)), "GET is read-only");
  assert(
    fake.transactions.length === 1 && fake.transactions[0].readOnly === true && fake.transactions[0].isolationLevel === "RepeatableRead",
    "GET counts and pages come from one READ ONLY snapshot"
  );
  const tallySql = fake.calls.find((c) => /GROUP BY/i.test(c)) ?? "";
  assert(!/\bLIMIT\b/i.test(tallySql) && /is_test = \$1/.test(tallySql), "counts are not limited and stay within one TEST/live partition");

  fake.calls.length = 0;
  fake.transactions.length = 0;
  const panel = await readXPublishingPanel(NOW);
  assert(panel.initialized && panel.totalPosts === 0 && panel.attentionTotal === 0, "Mission Control panel reads exact totals");
  assert(fake.calls.every((c) => !/\b(CREATE|ALTER|INSERT|UPDATE|DELETE)\b/i.test(c)), "Mission Control panel read is read-only");
  assert(fake.transactions.length === 1 && fake.transactions[0].readOnly === true, "panel uses one READ ONLY snapshot");
  assert(fake.calls.some((c) => /is_test = \$1/.test(c)), "panel queries are partitioned by is_test");
  __setSqlClientForTests(null);
}

async function testEvents() {
  const ok = normalizeActivityEvent({
    sourceEventKey: `x_publishing:${UUID}:r1:-:x_post_approved:`,
    sourceSystem: "x_publishing",
    worker: "x_publishing",
    eventType: X_EVENT_TYPES.approved,
    outcome: "accepted",
    observation: "live",
    occurredAt: NOW.toISOString(),
    summary: "X post approved",
  });
  assert(ok !== null, "x_publishing actor accepted with its own key namespace");
  assert(normalizeActivityEvent({ ...ok!, sourceEventKey: "support:1" }) === null, "x_publishing cannot write outside its namespace");
  assert(normalizeActivityEvent({ ...ok!, worker: "finance" }) === null, "business workers cannot use the x_publishing namespace");
  assert(normalizeActivityEvent({ ...ok!, worker: "n8n", sourceSystem: "n8n" }) === null, "the B1 n8n actor cannot write X events");

  const prev = process.env.MISSION_CONTROL_SYNC_ENABLED;
  const failing = createFakeSql({ tables: true, failOn: /INSERT INTO ops_activity_events/ });
  __setSqlClientForTests(failing.sql);
  process.env.MISSION_CONTROL_SYNC_ENABLED = "true";
  await recordXEvent({ type: X_EVENT_TYPES.published, outcome: "completed", summary: "s", queueId: UUID, revision: 1, isTest: false, now: NOW });
  assert(failing.calls.length === 1, "event insert attempted and its failure swallowed (queue unaffected)");
  process.env.MISSION_CONTROL_SYNC_ENABLED = "false";
  failing.calls.length = 0;
  await recordXEvent({ type: X_EVENT_TYPES.published, outcome: "completed", summary: "s", queueId: UUID, revision: 1, isTest: false, now: NOW });
  assert(failing.calls.length === 0, "no event writes when Mission Control writes are off");
  if (prev === undefined) delete process.env.MISSION_CONTROL_SYNC_ENABLED;
  else process.env.MISSION_CONTROL_SYNC_ENABLED = prev;
  __setSqlClientForTests(null);
}

function testDerivedStates() {
  const deadline = new Date(NOW.getTime() - 60_000).toISOString();
  const future = new Date(NOW.getTime() + 60_000).toISOString();
  const overdue = { state: "dispatched" as const, dispatchDeadline: deadline, resultReceivedAt: null };
  assert(isDispatchOverdue(overdue, NOW), "dispatched past deadline without a receipt is overdue");
  assert(!isDispatchOverdue({ ...overdue, dispatchDeadline: future }, NOW), "within the deadline is not overdue");
  assert(!isDispatchOverdue({ ...overdue, resultReceivedAt: deadline }, NOW), "a recorded receipt is never overdue");
  for (const state of ["created", "published", "rejected", "uncertain"] as const) {
    assert(!isDispatchOverdue({ ...overdue, state }, NOW), `an old ${state} attempt is not overdue (never downgraded)`);
  }
  assert(!isDispatchOverdue(null, NOW) && !isDispatchOverdue({ ...overdue, dispatchDeadline: null }, NOW), "no attempt or no deadline is not overdue");

  assert(displayStateOf({ status: "dispatched", approvalExpired: false, dispatchOverdue: true }) === "uncertain", "overdue dispatch displays as outcome unknown");
  assert(displayStateOf({ status: "dispatched", approvalExpired: false, dispatchOverdue: false }) === "awaiting_confirmation", "in-deadline dispatch awaits confirmation");
  assert(displayStateOf({ status: "created", approvalExpired: false, dispatchOverdue: false }) === "created_unconfirmed", "created displays as created, lookup not confirmed");
  assert(displayStateOf({ status: "published", approvalExpired: false, dispatchOverdue: true }) === "published", "published stays published");
  assert(displayStateOf({ status: "rejected", approvalExpired: false, dispatchOverdue: true }) === "rejected", "confirmed rejection stays rejected");

  const post = (status: XPostRecord["status"], activeAttempt: XPostRecord["activeAttempt"], reviewRequired = false) =>
    ({ status, activeAttempt, reviewRequired, expiresAt: null }) as unknown as XPostRecord;
  assert(displayState(post("dispatched", overdue), NOW) === "uncertain" && isUnresolved(post("dispatched", overdue), NOW), "overdue post is unresolved from its own attempt receipts");
  assert(!isUnresolved(post("dispatched", { ...overdue, dispatchDeadline: future }), NOW), "in-deadline dispatch is not yet unresolved");
  assert(!isUnresolved(post("published", { ...overdue, state: "published", resultReceivedAt: deadline }), NOW), "old published result is not unresolved");
  assert(isUnresolved(post("created", null, true), NOW), "review-required item is unresolved");
}

function testWorkflowWording() {
  const readme = readFileSync(join(process.cwd(), "integrations/n8n/X_PUBLISHER_README.md"), "utf8");
  const files = ["psl-x-publisher.workflow.json", "psl-x-publisher-dry-run.workflow.json"];
  const misleading = [/result was NOT recorded/i, /\bNot published\b/i, /result not recorded/i, /lookup not recorded/i];
  for (const [label, text] of [...files.map((f) => [f, loadWorkflow(f).raw] as const), ["README", readme] as const]) {
    for (const re of misleading) assert(!re.test(text), `${label}: no misleading wording ${re}`);
  }
  for (const f of files) {
    const { wf } = loadWorkflow(f);
    const names = wf.nodes.map((n) => n.name);
    for (const ending of ["Stop: X rejected the post (confirmed)", "Stop: outcome unknown (review required)", "Stop: created on X (ID recorded), lookup not confirmed"]) {
      assert(names.includes(ending), `${f}: has ending "${ending}"`);
    }
    assert(names.some((n) => n.startsWith("Published and verified")), `${f}: has "Published and verified" ending`);
    const msg = (name: string) => String(wf.nodes.find((n) => n.name === name)?.parameters.errorMessage ?? "");
    const unknown = msg("Stop: outcome unknown (review required)");
    assert(/may or may not exist|UNKNOWN/.test(unknown) && /Do NOT re-run/i.test(unknown), `${f}: outcome unknown says the post may exist and not to re-run`);
    assert(unknown.includes("evidence.httpStatus") && unknown.includes("evidence.postId") && unknown.includes("work.attemptId"), `${f}: outcome unknown keeps HTTP status, post ID, and attempt ID`);
    assert(/Confirmation not received/.test(unknown), `${f}: missing confirmation is worded as not received, not as failure`);
    assert(/not posted/i.test(msg("Stop: X rejected the post (confirmed)")), `${f}: only the confirmed rejection says not posted`);
    const lookupStop = msg("Stop: created on X (ID recorded), lookup not confirmed");
    assert(/xPostId/.test(lookupStop) && /attemptId/.test(lookupStop) && /not a failed post/i.test(lookupStop), `${f}: lookup-not-confirmed keeps IDs and is not a failure`);
    const rejectedIf = String(JSON.stringify(wf.nodes.find((n) => n.name === "Rejected by X?")?.parameters));
    assert(rejectedIf.includes("state === 'rejected'") && rejectedIf.includes("retry === false") && rejectedIf.includes("review !== true"), `${f}: rejection branch requires a confirmed, unflagged rejection`);
    const outputs = (name: string) => (wf.connections[name]?.main ?? []).map((o) => o.map((t) => t.node));
    const report = outputs("Report create result");
    assert(report[0]?.[0] === "Verify now?" && report[1]?.[0] === "Stop: outcome unknown (review required)", `${f}: an unconfirmed create report ends at outcome unknown`);
    assert(outputs("Rejected by X?")[1]?.[0] === "Stop: outcome unknown (review required)", `${f}: anything other than a confirmed rejection ends at outcome unknown`);
    const lookupReport = outputs("Report lookup evidence");
    assert(lookupReport[0]?.[0] === "Verified?" && lookupReport[1]?.[0] === "Stop: created on X (ID recorded), lookup not confirmed", `${f}: an unconfirmed lookup report keeps the created-with-ID wording`);
    assert(outputs("Verified?")[1]?.[0] === "Stop: created on X (ID recorded), lookup not confirmed", `${f}: an unverified lookup keeps the created-with-ID wording`);
    for (const name of ["Report create result", "Report lookup evidence"]) {
      const node = wf.nodes.find((n) => n.name === name) as N8nNode & { maxTries?: number };
      assert(node.retryOnFail === true && node.onError === "continueErrorOutput", `${f}: ${name} keeps its idempotent retries`);
    }
    const create = wf.nodes.find((n) => n.name === "Create Post on X" || n.name === "Simulated Create Post (no X call)")!.name;
    const after = reachableFrom(wf, create);
    assert(!after.has(create) && ![...after].some((n) => /Create Post/.test(n)), `${f}: no path from the create outcome back to a Create Post`);
    assert(predecessors(wf, "Create response evidence").every((p) => p.from === create), `${f}: evidence node follows only the create step`);
  }
}

type N8nNode = { name: string; type: string; parameters: Record<string, unknown>; retryOnFail?: boolean; credentials?: unknown; onError?: string };
type N8nWorkflow = { active: boolean; nodes: N8nNode[]; connections: Record<string, { main: Array<Array<{ node: string }>> }> };

function loadWorkflow(file: string): { wf: N8nWorkflow; raw: string } {
  const raw = readFileSync(join(process.cwd(), "integrations/n8n", file), "utf8");
  return { wf: JSON.parse(raw) as N8nWorkflow, raw };
}

const isHttp = (n: N8nNode) => n.type === "n8n-nodes-base.httpRequest";
const isX = (n: N8nNode) => isHttp(n) && String(n.parameters.url).includes("api.x.com");
const isPsl = (n: N8nNode) => isHttp(n) && !isX(n);

function predecessors(wf: N8nWorkflow, name: string): Array<{ from: string; output: number }> {
  const out: Array<{ from: string; output: number }> = [];
  for (const [from, c] of Object.entries(wf.connections)) {
    c.main.forEach((targets, output) => targets.forEach((t) => t.node === name && out.push({ from, output })));
  }
  return out;
}

function reachableFrom(wf: N8nWorkflow, start: string): Set<string> {
  const seen = new Set<string>();
  const stack = [...(wf.connections[start]?.main.flat().map((t) => t.node) ?? [])];
  while (stack.length) {
    const n = stack.pop()!;
    if (seen.has(n)) continue;
    seen.add(n);
    stack.push(...(wf.connections[n]?.main.flat().map((t) => t.node) ?? []));
  }
  return seen;
}

function commonWorkflowChecks(label: string, wf: N8nWorkflow, raw: string) {
  assert(wf.active === false, `${label}: imports inactive`);
  const triggers = wf.nodes.filter((n) => /trigger|webhook|cron|schedule/i.test(n.type));
  assert(triggers.length === 1 && triggers[0].type === "n8n-nodes-base.manualTrigger", `${label}: Manual Trigger only`);
  assert(!/"credentials"\s*:/.test(raw), `${label}: no credential blocks or IDs`);
  assert(!raw.includes(X_ACCOUNT_ID) && !/\d{15,}/.test(raw), `${label}: no account or post IDs embedded`);
  assert(!/Bearer\s+[A-Za-z0-9]/.test(raw) && !/client_?secret|access_?token|refresh_?token/i.test(raw), `${label}: no secrets`);
  assert(!wf.nodes.some((n) => /langchain|openAi|anthropic|lmChat|agent|\.code$|function/i.test(n.type)), `${label}: no LLM or code nodes`);
  for (const n of wf.nodes.filter(isHttp)) {
    const redirect = (n.parameters.options as { redirect?: { redirect?: { followRedirects?: boolean } } })?.redirect?.redirect;
    assert(redirect?.followRedirects === false, `${label}: ${n.name} disables redirects`);
  }
  for (const n of wf.nodes.filter(isPsl)) {
    assert(n.parameters.genericAuthType === "httpHeaderAuth", `${label}: ${n.name} uses Header Auth`);
    assert(String(n.parameters.url).startsWith("={{ $('Config').first().json.pslBaseUrl }}/api/integrations/n8n/x-publishing/"), `${label}: ${n.name} targets the X publishing route family`);
  }
  for (const [from, c] of Object.entries(wf.connections)) {
    for (const t of c.main.flat()) assert(wf.nodes.some((n) => n.name === t.node) && wf.nodes.some((n) => n.name === from), `${label}: connection ${from} → ${t.node} valid`);
  }
}

function readmeCounts(): { live: Record<string, number>; dryTotal: number; dryHttp: number } {
  const readme = readFileSync(join(process.cwd(), "integrations/n8n/X_PUBLISHER_README.md"), "utf8");
  const m = /### Nodes \((\d+) total: (\d+) HTTP Request, (\d+) IF, (\d+) Stop and Error, (\d+) Set, (\d+) No-Op, (\d+) Manual Trigger, (\d+) Sticky Note\)/.exec(readme);
  assert(m, "README states live node counts");
  const d = /\((\d+) nodes: (\d+) HTTP Request, all to\s+PSL/.exec(readme);
  assert(d, "README states dry-run node counts");
  const [total, http, ifs, stop, set, noop, manual, sticky] = m.slice(1).map(Number);
  assert(readme.includes("PSL X Queue") && readme.includes("PSL X Publishing"), "README names both credentials");
  return { live: { total, http, ifs, stop, set, noop, manual, sticky }, dryTotal: Number(d[1]), dryHttp: Number(d[2]) };
}

function testWorkflows() {
  const { wf, raw } = loadWorkflow("psl-x-publisher.workflow.json");
  commonWorkflowChecks("live", wf, raw);
  const byType = (t: string) => wf.nodes.filter((n) => n.type === `n8n-nodes-base.${t}`).length;
  const counts = readmeCounts();
  assert(wf.nodes.length === counts.live.total, `README total nodes = JSON (${wf.nodes.length})`);
  assert(byType("httpRequest") === counts.live.http && byType("if") === counts.live.ifs && byType("stopAndError") === counts.live.stop, "README HTTP/IF/Stop counts = JSON");
  assert(byType("set") === counts.live.set && byType("noOp") === counts.live.noop && byType("manualTrigger") === counts.live.manual && byType("stickyNote") === counts.live.sticky, "README Set/No-Op/Trigger/Sticky counts = JSON");

  const xNodes = wf.nodes.filter(isX);
  assert(xNodes.length === 3 && wf.nodes.filter(isPsl).length === 5, "3 X HTTP nodes, 5 PSL HTTP nodes");
  for (const n of xNodes) {
    assert(n.parameters.genericAuthType === "oAuth2Api", `${n.name} uses the generic OAuth2 credential type`);
    const url = String(n.parameters.url);
    assert(url === X_API.usersMe || url === X_API.createPost || url.startsWith(`=${X_API.lookupPrefix}`), `${n.name} uses a fixed api.x.com URL`);
    const resp = (n.parameters.options as { response?: { response?: { fullResponse?: boolean; neverError?: boolean } } }).response?.response;
    assert(resp?.fullResponse === true && resp?.neverError === true, `${n.name} captures status codes`);
  }
  const posts = xNodes.filter((n) => n.parameters.method === "POST");
  assert(posts.length === 1 && posts[0].name === "Create Post on X", "exactly one X write node");
  const create = posts[0];
  assert(create.parameters.url === X_API.createPost && create.retryOnFail === false, "Create Post: fixed URL, Retry On Fail OFF");
  assert(String(create.parameters.jsonBody) === "={{ JSON.stringify({ text: $('Request dispatch permit').first().json.text }) }}", "Create Post body is the permit text only");
  assert(create.onError === "continueErrorOutput", "Create Post errors are reported (as uncertain), not retried");
  assert(wf.nodes.find((n) => n.name === "Request dispatch permit")?.retryOnFail === false, "permit request never retried");
  assert(wf.nodes.find((n) => n.name === "Claim work")?.retryOnFail === false, "claim never retried");

  const pre = predecessors(wf, "Create Post on X");
  assert(pre.length === 1 && pre[0].from === "Permit issued?" && pre[0].output === 0, "Create Post reachable only from Permit issued? (true)");
  const prePermit = predecessors(wf, "Permit issued?");
  assert(prePermit.length === 1 && prePermit[0].from === "Request dispatch permit" && prePermit[0].output === 0, "permit check follows only a received permit response");
  const preDispatch = predecessors(wf, "Request dispatch permit");
  assert(preDispatch.length === 1 && preDispatch[0].from === "Account confirmed?" && preDispatch[0].output === 0, "permit requested only after the account check");
  const preMe = predecessors(wf, "Get authenticated X account");
  assert(preMe.length === 1 && preMe[0].from === "Publish work?" && preMe[0].output === 0, "users/me only after a due publish item is claimed");
  assert(!reachableFrom(wf, "Create Post on X").has("Create Post on X"), "no loop back into Create Post");
  const nothing = predecessors(wf, "Nothing due (no X calls)");
  assert(nothing.length === 1 && nothing[0].from === "Lookup work?" && nothing[0].output === 1 && !wf.connections["Nothing due (no X calls)"], "no due work ends with zero X calls");
  const lookupPre = predecessors(wf, "Look up post on X");
  assert(lookupPre.length === 1 && lookupPre[0].from === "Lookup target", "lookup only via validated target");
  const claimBody = String(wf.nodes.find((n) => n.name === "Claim work")?.parameters.jsonBody);
  assert(claimBody.includes("mode: 'live'") && claimBody.includes("trigger: 'manual'"), "live workflow claims live work with a manual trigger");

  const dry = loadWorkflow("psl-x-publisher-dry-run.workflow.json");
  commonWorkflowChecks("dry-run", dry.wf, dry.raw);
  assert(!dry.raw.includes("api.x.com") && !dry.raw.includes("oAuth2Api") && !dry.raw.includes("twitter.com"), "dry-run has no X host and no OAuth2 node");
  assert(dry.wf.nodes.filter(isX).length === 0, "dry-run: zero X nodes (no reachable X write)");
  assert(dry.wf.nodes.length === counts.dryTotal && dry.wf.nodes.filter(isHttp).length === counts.dryHttp, "README dry-run counts = JSON");
  const dryClaim = String(dry.wf.nodes.find((n) => n.name === "Claim work")?.parameters.jsonBody);
  assert(dryClaim.includes("mode: 'dry_run'") && !dryClaim.includes("mode: 'live'"), "dry-run claims only dry_run (TEST) work");
}

async function main() {
  testIdentityStrings();
  testTime();
  testContent();
  testHashes();
  testClassification();
  testLookup();
  testConfig();
  testPolicyDrift();
  await testMachineGates();
  await testAdmin();
  await testEvents();
  testDerivedStates();
  testWorkflows();
  testWorkflowWording();
  assert(X_LIMITS.createDispatchesPerPhoenixDay === 1 && X_LIMITS.postsPerWorkflowRun === 1 && X_LIMITS.slotMinutes === 30 && X_LIMITS.expiryMinutesAfterScheduled === 60, "documented defaults");
  console.log(`[x-publishing] ${passed} offline (mocked) assertions passed.`);
}

main().catch((error) => {
  console.error("[x-publishing] FAILED:", error instanceof Error ? error.message : error);
  process.exit(1);
});
