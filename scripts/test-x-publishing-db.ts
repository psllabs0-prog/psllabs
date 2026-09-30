/**
 * REAL-database acceptance + concurrency test for approved X publishing.
 * Opt-in only, and only against an isolated, disposable Neon database:
 *
 *   X_PUBLISHING_DB_TEST=1 N8N_TEST_DATABASE_URL=<isolated DB URL> npm run test:x-publishing-db
 *
 * Drives the same machine HTTP handlers the n8n workflow calls, with X's
 * responses SIMULATED in-process. Global fetch is guarded: any request to a
 * host other than the Neon test database is refused and fails the run, so no
 * X endpoint is reachable. Time is supplied per call (far-future Phoenix
 * dates), so scenarios never depend on the wall clock.
 *
 * Refuses to run when the target host matches any application database URL
 * or the target contains business tables. Creates the x_publishing tables in
 * the isolated database if missing, requires them to be empty, deletes only
 * rows it created, restores the control row, and verifies cleanup. Never
 * prints connection details or tokens.
 */
import crypto from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { neon } from "@neondatabase/serverless";

import { __setSqlClientForTests } from "../lib/db/sql";
import { ensureMissionControlSchema } from "../lib/ops/mission-control/schema";
import {
  approveXPost,
  cancelXPost,
  requestLookup,
  resolveNotCreated,
  saveXDraft,
  setReconcileCandidate,
  setXPaused,
  setXSchedule,
} from "../lib/x-publishing/admin-store";
import { handleXAdminGet } from "../lib/x-publishing/admin-api";
import { currentLibraryReview } from "../lib/x-publishing/autopilot/eligibility";
import { autopilotSlotKey, X_AUTOPILOT_POLICY_VERSION } from "../lib/x-publishing/autopilot/policy";
import { authorizeAutopilot, disableAutopilot, readAutopilotView } from "../lib/x-publishing/autopilot/store";
import { X_ACCOUNT_HANDLE, X_ACCOUNT_ID, X_AUTOPILOT_ACTOR, X_DISPLAY_LABELS, X_LIMITS, X_PROVENANCE } from "../lib/x-publishing/constants";
import { checkPostText } from "../lib/x-publishing/content";
import {
  __resetXMachineRateLimiterForTests,
  handleXMachineRequest,
  type XMachineAction,
} from "../lib/x-publishing/handlers";
import { textHash, tokenHash } from "../lib/x-publishing/hash";
import { getAttempt, getControl, getPost, isStandingPolicy, mapPost, previewHashFor, type ScheduleKind, type XPostRecord } from "../lib/x-publishing/records";
import { ensureXPublishingSchema, getXPublishingSchemaState } from "../lib/x-publishing/schema";
import { readXPublishingPanel } from "../lib/x-publishing/summary";
import { addMinutes, parsePhoenixLocal } from "../lib/x-publishing/time";

let passed = 0;
function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
  passed++;
}
const log = (m: string) => console.log(`[x-db] ${m}`);

function hostOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase().replace("-pooler.", ".");
  } catch {
    return null;
  }
}

function applicationDatabaseHosts(): Set<string> {
  const hosts = new Set<string>();
  const add = (v: string | undefined) => {
    const h = hostOf(v?.trim().replace(/^["']|["']$/g, ""));
    if (h) hosts.add(h);
  };
  for (const [k, v] of Object.entries(process.env)) {
    if (k !== "N8N_TEST_DATABASE_URL" && /DATABASE_URL|POSTGRES_URL/.test(k)) add(v);
  }
  for (const file of [".env.local", ".env", ".env.production", ".env.production.local"]) {
    const path = join(process.cwd(), file);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]*(?:DATABASE_URL|POSTGRES_URL)[A-Z0-9_]*)\s*=\s*(.+)$/.exec(line);
      if (m) add(m[2]);
    }
  }
  return hosts;
}

const TAG = `xdbtest-${Date.now().toString(36)}`;
const TOKEN = crypto.randomBytes(48).toString("base64url");
const dryEnv = { X_PUBLISHER_TOKEN: TOKEN, X_EXPECTED_ACCOUNT_ID: X_ACCOUNT_ID, X_PUBLISHING_DRY_RUN_ENABLED: "true" };
const liveEnv = { X_PUBLISHER_TOKEN: TOKEN, X_EXPECTED_ACCOUNT_ID: X_ACCOUNT_ID, VERCEL_ENV: "production", X_PUBLISHING_ENABLED: "true" };
type Env = Record<string, string | undefined>;
type Body = Record<string, unknown>;
type Work = { kind: string; attemptId: string; token: string; queueId: string; xPostId?: string; purpose?: string };

const refusedHosts: string[] = [];
let allowedFetches = 0;

let seq = 0;
const at = (local: string, plus = 0) => addMinutes(parsePhoenixLocal(local)!, plus);
const day = (n: number) => `2031-03-${String(n).padStart(2, "0")}`;
const postIdFor = () => `19${crypto.randomInt(10 ** 7, 10 ** 8)}${crypto.randomInt(10 ** 8, 10 ** 9)}`;
const textFor = (label: string, link = "") => `PSL lab note ${label} (${TAG}): new lot COAs are posted.${link ? ` ${link}` : ""}`;

async function machine(action: XMachineAction, body: unknown, now: Date, env: Env = dryEnv) {
  __resetXMachineRateLimiterForTests();
  const path = action.kind === "claim" ? "claim" : `attempts/${action.attemptId}/${action.kind}`;
  const res = await handleXMachineRequest(
    new Request(`https://psl.test/api/integrations/n8n/x-publishing/${path}`, {
      method: "POST",
      headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    action,
    { env, now }
  );
  return { status: res.status, body: (await res.json()) as Body };
}

const claim = (now: Date, o: { mode?: "dry_run" | "live"; trigger?: "manual" | "schedule"; env?: Env } = {}) =>
  machine({ kind: "claim" }, { mode: o.mode ?? "dry_run", trigger: o.trigger ?? "manual", executionId: `e${++seq}` }, now, o.env ?? (o.mode === "live" ? liveEnv : dryEnv));
const identity = (w: Work, now: Date, accountId: string | null = X_ACCOUNT_ID, httpStatus = 200, env: Env = dryEnv) =>
  machine({ kind: "identity", attemptId: w.attemptId }, { token: w.token, httpStatus, accountId }, now, env);
const dispatch = (w: Work, now: Date, env: Env = dryEnv) =>
  machine({ kind: "dispatch", attemptId: w.attemptId }, { token: w.token }, now, env);
const result = (w: Work, now: Date, r: { httpStatus: number | null; postId?: string | null; transportError?: boolean; rateLimitReset?: string | null }, env: Env = dryEnv) =>
  machine(
    { kind: "result", attemptId: w.attemptId },
    { token: w.token, transportError: r.transportError ?? false, httpStatus: r.httpStatus, postId: r.postId ?? null, errorTitle: null, rateLimitReset: r.rateLimitReset ?? null },
    now,
    env
  );

/** Simulated X post object: links shortened to t.co, & escaped, entities expanded. */
function xPost(id: string, text: string, authorId = X_ACCOUNT_ID) {
  const urls: Array<{ url: string; expanded_url: string }> = [];
  const shown = text
    .replace(/https:\/\/\S+/g, (u) => {
      const short = `https://t.co/s${urls.length}x`;
      urls.push({ url: short, expanded_url: u });
      return short;
    })
    .replace(/&/g, "&amp;");
  return { id, author_id: authorId, text: shown, created_at: "2031-03-01T00:00:00.000Z", entities: { urls } };
}
const lookup = (w: Work, now: Date, data: unknown, httpStatus: number | null = 200, transportError = false, env: Env = dryEnv) =>
  machine({ kind: "lookup", attemptId: w.attemptId }, { token: w.token, transportError, httpStatus, data }, now, env);

async function draft(text: string, local: string | null, isTest = true): Promise<XPostRecord> {
  const r = await saveXDraft({ id: null, expectedRevision: null, text, sourceRefs: [], scheduledForLocal: local, isTest, actor: TAG, now: new Date() });
  assert(r.status === 201, `draft saved: ${JSON.stringify(r.body)}`);
  return r.body.post as XPostRecord;
}

async function approve(post: XPostRecord, kind: ScheduleKind, now: Date, o: { ack?: string[]; isTest?: boolean; previewHash?: string } = {}) {
  return approveXPost({
    id: post.id,
    expectedRevision: post.revision,
    previewHash: o.previewHash ?? previewHashFor(post, kind, checkPostText(post.text)),
    scheduleKind: kind,
    confirmPublic: true,
    confirmManualRun: kind === "next_manual_run",
    acknowledgedWarnings: o.ack ?? [],
    isTest: o.isTest ?? true,
    env: o.isTest === false ? "production" : "test",
    actor: TAG,
    now,
  });
}

async function approvedManual(label: string, now: Date, link = ""): Promise<XPostRecord> {
  const p = await draft(textFor(label, link), null);
  const r = await approve(p, "next_manual_run", now);
  assert(r.status === 200, `${label}: approved for next manual run (${JSON.stringify(r.body)})`);
  return r.body.post as XPostRecord;
}

async function claimPublish(now: Date, label: string, o: Parameters<typeof claim>[1] = {}): Promise<Work> {
  const c = await claim(now, o);
  const w = c.body.work as Work | null;
  assert(c.status === 200 && w?.kind === "publish", `${label}: claim returns publish work (${JSON.stringify(c.body)})`);
  return w;
}

/** identity → permit → create (simulated) → lookup (simulated). Returns the X post ID. */
async function publishAll(w: Work, now: Date, label: string, env: Env = dryEnv): Promise<string> {
  const i = await identity(w, now, X_ACCOUNT_ID, 200, env);
  assert(i.status === 200 && i.body.proceed === true, `${label}: account confirmed (${JSON.stringify(i.body)})`);
  const d = await dispatch(w, now, env);
  assert(d.status === 200 && d.body.permit === "issued", `${label}: permit issued (${JSON.stringify(d.body)})`);
  const id = postIdFor();
  const r = await result(w, now, { httpStatus: 201, postId: id }, env);
  assert(r.status === 200 && r.body.state === "created" && r.body.xPostId === id, `${label}: created with string ID (${JSON.stringify(r.body)})`);
  const l = await lookup(w, now, xPost(id, String(d.body.text)), 200, false, env);
  assert(l.status === 200 && l.body.state === "published", `${label}: lookup confirmed (${JSON.stringify(l.body)})`);
  return id;
}

async function main() {
  if (process.env.X_PUBLISHING_DB_TEST !== "1") {
    console.log("[x-db] skipped: set X_PUBLISHING_DB_TEST=1 and N8N_TEST_DATABASE_URL (isolated DB only).");
    return;
  }
  const url = process.env.N8N_TEST_DATABASE_URL?.trim();
  const target = hostOf(url);
  if (!url || !target) throw new Error("N8N_TEST_DATABASE_URL is required.");
  if (applicationDatabaseHosts().has(target)) {
    throw new Error("Refusing: the test database host matches an application database. Use an isolated database.");
  }

  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const h = u.hostname.toLowerCase();
    if (!h.endsWith(".neon.tech")) {
      refusedHosts.push(h);
      throw new Error(`Network access refused in test: ${h}`);
    }
    allowedFetches++;
    return realFetch(input, init);
  }) as typeof fetch;

  const sql = neon(url);
  const [biz] = (await sql`
    SELECT to_regclass('public.orders') AS orders,
           to_regclass('public.finance_transactions') AS finance,
           to_regclass('public.support_escalations') AS support
  `) as Array<Record<string, unknown>>;
  if (biz.orders || biz.finance || biz.support) {
    throw new Error("Refusing: the test database contains business tables; it is not isolated.");
  }

  delete process.env.DATABASE_URL;
  delete process.env.POSTGRES_URL;
  delete process.env.VERCEL;
  delete process.env.VERCEL_ENV;
  __setSqlClientForTests(sql);
  process.env.MISSION_CONTROL_SYNC_ENABLED = "true";

  await ensureMissionControlSchema();
  await ensureXPublishingSchema();
  await ensureXPublishingSchema();
  assert((await getXPublishingSchemaState()).initialized, "x_publishing tables present (migration idempotent)");

  const counts = async () =>
    (
      (await sql`
        SELECT (SELECT COUNT(*)::int FROM x_publishing_posts) AS posts,
               (SELECT COUNT(*)::int FROM x_publishing_attempts) AS attempts,
               (SELECT COUNT(*)::int FROM ops_activity_events WHERE source_system = 'x_publishing') AS events,
               (SELECT COUNT(*)::int FROM x_publishing_autopilot_slots) AS slots,
               (SELECT COUNT(*)::int FROM x_publishing_autopilot_authorizations) AS authorizations
      `) as Array<{ posts: number; attempts: number; events: number; slots: number; authorizations: number }>
    )[0];
  const before = await counts();
  assert(
    before.posts === 0 && before.attempts === 0 && before.events === 0 && before.slots === 0 && before.authorizations === 0,
    "isolated DB has no x_publishing or autopilot rows before the run"
  );
  const creators = [TAG, X_AUTOPILOT_ACTOR, "x-draft-assistant"];
  const controlBefore = (await sql`SELECT paused, reason, updated_at, updated_by FROM x_publishing_control WHERE id = 1`) as Array<Record<string, unknown>>;

  const texts: string[] = [];
  const cleanup = async () => {
    await sql`DELETE FROM ops_activity_events WHERE source_system = 'x_publishing'`;
    await sql`DELETE FROM x_publishing_autopilot_slots`;
    await sql`DELETE FROM x_publishing_autopilot_authorizations WHERE authorized_by = ${TAG}`;
    await sql`DELETE FROM x_publishing_attempts WHERE post_id IN (SELECT id FROM x_publishing_posts WHERE created_by = ANY(${creators}))`;
    await sql`DELETE FROM x_publishing_posts WHERE created_by = ANY(${creators})`;
    if (controlBefore[0]) {
      const c = controlBefore[0];
      await sql`
        UPDATE x_publishing_control SET paused = ${c.paused as boolean}, reason = ${c.reason as string | null},
          updated_at = ${c.updated_at as string}::timestamptz, updated_by = ${c.updated_by as string | null}
        WHERE id = 1
      `;
    } else {
      await sql`DELETE FROM x_publishing_control WHERE id = 1`;
    }
  };

  let failure: unknown = null;
  try {
    // ---------- S0: paused by default ----------
    {
      await sql`DELETE FROM x_publishing_control WHERE id = 1`;
      assert((await getControl()).paused, "no control row means paused");
      const p = await approvedManual("s0", at(`${day(1)}T08:00`));
      const c = await claim(at(`${day(1)}T08:01`));
      assert(c.status === 200 && c.body.work === null, "paused by default: nothing claimed, no X calls");
      await setXPaused({ paused: false, reason: "", actor: TAG, isTest: true, now: at(`${day(1)}T08:02`) });
      const w = await claimPublish(at(`${day(1)}T08:03`), "s0");
      assert(w.queueId === p.id, "s0: resumed queue serves the approved item");
      await publishAll(w, at(`${day(1)}T08:04`), "s0");
      log("S0 paused-by-default: ok");
    }

    // ---------- S1: happy path with a link, t.co expansion, string IDs ----------
    {
      const text = textFor("s1", "https://psllabs.org/coa?lot=A&x=1");
      texts.push(text);
      const p = await draft(text, null);
      const r = await approve(p, "next_manual_run", at(`${day(2)}T09:00`));
      assert(r.status === 200, "s1 approved");
      const w = await claimPublish(at(`${day(2)}T09:01`), "s1");
      const i = await identity(w, at(`${day(2)}T09:01`));
      assert(i.body.proceed === true, "s1 identity");
      const d = await dispatch(w, at(`${day(2)}T09:02`));
      assert(d.body.permit === "issued" && d.body.text === text, "s1: permit returns the exact approved text");
      const id = postIdFor();
      assert(BigInt(id) > BigInt(Number.MAX_SAFE_INTEGER), "simulated ID exceeds MAX_SAFE_INTEGER");
      const res = await result(w, at(`${day(2)}T09:02`), { httpStatus: 201, postId: id });
      assert(res.body.state === "created", "s1 created");
      const mid = await getPost(p.id);
      assert(mid?.xPostId === id && mid.status === "created", "s1: post ID saved before lookup");
      const l = await lookup(w, at(`${day(2)}T09:03`), xPost(id, text));
      assert(l.body.state === "published", `s1: lookup with t.co + &amp; confirmed (${JSON.stringify(l.body)})`);
      const post = await getPost(p.id);
      const att = await getAttempt(w.attemptId);
      assert(post?.status === "published" && post.xPostId === id && typeof post.xPostId === "string", "s1: published; ID stored exactly as a string");
      assert(att?.verification?.provenance === X_PROVENANCE && att.verification.source === "create_response", "s1: provenance recorded");
      const [types] = (await sql`
        SELECT pg_typeof(account_id)::text AS account_type, pg_typeof(x_post_id)::text AS post_type, account_id, x_post_id
        FROM x_publishing_posts WHERE id = ${p.id}::uuid
      `) as Array<Record<string, string>>;
      assert(types.account_type === "text" && types.post_type === "text" && types.account_id === X_ACCOUNT_ID && types.x_post_id === id, "s1: IDs are text columns, exact round trip");
      const again = await claim(at(`${day(2)}T09:10`));
      assert(again.body.work === null, "s1: nothing due afterwards → no X calls");
      log("S1 happy path: ok");
    }

    // ---------- S2: concurrent claims and concurrent permit requests ----------
    for (const [t, n] of [2, 8, 8].entries()) {
      const d = day(3 + t);
      const p = await approvedManual(`s2t${t}`, at(`${d}T09:00`));
      const claims = await Promise.all(Array.from({ length: n }, () => claim(at(`${d}T09:01`))));
      const works = claims.map((c) => c.body.work as Work | null).filter((w): w is Work => w?.kind === "publish");
      log(`S2 trial ${t + 1}: ${n} simultaneous claims → ${works.length} publish work (statuses ${claims.map((c) => c.status).join(",")})`);
      assert(works.length === 1 && works[0].queueId === p.id, "exactly one execution claims the item");
      const w = works[0];
      assert((await identity(w, at(`${d}T09:01`))).body.proceed === true, "identity ok");
      const permits = await Promise.all(Array.from({ length: n }, () => dispatch(w, at(`${d}T09:02`))));
      const issued = permits.filter((x) => x.body.permit === "issued").length;
      const already = permits.filter((x) => x.body.permit === "already_issued").length;
      log(`S2 trial ${t + 1}: ${n} simultaneous permit requests → issued ${issued}, already_issued ${already}`);
      assert(issued === 1 && already === n - 1, "exactly one dispatch permit; the rest never receive the text");
      assert(permits.filter((x) => x.body.permit !== "issued").every((x) => !("text" in x.body)), "no text without the permit");
      const [{ n: permitRows }] = (await sql`
        SELECT COUNT(*)::int AS n FROM x_publishing_attempts WHERE post_id = ${p.id}::uuid AND permit_issued_at IS NOT NULL
      `) as Array<{ n: number }>;
      assert(permitRows === 1, "one permit row in the database");
      const id = postIdFor();
      await result(w, at(`${d}T09:02`), { httpStatus: 201, postId: id });
      const results = await Promise.all(Array.from({ length: 4 }, () => result(w, at(`${d}T09:03`), { httpStatus: 201, postId: id })));
      assert(results.every((r) => r.status === 200 && r.body.applied === false), "concurrent duplicate results are idempotent");
      assert((await lookup(w, at(`${d}T09:03`), xPost(id, p.text))).body.state === "published", "published");
    }

    // ---------- S3: two per Phoenix day — two concurrent dispatches allowed, a third blocked ----------
    for (const [t, dn] of [6, 8, 10].entries()) {
      const dA = day(dn);
      const x = await draft(textFor(`s3t${t}x`), `${dA}T09:00`);
      const y = await draft(textFor(`s3t${t}y`), `${dA}T09:00`);
      assert((await approve(x, "scheduled", at(`${dA}T08:00`))).status === 200, "first item approved for the day");
      assert((await approve(y, "scheduled", at(`${dA}T08:00`))).status === 200, "second item approved for the same day");
      const z = await draft(textFor(`s3t${t}z`), `${dA}T10:00`);
      const refused = await approve(z, "scheduled", at(`${dA}T08:01`));
      const cap = refused.body.capacity as { day: string; used: number; items: Array<{ postId: string }> } | undefined;
      assert(
        refused.status === 409 && String(refused.body.error).includes(`Phoenix date ${dA}`) && /2 of 2 used \(2 reserved, 0 dispatch permits issued\)/.test(String(refused.body.error)),
        `third reservation refused naming the Phoenix date and usage (${JSON.stringify(refused.body.error)})`
      );
      assert(cap?.day === dA && cap.items.map((i) => i.postId).sort().join() === [x.id, y.id].sort().join(), "capacity detail lists the blocking queue items");
      const claims = await Promise.all(Array.from({ length: 6 }, () => claim(at(`${dA}T09:01`), { trigger: "schedule" })));
      const works = claims.map((c) => c.body.work as Work | null).filter((w): w is Work => w?.kind === "publish");
      assert(works.length === 2 && new Set(works.map((w) => w.queueId)).size === 2, `six concurrent claims → exactly the two items (${works.length})`);
      for (const w of works) assert((await identity(w, at(`${dA}T09:01`))).body.proceed === true, "identity ok");
      const permits = await Promise.all(works.map((w) => dispatch(w, at(`${dA}T09:02`))));
      assert(permits.every((p) => p.body.permit === "issued"), "two concurrent permit requests on the same day are both issued");
      for (const [i, w] of works.entries()) {
        const id = postIdFor();
        await result(w, at(`${dA}T09:03`), { httpStatus: 201, postId: id });
        await lookup(w, at(`${dA}T09:03`), xPost(id, String(permits[i].body.text)));
      }
      const late = await draft(textFor(`s3t${t}late`), null);
      const third = await approve(late, "next_manual_run", at(`${dA}T11:00`));
      assert(third.status === 409 && /0 reserved, 2 dispatch permits issued/.test(String(third.body.error)), "a third same-day approval is refused after two dispatches");
    }

    // ---------- S3b: permit-time cap under concurrent requests (forced over-reservation) ----------
    for (const [t, dn] of [7, 9, 11].entries()) {
      const dA = day(dn);
      const a = await draft(textFor(`s3b${t}a`), `${dA}T09:00`);
      const b = await draft(textFor(`s3b${t}b`), `${dA}T09:30`);
      assert((await approve(a, "scheduled", at(`${dA}T08:00`))).status === 200, "A approved");
      assert((await approve(b, "scheduled", at(`${dA}T08:00`))).status === 200, "B approved");
      const filler = await draft(textFor(`s3b${t}filler`), null);
      await sql`
        INSERT INTO x_publishing_attempts (
          id, post_id, approved_revision, approval_hash, payload_text, account_id, is_test, mode, trigger, execution_id,
          claim_token_hash, state, claimed_at, lease_expires_at, permit_issued_at, permit_day, dispatch_deadline,
          result_received_at, result_http_status, error_code, updated_at
        ) VALUES (
          ${crypto.randomUUID()}::uuid, ${filler.id}::uuid, 1, 'forced', ${filler.text}, ${X_ACCOUNT_ID}, true, 'dry_run', 'manual', 'forced',
          ${tokenHash(crypto.randomBytes(32).toString("base64url"))}, 'rejected', ${at(`${dA}T08:30`).toISOString()}::timestamptz,
          ${at(`${dA}T08:35`).toISOString()}::timestamptz, ${at(`${dA}T08:30`).toISOString()}::timestamptz, ${dA},
          ${at(`${dA}T08:35`).toISOString()}::timestamptz, ${at(`${dA}T08:31`).toISOString()}::timestamptz, 400, 'forced_rejection',
          ${at(`${dA}T08:31`).toISOString()}::timestamptz
        )
      `;
      const now = at(`${dA}T09:31`);
      const wA = await claimPublish(now, "s3b A");
      assert(wA.queueId === a.id, "earliest due item claimed first");
      const blocked = await claim(now);
      assert(blocked.body.work === null, "claim-time cap: one permit used + A in flight leaves no room for another claim");
      assert((await identity(wA, now)).body.proceed === true, "A identity");
      const bRow = await getPost(b.id);
      const tokB = crypto.randomBytes(32).toString("base64url");
      const attB = crypto.randomUUID();
      await sql`
        INSERT INTO x_publishing_attempts (
          id, post_id, approved_revision, approval_hash, payload_text, account_id, is_test, mode, trigger,
          execution_id, claim_token_hash, state, claimed_at, lease_expires_at, identity_checked_at,
          identity_http_status, identity_account_id, updated_at
        ) VALUES (
          ${attB}::uuid, ${b.id}::uuid, ${bRow!.revision}, ${bRow!.approvalHash}, ${bRow!.text}, ${X_ACCOUNT_ID}, true,
          'dry_run', 'manual', 'forced', ${tokenHash(tokB)}, 'identity_ok', ${now.toISOString()}::timestamptz,
          ${addMinutes(now, 5).toISOString()}::timestamptz, ${now.toISOString()}::timestamptz, 200, ${X_ACCOUNT_ID},
          ${now.toISOString()}::timestamptz
        )
      `;
      await sql`UPDATE x_publishing_posts SET status = 'claimed', active_attempt_id = ${attB}::uuid WHERE id = ${b.id}::uuid`;
      const wB: Work = { kind: "publish", attemptId: attB, token: tokB, queueId: b.id };
      const [rA, rB] = await Promise.all([dispatch(wA, addMinutes(now, 1)), dispatch(wB, addMinutes(now, 1))]);
      const issued = [rA, rB].filter((r) => r.body.permit === "issued").length;
      const denied = [rA, rB].find((r) => r.body.permit !== "issued");
      log(`S3b trial ${t + 1}: one permit already used, two due items, simultaneous permit requests → issued ${issued}, other: ${denied?.body.code}`);
      assert(issued === 1 && denied?.body.code === "daily_cap", "daily cap holds under concurrent permit requests");
      const winner = rA.body.permit === "issued" ? wA : wB;
      const id = postIdFor();
      await result(winner, addMinutes(now, 1), { httpStatus: 201, postId: id });
      await lookup(winner, addMinutes(now, 2), xPost(id, String((rA.body.permit === "issued" ? rA : rB).body.text)));
    }

    // ---------- S4: editing invalidates approval; edit vs dispatch race ----------
    {
      const d = day(14);
      const p = await approvedManual("s4", at(`${d}T09:00`));
      const w = await claimPublish(at(`${d}T09:01`), "s4");
      assert((await identity(w, at(`${d}T09:01`))).body.proceed === true, "s4 identity");
      const edited = await saveXDraft({ id: p.id, expectedRevision: p.revision, text: textFor("s4 edited"), sourceRefs: [], scheduledForLocal: null, isTest: true, actor: TAG, now: at(`${d}T09:02`) });
      const ep = edited.body.post as XPostRecord;
      assert(edited.status === 200 && ep.status === "draft" && ep.revision === p.revision + 1 && ep.approvalHash === null, "edit returns the post to draft, new revision, approval cleared");
      const dd = await dispatch(w, at(`${d}T09:02`));
      assert(dd.status === 409 && dd.body.permit === "denied", `edited post cannot be dispatched (${JSON.stringify(dd.body)})`);
      assert(!(await getAttempt(w.attemptId))?.permitIssuedAt, "no permit after edit");
      const stale = await approve(ep, "next_manual_run", at(`${d}T09:03`), { previewHash: previewHashFor(p, "next_manual_run", checkPostText(p.text)) });
      assert(stale.status === 409, "stale preview cannot approve the edited text");
      const staleRev = await approveXPost({ id: p.id, expectedRevision: p.revision, previewHash: previewHashFor(ep, "next_manual_run", checkPostText(ep.text)), scheduleKind: "next_manual_run", confirmPublic: true, confirmManualRun: true, acknowledgedWarnings: [], isTest: true, env: "test", actor: TAG, now: at(`${d}T09:03`) });
      assert(staleRev.status === 409, "stale revision cannot approve");
      const warn = await saveXDraft({ id: p.id, expectedRevision: ep.revision, text: textFor("s4 safety"), sourceRefs: [], scheduledForLocal: null, isTest: true, actor: TAG, now: at(`${d}T09:04`) });
      const wp = warn.body.post as XPostRecord;
      assert((await approve(wp, "next_manual_run", at(`${d}T09:04`))).status === 400, "warnings must be acknowledged");
      assert((await approve(wp, "next_manual_run", at(`${d}T09:04`), { ack: ["claim:safety_efficacy"] })).status === 200, "acknowledged warning approves");
      assert((await cancelXPost({ id: p.id, isTest: true, actor: TAG, now: at(`${d}T09:05`) })).status === 200, "approved item cancelled before dispatch");

      const outcomes = new Set<string>();
      for (let t = 0; t < 4; t++) {
        const dt = day(15 + t);
        const q = await approvedManual(`s4race${t}`, at(`${dt}T09:00`));
        const wq = await claimPublish(at(`${dt}T09:01`), "s4 race");
        await identity(wq, at(`${dt}T09:01`));
        const editDelayMs = [0, 150, 300, 600][t];
        const [perm, ed] = await Promise.all([
          dispatch(wq, at(`${dt}T09:02`)),
          new Promise((r) => setTimeout(r, editDelayMs)).then(() =>
            saveXDraft({ id: q.id, expectedRevision: q.revision, text: textFor(`s4race${t} edited`), sourceRefs: [], scheduledForLocal: null, isTest: true, actor: TAG, now: at(`${dt}T09:02`) })
          ),
        ]);
        const won = perm.body.permit === "issued";
        outcomes.add(won ? "dispatch" : "edit");
        log(`S4 race ${t + 1} (edit delayed ${editDelayMs}ms): permit ${perm.body.permit}${perm.body.code ? ` (${perm.body.code})` : ""}, edit ${ed.status}`);
        assert(won !== (ed.status === 200), "exactly one of dispatch/edit wins");
        const after = await getPost(q.id);
        if (won) {
          assert(perm.body.text === q.text && after?.text === q.text && after.revision === q.revision, "dispatched text is the approved text; edit refused");
          const id = postIdFor();
          await result(wq, at(`${dt}T09:03`), { httpStatus: 201, postId: id });
          await lookup(wq, at(`${dt}T09:03`), xPost(id, q.text));
        } else {
          assert(after?.status === "draft" && !(await getAttempt(wq.attemptId))?.permitIssuedAt, "edit won: no permit");
        }
      }
      log(`S4 edit invalidation: ok (race outcomes observed: ${[...outcomes].join(", ")})`);
    }

    // ---------- S5: pause ----------
    {
      const d = day(20);
      await approvedManual("s5", at(`${d}T09:00`));
      await setXPaused({ paused: true, reason: "test", actor: TAG, isTest: true, now: at(`${d}T09:00`) });
      assert((await claim(at(`${d}T09:01`))).body.work === null, "paused: nothing claimed");
      await setXPaused({ paused: false, reason: "", actor: TAG, isTest: true, now: at(`${d}T09:01`) });
      const w = await claimPublish(at(`${d}T09:02`), "s5");
      await identity(w, at(`${d}T09:02`));
      await setXPaused({ paused: true, reason: "test", actor: TAG, isTest: true, now: at(`${d}T09:03`) });
      const dd = await dispatch(w, at(`${d}T09:03`));
      assert(dd.status === 409 && dd.body.code === "paused", "pause blocks the permit");
      assert((await getPost(w.queueId))?.status === "approved", "claim released back to approved");
      await setXPaused({ paused: false, reason: "", actor: TAG, isTest: true, now: at(`${d}T09:04`) });
      const w2 = await claimPublish(at(`${d}T09:05`), "s5 again");
      await identity(w2, at(`${d}T09:05`));
      const d2 = await dispatch(w2, at(`${d}T09:05`));
      assert(d2.body.permit === "issued", "resumed: permit issued");
      await setXPaused({ paused: true, reason: "after dispatch", actor: TAG, isTest: true, now: at(`${d}T09:06`) });
      const id = postIdFor();
      assert((await result(w2, at(`${d}T09:06`), { httpStatus: 201, postId: id })).body.state === "created", "pause cannot retract: result still recorded");
      assert((await lookup(w2, at(`${d}T09:06`), xPost(id, String(d2.body.text)))).body.state === "published", "evidence still recorded while paused");
      await setXPaused({ paused: false, reason: "", actor: TAG, isTest: true, now: at(`${d}T09:07`) });
      log("S5 pause: ok");
    }

    // ---------- S6: duplicates ----------
    {
      const d = day(22);
      const text = textFor("s6");
      const p1 = await draft(text, null);
      assert((await approve(p1, "next_manual_run", at(`${d}T09:00`))).status === 200, "first approval");
      const p2 = await draft(text, `${day(23)}T10:00`);
      const dup = await approve(p2, "scheduled", at(`${d}T09:00`));
      assert(dup.status === 409 && /Identical text/.test(String(dup.body.error)), "duplicate active text refused (unique index)");
      const w = await claimPublish(at(`${d}T09:01`), "s6");
      await identity(w, at(`${d}T09:01`));
      await dispatch(w, at(`${d}T09:01`));
      const [{ x_post_id: existing }] = (await sql`
        SELECT x_post_id FROM x_publishing_attempts WHERE x_post_id IS NOT NULL AND is_test = true LIMIT 1
      `) as Array<{ x_post_id: string }>;
      const conflict = await result(w, at(`${d}T09:02`), { httpStatus: 201, postId: existing });
      assert(conflict.status === 409 && conflict.body.review === true, "an X post ID already linked elsewhere is flagged for review");
      const id = postIdFor();
      const ok = await result(w, at(`${d}T09:02`), { httpStatus: 201, postId: id });
      assert(ok.body.state === "created", "the real receipt is still accepted");
      await lookup(w, at(`${d}T09:03`), xPost(id, text));
      assert((await approve(p2, "scheduled", at(`${d}T09:04`))).status === 409, "published text blocks a duplicate");
      log("S6 duplicates: ok");
    }

    // ---------- S7: lease expiry fencing, dispatch deadline → uncertain, late success ----------
    {
      const d = day(24);
      const p = await approvedManual("s7", at(`${d}T09:00`));
      const w1 = await claimPublish(at(`${d}T09:01`), "s7 first");
      const w2 = await claimPublish(at(`${d}T09:07`), "s7 after lease expiry");
      assert(w2.queueId === p.id && w2.attemptId !== w1.attemptId, "expired lease released and reclaimed (no permit had been issued)");
      assert((await getAttempt(w1.attemptId))?.state === "released", "old attempt released");
      assert((await identity(w1, at(`${d}T09:07`))).body.proceed === false, "old token fenced (identity)");
      assert((await dispatch(w1, at(`${d}T09:07`))).body.permit === "denied", "old token fenced (permit)");
      await identity(w2, at(`${d}T09:07`));
      const perm = await dispatch(w2, at(`${d}T09:08`));
      assert(perm.body.permit === "issued", "new attempt permitted");
      const after = await claim(at(`${d}T09:14`));
      assert(after.body.work === null, "no re-dispatch after the deadline");
      const unk = await getAttempt(w2.attemptId);
      assert(unk?.state === "uncertain" && (await getPost(p.id))?.status === "uncertain", "deadline passed without a result → uncertain");
      const id = postIdFor();
      const late = await result(w2, at(`${d}T09:20`), { httpStatus: 201, postId: id });
      assert(late.body.state === "created", "late success resolves uncertain");
      assert((await lookup(w2, at(`${d}T09:20`), xPost(id, p.text))).body.state === "published", "late success verified");
      log("S7 lease/deadline: ok");
    }

    // ---------- S8: uncertain response, conflicting receipts ----------
    {
      const d = day(26);
      const p = await approvedManual("s8", at(`${d}T09:00`));
      const w = await claimPublish(at(`${d}T09:01`), "s8");
      await identity(w, at(`${d}T09:01`));
      await dispatch(w, at(`${d}T09:01`));
      const u = await result(w, at(`${d}T09:02`), { httpStatus: 503 });
      assert(u.body.state === "uncertain" && /Do not retry/.test(String(u.body.message)), "503 → uncertain, no retry");
      assert((await result(w, at(`${d}T09:02`), { httpStatus: 503 })).body.applied === false, "identical replay idempotent");
      assert((await claim(at(`${d}T09:03`))).body.work === null, "uncertain item is never re-dispatched");
      const conflict = await result(w, at(`${d}T09:04`), { httpStatus: 403 });
      assert(conflict.status === 409 && conflict.body.review === true, "conflicting receipt flagged for review");
      const id = postIdFor();
      assert((await result(w, at(`${d}T09:05`), { httpStatus: 201, postId: id })).body.state === "created", "late success with ID resolves uncertain");
      const other = await result(w, at(`${d}T09:05`), { httpStatus: 201, postId: postIdFor() });
      assert(other.status === 409 && other.body.review === true, "a different post ID afterwards is flagged, not applied");
      assert((await getAttempt(w.attemptId))?.xPostId === id, "first returned ID kept");
      assert((await lookup(w, at(`${d}T09:06`), xPost(id, p.text))).body.state === "published", "s8 verified");
      log("S8 uncertain/conflicts: ok");
    }

    // ---------- S9: rejection and X rate-limit reset ----------
    {
      const d = day(28);
      const p = await approvedManual("s9", at(`${d}T09:00`));
      const w = await claimPublish(at(`${d}T09:01`), "s9");
      await identity(w, at(`${d}T09:01`));
      await dispatch(w, at(`${d}T09:01`));
      const reset = Math.floor(at(`${day(29)}T16:00`).getTime() / 1000);
      const rj = await result(w, at(`${d}T09:02`), { httpStatus: 429, rateLimitReset: String(reset) });
      assert(rj.body.state === "rejected" && rj.body.retry === false, "429 → rejected, no retry");
      assert((await getPost(p.id))?.status === "rejected", "post rejected");
      const same = await draft(textFor("s9 same day"), null);
      assert((await approve(same, "next_manual_run", at(`${d}T09:05`))).status === 200, "the rejected dispatch used one of the day's two; a second same-day approval is allowed");
      const third = await draft(textFor("s9 third"), null);
      const thirdR = await approve(third, "next_manual_run", at(`${d}T09:06`));
      assert(thirdR.status === 409 && /1 reserved, 1 dispatch permit issued/.test(String(thirdR.body.error)), `rejected dispatch stays consumed; a third is refused (${JSON.stringify(thirdR.body.error)})`);
      await cancelXPost({ id: same.id, isTest: true, actor: TAG, now: at(`${d}T09:07`) });
      const blocked = await approvedManual("s9 limited", at(`${day(29)}T10:00`));
      assert((await claim(at(`${day(29)}T10:01`))).body.work === null, "X rate-limit reset time blocks claims");
      await cancelXPost({ id: blocked.id, isTest: true, actor: TAG, now: at(`${day(29)}T10:02`) });
      const later = await draft(textFor("s9 after reset"), `${day(29)}T17:00`);
      assert((await approve(later, "scheduled", at(`${day(29)}T10:03`))).status === 200, "later slot approved");
      const wl = await claimPublish(at(`${day(29)}T17:01`), "s9 after reset", { trigger: "schedule" });
      await publishAll(wl, at(`${day(29)}T17:01`), "s9 after reset");
      log("S9 rejection/rate limit: ok");
    }

    // ---------- S10: lookup retries, exhaustion, owner re-queue ----------
    {
      const d = "2031-04-01";
      const p = await approvedManual("s10", at(`${d}T09:00`));
      const w = await claimPublish(at(`${d}T09:01`), "s10");
      await identity(w, at(`${d}T09:01`));
      await dispatch(w, at(`${d}T09:01`));
      const id = postIdFor();
      await result(w, at(`${d}T09:02`), { httpStatus: 201, postId: id });
      let now = at(`${d}T09:02`);
      let work: Work = w;
      for (let i = 1; i <= X_LIMITS.maxLookupAttempts; i++) {
        const r = await lookup(work, now, null, i % 2 ? 404 : null, i % 2 === 0);
        assert(r.body.verified === false, `lookup failure ${i} recorded`);
        const a = await getAttempt(w.attemptId);
        assert(a?.state === "created" && a.xPostId === id, "post ID retained through failures");
        if (i < X_LIMITS.maxLookupAttempts) {
          assert((await claim(addMinutes(now, 1))).body.work === null, "backoff respected (no lookup before next_lookup_at)");
          now = new Date(Date.parse(a!.nextLookupAt!) + 1000);
          const c = await claim(now);
          const lw = c.body.work as Work;
          assert(lw?.kind === "lookup" && lw.purpose === "verify" && lw.xPostId === id, "read-only lookup re-queued with a new token");
          assert((await lookup(work, now, null, 404)).status === 403, "previous lookup token fenced");
          work = lw;
        } else {
          assert(a?.reviewRequired && a.nextLookupAt === null && (await getPost(p.id))?.reviewRequired, "exhausted → owner review, no more lookups");
        }
      }
      assert((await claim(addMinutes(now, 600))).body.work === null, "no lookup after exhaustion");
      assert((await requestLookup({ attemptId: w.attemptId, isTest: true, now: addMinutes(now, 601) })).status === 200, "owner re-queues verification");
      const c = await claim(addMinutes(now, 602));
      const lw = c.body.work as Work;
      assert(lw?.kind === "lookup", "re-queued lookup claimed");
      assert((await lookup(lw, addMinutes(now, 602), xPost(id, p.text))).body.state === "published", "verified after owner re-queue");
      log("S10 lookup retries: ok");
    }

    // ---------- S11: lookup mismatch → review; owner reconciliation ----------
    {
      const d = "2031-04-03";
      const p = await approvedManual("s11", at(`${d}T09:00`));
      const w = await claimPublish(at(`${d}T09:01`), "s11");
      await identity(w, at(`${d}T09:01`));
      await dispatch(w, at(`${d}T09:01`));
      const id = postIdFor();
      await result(w, at(`${d}T09:02`), { httpStatus: 201, postId: id });
      const mm = await lookup(w, at(`${d}T09:02`), xPost(id, p.text, "2094368418443280385"));
      assert(mm.body.state === "uncertain" && mm.body.code === "author_mismatch", "author mismatch → uncertain");
      assert((await getPost(p.id))?.reviewRequired, "review flagged");
      const wrong = postIdFor();
      assert((await setReconcileCandidate({ attemptId: w.attemptId, candidatePostId: wrong, isTest: true, actor: TAG, now: at(`${d}T09:05`) })).status === 200, "owner supplies a candidate ID");
      const c1 = (await claim(at(`${d}T09:06`))).body.work as Work;
      assert(c1?.kind === "lookup" && c1.purpose === "reconcile" && c1.xPostId === wrong, "reconcile lookup claimed");
      const bad = await lookup(c1, at(`${d}T09:06`), xPost(wrong, "some other text"));
      assert(bad.body.state === "uncertain" && (await getAttempt(w.attemptId))?.reconcileCandidateId === null, "non-matching candidate rejected, still uncertain");
      await setReconcileCandidate({ attemptId: w.attemptId, candidatePostId: id, isTest: true, actor: TAG, now: at(`${d}T09:07`) });
      const c2 = (await claim(at(`${d}T09:08`))).body.work as Work;
      const good = await lookup(c2, at(`${d}T09:08`), xPost(id, p.text));
      assert(good.body.state === "published", "matching candidate confirms");
      assert((await getAttempt(w.attemptId))?.verification?.source === "owner_supplied_candidate", "reconciliation provenance recorded");
      log("S11 mismatch/reconcile: ok");
    }

    // ---------- S12: resolve uncertain as not created ----------
    {
      const d = "2031-04-05";
      const text = textFor("s12");
      const p = await approvedManual("s12", at(`${d}T09:00`));
      const w = await claimPublish(at(`${d}T09:01`), "s12");
      await identity(w, at(`${d}T09:01`));
      await dispatch(w, at(`${d}T09:01`));
      await result(w, at(`${d}T09:02`), { httpStatus: null, transportError: true });
      assert((await getPost(p.id))?.status === "uncertain", "timeout → uncertain");
      assert((await resolveNotCreated({ attemptId: w.attemptId, confirm: false, isTest: true, actor: TAG, now: at(`${d}T09:03`) })).status === 400, "resolution requires confirmation");
      assert((await resolveNotCreated({ attemptId: w.attemptId, confirm: true, isTest: true, actor: TAG, now: at(`${d}T09:03`) })).status === 200, "owner resolves as not created");
      assert((await getAttempt(w.attemptId))?.state === "not_created" && (await getPost(p.id))?.status === "cancelled", "attempt not_created, post cancelled");
      const again = await draft(text, null);
      assert((await approve(again, "next_manual_run", at("2031-04-06T09:00"))).status === 200, "same text can be approved again as a new item");
      const w2 = await claimPublish(at("2031-04-06T09:01"), "s12 again");
      await publishAll(w2, at("2031-04-06T09:01"), "s12 again");
      const [{ id: createdAttempt }] = (await sql`
        SELECT id FROM x_publishing_attempts WHERE x_post_id IS NOT NULL AND is_test = true LIMIT 1
      `) as Array<{ id: string }>;
      assert((await resolveNotCreated({ attemptId: createdAttempt, confirm: true, isTest: true, actor: TAG, now: at("2031-04-06T09:05") })).status === 409, "attempts with a post ID cannot be resolved as not created");
      log("S12 resolve not created: ok");
    }

    // ---------- S13: scheduling semantics and expiry ----------
    {
      const d = "2031-04-08";
      const s = await draft(textFor("s13"), `${d}T10:00`);
      assert((await approve(s, "scheduled", at(`${d}T09:00`))).status === 200, "scheduled approval");
      assert((await claim(at(`${d}T09:30`))).body.work === null, "manual run never publishes a scheduled post early");
      const w = await claimPublish(at(`${d}T10:01`), "s13 due", { trigger: "schedule" });
      await publishAll(w, at(`${d}T10:01`), "s13");
      const m = await approvedManual("s13 manual", at("2031-04-09T09:00"));
      assert((await claim(at("2031-04-09T09:01"), { trigger: "schedule" })).body.work === null, "next-manual-run items are not served to scheduled runs");
      assert((await claim(at("2031-04-09T09:16"))).body.work === null, "expired after the validity window");
      assert((await getPost(m.id))?.status === "expired", "status expired (not rescheduled)");
      log("S13 scheduling/expiry: ok");
    }

    // ---------- S14: account mismatch pauses; non-200 account check releases ----------
    {
      const d = "2031-04-11";
      const p = await approvedManual("s14", at(`${d}T09:00`));
      const w = await claimPublish(at(`${d}T09:01`), "s14");
      const i = await identity(w, at(`${d}T09:01`), "2094368418443280385");
      assert(i.body.proceed === false, "wrong account → do not proceed");
      const ctl = await getControl();
      assert(ctl.paused && ctl.updatedBy === "x-publisher", "account mismatch pauses the queue");
      assert((await getAttempt(w.attemptId))?.state === "identity_failed" && (await getPost(p.id))?.status === "approved", "nothing sent; item back to approved");
      assert((await dispatch(w, at(`${d}T09:02`))).body.permit === "denied", "no permit after mismatch");
      assert((await claim(at(`${d}T09:03`))).body.work === null, "paused queue claims nothing");
      const panel = await readXPublishingPanel(at(`${d}T09:03`));
      assert(panel !== null, "Mission Control panel readable");
      await setXPaused({ paused: false, reason: "", actor: TAG, isTest: true, now: at(`${d}T09:04`) });
      const w2 = await claimPublish(at(`${d}T09:05`), "s14 again");
      const i2 = await identity(w2, at(`${d}T09:05`), null, 401);
      assert(i2.body.proceed === false && !(await getControl()).paused, "non-200 account check releases without pausing");
      const w3 = await claimPublish(at(`${d}T09:06`), "s14 third");
      await publishAll(w3, at(`${d}T09:06`), "s14 third");
      log("S14 account lock: ok");
    }

    // ---------- S15: live partition (simulated X, live gate) ----------
    {
      const d = "2031-04-13";
      const p = await draft(textFor("s15 live"), null, false);
      const r = await approve(p, "next_manual_run", at(`${d}T09:00`), { isTest: false });
      assert(r.status === 200, "live item approved");
      assert((await claim(at(`${d}T09:01`))).body.work === null, "dry-run never claims live items");
      const off = await claim(at(`${d}T09:01`), { mode: "live", env: { ...liveEnv, X_PUBLISHING_ENABLED: undefined } });
      assert(off.status === 503 && off.body.work === null, "live disabled → 503, no work");
      const dryLive = await claim(at(`${d}T09:01`), { mode: "dry_run", env: liveEnv });
      assert(dryLive.status === 503, "dry-run refused in a production config");
      const w = await claimPublish(at(`${d}T09:01`), "s15", { mode: "live" });
      assert(w.queueId === p.id, "live claim serves the live item");
      await publishAll(w, at(`${d}T09:02`), "s15", liveEnv);
      const t = await approvedManual("s15 test item", at("2031-04-14T09:00"));
      assert((await claim(at("2031-04-14T09:01"), { mode: "live" })).body.work === null, "live never claims test items");
      await cancelXPost({ id: t.id, isTest: true, actor: TAG, now: at("2031-04-14T09:02") });
      const panel = await readXPublishingPanel(at(`${d}T09:05`));
      assert(panel?.recent.some((x) => x.queueId === p.id) && !panel.recent.some((x) => x.queueId === t.id), "Mission Control panel shows live items only");
      log("S15 live partition: ok");
    }

    // ---------- S20: saved date on an existing item; approval uses that date ----------
    {
      const d = "2031-05-04";
      const created = at("2031-05-02T12:00");
      const p = await draft(textFor("s20"), null);
      assert(p.scheduledFor === null, "s20: new draft has no saved time");
      assert((await approve(p, "scheduled", created)).status === 422, "no saved time: scheduled approval refused (never silently next manual run)");
      const s = await setXSchedule({ id: p.id, expectedRevision: p.revision, scheduledForLocal: `${d}T14:00`, isTest: true, actor: TAG, now: created });
      const sp = s.body.post as XPostRecord;
      assert(
        s.status === 200 && sp.id === p.id && sp.revision === p.revision + 1 && sp.text === p.text && sp.scheduledFor === at(`${d}T14:00`).toISOString(),
        `saved date persisted on the existing item, same text, new revision (${JSON.stringify(s.body).slice(0, 200)})`
      );
      assert((await approve(p, "scheduled", created)).status === 409, "the pre-edit revision cannot approve");
      const ok = await approve(sp, "scheduled", created);
      const op = ok.body.post as XPostRecord;
      assert(
        ok.status === 200 && op.scheduleKind === "scheduled" && op.scheduledFor === at(`${d}T14:00`).toISOString() && op.scheduledDay === d && op.expiresAt === at(`${d}T15:00`).toISOString(),
        "approved for the saved future date and its window, not the next manual run"
      );
      assert((await claim(addMinutes(created, 1))).body.work === null, "a manual run today does not publish the future-dated item");
      const moved = await setXSchedule({ id: op.id, expectedRevision: op.revision, scheduledForLocal: "2031-05-05T15:00", isTest: true, actor: TAG, now: created });
      const mp = moved.body.post as XPostRecord;
      assert(
        moved.status === 200 && mp.status === "draft" && mp.approvalHash === null && mp.approvalContext === null && mp.revision === op.revision + 1 && mp.scheduledFor === at("2031-05-05T15:00").toISOString(),
        "changing an approved item's saved date returns it to draft and invalidates the approval"
      );
      assert((await approve(mp, "scheduled", created, { previewHash: previewHashFor(op, "scheduled", checkPostText(op.text)) })).status === 409, "the old date's preview cannot approve the new date");
      assert((await approve(mp, "scheduled", created)).status === 200, "re-approved for the newly saved date");
      assert((await claim(at(`${d}T14:01`), { trigger: "schedule" })).body.work === null, "nothing at the old date");
      const w = await claimPublish(at("2031-05-05T15:01"), "s20", { trigger: "schedule" });
      assert(w.queueId === p.id, "published from the newly saved slot");
      await publishAll(w, at("2031-05-05T15:01"), "s20");
      assert((await setXSchedule({ id: p.id, expectedRevision: 1, scheduledForLocal: `${d}T14:00`, isTest: true, actor: TAG, now: created })).status === 409, "stale revision refused");
      const late = await draft(textFor("s20 midnight"), null);
      const lr = await approve(late, "next_manual_run", at("2031-05-06T23:50"));
      assert(lr.status === 422 && /Phoenix midnight/.test(String(lr.body.error)), "a manual-run approval cannot spill into the next Phoenix day");
      log("S20 saved-date scheduling: ok");
    }

    // ---------- S21–S27: standing-policy documentation autopilot (TEST partition) ----------
    const review = currentLibraryReview();
    const confirmations = { reviewedLibrary: true, noIndividualReview: true, sharedDailyCap: true };
    const apAuthorize = (now: Date, o: { libraryVersion?: string; confirmations?: Record<string, boolean> } = {}) =>
      authorizeAutopilot({
        isTest: true,
        environment: "test",
        actor: TAG,
        now,
        policyVersion: X_AUTOPILOT_POLICY_VERSION,
        libraryVersion: o.libraryVersion ?? review.version,
        confirmations: o.confirmations ?? confirmations,
      });
    const apDisable = (now: Date) => disableAutopilot({ isTest: true, actor: TAG, reason: "test", now });
    const schedClaim = (now: Date) => claim(now, { trigger: "schedule" });
    const apOutcome = (c: { body: Body }) => (c.body.autopilot ?? {}) as { outcome?: string; reason?: string; templateId?: string; postId?: string };
    const apPosts = async () =>
      ((await sql`SELECT * FROM x_publishing_posts WHERE is_test = true AND created_by = ${X_AUTOPILOT_ACTOR} ORDER BY created_at, id`) as Array<Record<string, unknown>>).map(mapPost);
    const slotRow = async (dayStr: string, w: string) =>
      ((await sql`SELECT * FROM x_publishing_autopilot_slots WHERE is_test = true AND slot_key = ${autopilotSlotKey(dayStr, w)}`) as Array<Record<string, unknown>>);
    const templateOf = (p: XPostRecord) => (isStandingPolicy(p.approvalContext) ? p.approvalContext.standingPolicy.templateId : null);

    // S21: default OFF; authorization is explicit and validated
    const A1 = "2031-05-10";
    {
      assert((await getXPublishingSchemaState()).autopilotReady, "autopilot tables present");
      const c = await schedClaim(at(`${A1}T09:00`));
      assert(c.body.work === null && apOutcome(c).outcome === "none" && apOutcome(c).reason === "autopilot_off", "default OFF: nothing authorized");
      const [{ n: slotsOff }] = (await sql`SELECT COUNT(*)::int AS n FROM x_publishing_autopilot_slots`) as Array<{ n: number }>;
      assert(slotsOff === 0 && (await apPosts()).length === 0, "off: no slot rows, no automatic posts");
      assert((await apAuthorize(at(`${A1}T08:00`), { confirmations: { reviewedLibrary: true } })).status === 400, "every confirmation is required");
      assert((await apAuthorize(at(`${A1}T08:00`), { libraryVersion: "0".repeat(64) })).status === 409, "a stale library version cannot be authorized");
      const ok = await apAuthorize(at(`${A1}T08:00`));
      assert(ok.status === 200 && ok.body.templates === review.eligibleCount, `authorized ${review.eligibleCount} templates`);
      const [auth] = (await sql`SELECT * FROM x_publishing_autopilot_authorizations WHERE is_test = true AND revoked_at IS NULL`) as Array<Record<string, unknown>>;
      const hashes = auth.template_hashes as Record<string, string>;
      assert(
        auth.policy_version === X_AUTOPILOT_POLICY_VERSION && auth.library_version === review.version && auth.authorized_by === TAG &&
          auth.account_id === X_ACCOUNT_ID && Object.keys(hashes).length === review.eligibleCount && hashes[review.templates[0].id] === review.templates[0].hash &&
          /not individually reviewed/.test(String(auth.statement)),
        "authorization records policy/library versions, per-template hashes, account, actor, and the standing-policy statement"
      );
      log("S21 default off / authorization: ok");
    }

    // S22: one post per slot under concurrent checks; standing-policy record; two per day
    {
      const claims = await Promise.all(Array.from({ length: 5 }, () => schedClaim(at(`${A1}T09:00`))));
      const works = claims.map((c) => c.body.work as Work | null).filter((w): w is Work => w?.kind === "publish");
      const posts = await apPosts();
      assert(works.length === 1 && posts.length === 1 && works[0].queueId === posts[0].id, `five concurrent scheduled checks → one post, one publish work (${works.length}, ${posts.length})`);
      const p = posts[0];
      const ctx = p.approvalContext;
      assert(isStandingPolicy(ctx), "approval is recorded as standing-policy authorization");
      const sp = ctx.standingPolicy;
      assert(
        p.approvedBy === X_AUTOPILOT_ACTOR && p.createdBy === X_AUTOPILOT_ACTOR && ctx.acknowledgedWarnings.length === 0 && !("confirmPublic" in ctx),
        "automated actor; no owner confirmation or warning acknowledgement fabricated"
      );
      assert(
        sp.templateId === review.templates[0].id && sp.templateHash === review.templates[0].hash && p.text === review.templates[0].text &&
          sp.libraryVersion === review.version && sp.policyVersion === X_AUTOPILOT_POLICY_VERSION && sp.slotKey === autopilotSlotKey(A1, "09:00") &&
          sp.sourceHashes.length === review.templates[0].sources.length && sp.authorizationGrantedBy === TAG,
        "record: policy, library, template hash, source hashes, selected text, slot"
      );
      assert(p.scheduledFor === at(`${A1}T09:00`).toISOString() && p.expiresAt === at(`${A1}T10:00`).toISOString() && p.scheduledDay === A1, "slot time and the existing 60-minute window");
      await publishAll(works[0], at(`${A1}T09:01`), "s22 morning");
      const again = await schedClaim(at(`${A1}T09:30`));
      assert(apOutcome(again).outcome === "already_authorized" && again.body.work === null && (await apPosts()).length === 1, "a repeated check of the same slot creates nothing");
      const [slot] = await slotRow(A1, "09:00");
      assert(slot.outcome === "authorized" && slot.template_id === sp.templateId && slot.post_id === p.id, "slot outcome recorded once");
      const ev = (await sql`SELECT summary FROM ops_activity_events WHERE event_type = 'x_autopilot_post_authorized'`) as Array<{ summary: string }>;
      assert(ev.length === 1 && /not individually reviewed/.test(ev[0].summary) && !ev[0].summary.includes(p.text), "Mission Control event says standing policy, no post text");

      const w2 = await claimPublish(at(`${A1}T17:00`), "s22 evening", { trigger: "schedule" });
      const evening = (await apPosts())[1];
      assert(w2.queueId === evening.id && templateOf(evening) === review.templates[1].id, "evening slot uses the next template in order");
      await publishAll(w2, at(`${A1}T17:01`), "s22 evening");
      const extra = await draft(textFor("s22 manual"), `${A1}T20:00`);
      const refused = await approve(extra, "scheduled", at(`${A1}T17:05`));
      assert(refused.status === 409 && /0 reserved, 2 dispatch permits issued/.test(String(refused.body.error)), "manual approval shares the day's two dispatches");

      const g = await handleXAdminGet({ env: dryEnv, now: at(`${A1}T17:30`) });
      const v = g.body.autopilot as {
        mode: string;
        remaining: number;
        counts: { authorized: number; verified: number };
        nextSlots: Array<{ key: string; outcome: string | null; templateId: string | null; postStatus: string | null; expectedTemplateId: string | null }>;
      };
      assert(
        v.mode === "on" && v.counts.authorized === 2 && v.counts.verified === 2 && v.remaining === review.eligibleCount - 2 &&
          v.nextSlots[0].key === autopilotSlotKey(A1, "17:00") && v.nextSlots[0].outcome === "authorized" && v.nextSlots[0].templateId === review.templates[1].id &&
          v.nextSlots[0].postStatus === "published" &&
          v.nextSlots[1].key === autopilotSlotKey("2031-05-11", "09:00") && v.nextSlots[1].expectedTemplateId === review.templates[2].id,
        `/admin-social shows mode, counts, remaining, next slots (${JSON.stringify({ mode: v.mode, counts: v.counts, remaining: v.remaining, next: v.nextSlots })})`
      );
      const panel = await readXPublishingPanel(at(`${A1}T17:30`));
      assert(panel.autopilot?.available === true && panel.autopilot.mode === "off", "Mission Control (live partition) is unaffected by the TEST authorization");
      log("S22 slot authorization / dedupe / two per day: ok");
    }

    // S23: manual and automatic share capacity; a skipped slot can still be decided within its window
    {
      const A2 = "2031-05-12";
      const m1 = await draft(textFor("s23 m1"), `${A2}T11:00`);
      const m2 = await draft(textFor("s23 m2"), `${A2}T12:00`);
      assert((await approve(m1, "scheduled", at(`${A2}T08:00`))).status === 200 && (await approve(m2, "scheduled", at(`${A2}T08:00`))).status === 200, "two owner approvals fill the day");
      const c = await schedClaim(at(`${A2}T09:00`));
      assert(apOutcome(c).outcome === "skipped" && apOutcome(c).reason === "daily_cap" && c.body.work === null, "autopilot skips a full day");
      const [skip] = await slotRow(A2, "09:00");
      assert(skip.outcome === "skipped" && String(skip.detail).includes(A2), "skip recorded with the Phoenix date");
      await cancelXPost({ id: m1.id, isTest: true, actor: TAG, now: at(`${A2}T09:10`) });
      const w = await claimPublish(at(`${A2}T09:30`), "s23 auto", { trigger: "schedule" });
      const rows = await slotRow(A2, "09:00");
      assert(rows.length === 1 && rows[0].outcome === "authorized" && rows[0].post_id === w.queueId, "same slot key upgraded from skipped to authorized (one row)");
      await publishAll(w, at(`${A2}T09:31`), "s23 auto");
      const wm = await claimPublish(at(`${A2}T12:01`), "s23 m2", { trigger: "schedule" });
      assert(wm.queueId === m2.id, "owner item still served");
      await publishAll(wm, at(`${A2}T12:01`), "s23 m2");
      const ev = await schedClaim(at(`${A2}T17:00`));
      assert(apOutcome(ev).outcome === "skipped" && apOutcome(ev).reason === "daily_cap", "evening slot skipped: manual + automatic used the two");
      log("S23 shared capacity: ok");
    }

    // S24: pause, disable, and authorization/library changes before dispatch block the attempt
    {
      const A3 = "2031-05-14";
      await setXPaused({ paused: true, reason: "test", actor: TAG, isTest: true, now: at(`${A3}T08:59`) });
      const paused = await schedClaim(at(`${A3}T09:00`));
      assert(apOutcome(paused).reason === "paused" && paused.body.work === null, "Pause: no automatic authorization");
      await setXPaused({ paused: false, reason: "", actor: TAG, isTest: true, now: at(`${A3}T09:10`) });
      const w = await claimPublish(at(`${A3}T09:20`), "s24", { trigger: "schedule" });
      const withdrawnTemplate = templateOf((await getPost(w.queueId))!);
      assert((await identity(w, at(`${A3}T09:20`))).body.proceed === true, "s24 identity");
      await setXPaused({ paused: true, reason: "test", actor: TAG, isTest: true, now: at(`${A3}T09:21`) });
      const pd = await dispatch(w, at(`${A3}T09:21`));
      assert(pd.body.code === "paused" && pd.body.permit === "denied", "global Pause still blocks the dispatch of an automatic post");
      await setXPaused({ paused: false, reason: "", actor: TAG, isTest: true, now: at(`${A3}T09:22`) });
      const off = await apDisable(at(`${A3}T09:22`));
      const wp = await getPost(w.queueId);
      assert(off.status === 200 && off.body.withdrawn === 1 && wp?.status === "cancelled" && wp.lastErrorCode === "autopilot_disabled", "turning autopilot off withdraws the pending automatic post");
      assert((await schedClaim(at(`${A3}T09:23`))).body.work === null, "off: nothing claimed");
      assert((await apDisable(at(`${A3}T09:24`))).status === 409, "already off");
      assert((await apAuthorize(at(`${A3}T09:25`))).status === 200, "re-authorized");
      const same = await schedClaim(at(`${A3}T09:40`));
      assert(apOutcome(same).outcome === "already_authorized" && same.body.work === null, "a decided slot is never decided again");
      const w2 = await claimPublish(at(`${A3}T17:00`), "s24 evening", { trigger: "schedule" });
      assert(templateOf((await getPost(w2.queueId))!) === withdrawnTemplate, "a withdrawn (never sent) template stays available");
      assert((await identity(w2, at(`${A3}T17:01`))).body.proceed === true, "s24 evening identity");
      const off2 = await apDisable(at(`${A3}T17:02`));
      assert(off2.body.withdrawn === 1 && (await getAttempt(w2.attemptId))?.state === "released", "disable while claimed releases the claim");
      const d2 = await dispatch(w2, at(`${A3}T17:03`));
      assert(d2.body.permit === "denied" && !(await getAttempt(w2.attemptId))?.permitIssuedAt, "no permit after disable");

      const A4 = "2031-05-15";
      assert((await apAuthorize(at(`${A4}T08:00`))).status === 200, "re-authorized");
      const w3 = await claimPublish(at(`${A4}T09:00`), "s24 hash change", { trigger: "schedule" });
      const t3 = templateOf((await getPost(w3.queueId))!)!;
      await identity(w3, at(`${A4}T09:01`));
      await sql`
        UPDATE x_publishing_autopilot_authorizations
        SET template_hashes = jsonb_set(template_hashes, ARRAY[${t3}]::text[], to_jsonb(${"0".repeat(64)}::text))
        WHERE is_test = true AND revoked_at IS NULL
      `;
      const d3 = await dispatch(w3, at(`${A4}T09:02`));
      const p3 = await getPost(w3.queueId);
      assert(
        d3.body.permit === "denied" && d3.body.code === "autopilot_authorization_invalid" && p3?.status === "cancelled" && p3.lastErrorCode === "autopilot_authorization_invalid",
        `authorization no longer covering the template blocks dispatch (${JSON.stringify(d3.body)})`
      );
      assert(!(await getAttempt(w3.attemptId))?.permitIssuedAt, "no permit issued");

      assert((await apAuthorize(at(`${A4}T16:00`))).status === 200, "re-authorized (supersedes the altered row)");
      const w4 = await claimPublish(at(`${A4}T17:00`), "s24 library change", { trigger: "schedule" });
      await identity(w4, at(`${A4}T17:01`));
      await sql`
        UPDATE x_publishing_posts
        SET approval_context = jsonb_set(approval_context, '{standingPolicy,templateHash}', to_jsonb(${"0".repeat(64)}::text))
        WHERE id = ${w4.queueId}::uuid
      `;
      const d4 = await dispatch(w4, at(`${A4}T17:02`));
      const p4 = await getPost(w4.queueId);
      assert(d4.body.code === "autopilot_authorization_invalid" && p4?.status === "cancelled", "a library/source change since authorization blocks dispatch (withdrawn, not returned to draft)");

      const A5 = "2031-05-16";
      const w5 = await claimPublish(at(`${A5}T09:00`), "s24 supersede", { trigger: "schedule" });
      assert((await apAuthorize(at(`${A5}T09:05`))).status === 200, "a new authorization supersedes the old one");
      assert((await getPost(w5.queueId))?.status === "cancelled" && (await getAttempt(w5.attemptId))?.state === "released", "pending post from the superseded authorization withdrawn");
      const [{ n: active }] = (await sql`SELECT COUNT(*)::int AS n FROM x_publishing_autopilot_authorizations WHERE is_test = true AND revoked_at IS NULL`) as Array<{ n: number }>;
      assert(active === 1, "exactly one active authorization");
      log("S24 pause / disable / authorization and library changes: ok");
    }

    // S25: existing drafts and other items are never converted into automatic posts
    {
      const A6 = "2031-05-18";
      const own = await draft(`Owner free-form draft ${TAG}: laboratory documentation notes.`, null);
      const ai = await saveXDraft({ id: null, expectedRevision: null, text: `AI-assisted draft ${TAG}: reading an original laboratory report.`, sourceRefs: ["AI-assisted"], scheduledForLocal: `${A6}T09:00`, isTest: true, actor: "x-draft-assistant", now: new Date() });
      assert(ai.status === 201, "assistant-style draft saved");
      const snapshot = async () =>
        JSON.stringify(await sql`SELECT id, status, revision, approved_by, approval_context FROM x_publishing_posts WHERE is_test = true AND created_by <> ${X_AUTOPILOT_ACTOR} ORDER BY id`);
      const before = await snapshot();
      const w = await claimPublish(at(`${A6}T09:00`), "s25", { trigger: "schedule" });
      const auto = await getPost(w.queueId);
      assert(auto?.createdBy === X_AUTOPILOT_ACTOR && review.templates.some((t) => t.text === auto.text), "the automatic post is library wording");
      assert(w.queueId !== own.id && w.queueId !== (ai.body.post as XPostRecord).id, "drafts are not selected");
      await publishAll(w, at(`${A6}T09:01`), "s25");
      assert((await snapshot()) === before, "existing drafts, cancelled, expired, and resolved items unchanged (no bulk conversion)");
      log("S25 no conversion of existing items: ok");
    }

    // S27: uncertain and late results never cause automatic reposting
    {
      const A9 = "2031-05-23";
      const w = await claimPublish(at(`${A9}T09:00`), "s27", { trigger: "schedule" });
      const t1 = templateOf((await getPost(w.queueId))!);
      await identity(w, at(`${A9}T09:00`));
      assert((await dispatch(w, at(`${A9}T09:01`))).body.permit === "issued", "s27 permit");
      assert((await result(w, at(`${A9}T09:02`), { httpStatus: null, transportError: true })).body.state === "uncertain", "timeout → uncertain");
      const ev = await schedClaim(at(`${A9}T17:00`));
      assert(apOutcome(ev).reason === "unresolved_review" && ev.body.work === null, "autopilot waits while an item needs review");
      await resolveNotCreated({ attemptId: w.attemptId, confirm: true, isTest: true, actor: TAG, now: at(`${A9}T18:00`) });
      const A10 = "2031-05-24";
      const w2 = await claimPublish(at(`${A10}T09:00`), "s27 next", { trigger: "schedule" });
      const t2 = templateOf((await getPost(w2.queueId))!);
      assert(t2 !== t1, "a template whose permit was issued is never reused, even if resolved as not created");
      await identity(w2, at(`${A10}T09:00`));
      assert((await dispatch(w2, at(`${A10}T09:01`))).body.permit === "issued", "s27 second permit (result withheld)");
      const ev2 = await schedClaim(at(`${A10}T17:00`));
      assert(apOutcome(ev2).reason === "unresolved_review" && ev2.body.work === null, "dispatch past its deadline without a result blocks new automatic authorization");
      const id = postIdFor();
      assert((await result(w2, at(`${A10}T17:10`), { httpStatus: 201, postId: id })).body.state === "created", "late success recorded");
      assert((await lookup(w2, at(`${A10}T17:11`), xPost(id, (await getPost(w2.queueId))!.text))).body.state === "published", "late success verified");
      const A11 = "2031-05-25";
      const w3 = await claimPublish(at(`${A11}T09:00`), "s27 after", { trigger: "schedule" });
      const t3 = templateOf((await getPost(w3.queueId))!);
      assert(t3 !== t1 && t3 !== t2, "no automatic repost after a late result");
      await publishAll(w3, at(`${A11}T09:01`), "s27 after");
      const used = (await sql`
        SELECT s.template_id FROM x_publishing_autopilot_slots s
        WHERE s.is_test = true AND s.outcome = 'authorized'
          AND EXISTS (SELECT 1 FROM x_publishing_attempts a WHERE a.post_id = s.post_id AND a.permit_issued_at IS NOT NULL)
      `) as Array<{ template_id: string }>;
      assert(new Set(used.map((u) => u.template_id)).size === used.length, "no template was dispatched twice");
      log("S27 uncertain / late results never repost: ok");
    }

    // S26: near-duplicates are blocked; an exhausted library skips instead of filling the slot
    {
      const A7 = "2031-05-27";
      const seed = async (text: string) => {
        const now = at("2031-05-26T09:00");
        await sql`
          INSERT INTO x_publishing_posts (id, status, revision, text, text_hash, account_id, account_handle, is_test, schedule_kind,
            scheduled_for, expires_at, scheduled_day, approval_hash, approved_revision, created_by, created_at, updated_at)
          VALUES (${crypto.randomUUID()}::uuid, 'published', 1, ${text}, ${textHash(X_ACCOUNT_ID, text)}, ${X_ACCOUNT_ID}, ${X_ACCOUNT_HANDLE}, true,
            'scheduled', ${now.toISOString()}::timestamptz, ${addMinutes(now, 60).toISOString()}::timestamptz, '2031-05-26', 'seed', 1, ${TAG},
            ${now.toISOString()}::timestamptz, ${now.toISOString()}::timestamptz)
        `;
      };
      const view = await readAutopilotView({ isTest: true, now: at(`${A7}T08:00`) });
      const eligible = view.library.templates.filter((t) => t.status === "eligible");
      assert(eligible.length >= 3, `enough templates remain (${eligible.length})`);
      await seed(`${eligible[0].text.replace(/https:\/\/\S+/g, "").trim()} Always.`);
      const w = await claimPublish(at(`${A7}T09:00`), "s26", { trigger: "schedule" });
      assert(templateOf((await getPost(w.queueId))!) === eligible[1].id, "a near-duplicate of existing content is skipped; the next template is used");
      await publishAll(w, at(`${A7}T09:01`), "s26");
      const after = await readAutopilotView({ isTest: true, now: at(`${A7}T09:30`) });
      assert(after.library.templates.find((t) => t.id === eligible[0].id)?.status === "near_duplicate", "view flags the near-duplicate");
      for (const t of after.library.templates.filter((x) => x.status === "eligible")) await seed(t.text);
      const ex = await schedClaim(at(`${A7}T17:00`));
      const [row] = await slotRow(A7, "17:00");
      assert(
        apOutcome(ex).outcome === "skipped" && apOutcome(ex).reason === "library_exhausted" && ex.body.work === null && /Nothing is generated/.test(String(row.detail)),
        "exhausted library: slot skipped and the shortfall reported, nothing generated"
      );
      const v = await readAutopilotView({ isTest: true, now: at(`${A7}T17:30`) });
      assert(v.remaining === 0 && v.nextSlots.every((s) => s.expectedTemplateId === null), "view shows zero remaining");
      log("S26 near-duplicates / exhaustion: ok");
    }

    {
      assert((await apDisable(at("2031-05-28T08:00"))).status === 200, "autopilot turned off at the end");
      const c = await schedClaim(at("2031-05-28T09:00"));
      assert(apOutcome(c).reason === "autopilot_off" && c.body.work === null, "off again: nothing authorized");
      const types = (await sql`SELECT DISTINCT event_type FROM ops_activity_events WHERE event_type LIKE 'x_autopilot_%'`) as Array<{ event_type: string }>;
      assert(["x_autopilot_authorized", "x_autopilot_disabled", "x_autopilot_post_authorized", "x_autopilot_slot_skipped", "x_autopilot_post_withdrawn"].every((t) => types.some((r) => r.event_type === t)), "autopilot events recorded in Mission Control");
    }

    type View = { id: string; status: string; displayState: string; attempts: Array<{ id: string; state: string; effectiveState: string; dispatchOverdue: boolean }> };
    type Sections = Record<"review" | "open" | "history", { total: number; offset: number; limit: number; posts: View[] }>;
    const adminRead = async (env: Env, now: Date, query = "") => {
      const r = await handleXAdminGet({ env, now, query: new URLSearchParams(query) });
      assert(r.status === 200 && r.body.initialized === true, `admin GET ok (${JSON.stringify(r.body).slice(0, 200)})`);
      return { totalPosts: r.body.totalPosts as number, counts: r.body.counts as Record<string, number>, sections: r.body.sections as Sections };
    };
    const allViews = (s: Sections) => [...s.review.posts, ...s.open.posts, ...s.history.posts];
    const tableState = async () =>
      JSON.stringify(
        await sql`
          SELECT
            (SELECT json_agg(json_build_object('id', id, 'status', status, 'revision', revision, 'review', review_required,
               'updated', updated_at, 'err', last_error_code, 'active', active_attempt_id) ORDER BY id) FROM x_publishing_posts) AS posts,
            (SELECT json_agg(json_build_object('id', id, 'state', state, 'review', review_required, 'updated', updated_at,
               'candidate', reconcile_candidate_id, 'permit', permit_issued_at, 'result', result_received_at) ORDER BY id) FROM x_publishing_attempts) AS attempts,
            (SELECT COUNT(*)::int FROM ops_activity_events WHERE source_system = 'x_publishing') AS events,
            (SELECT json_agg(json_build_object('paused', paused, 'updated', updated_at)) FROM x_publishing_control) AS control
        `
      );

    // ---------- S17: overdue dispatch visible from dashboard reads alone (live) ----------
    {
      const d = "2031-04-16";
      const p = await draft(textFor("s17 live overdue"), null, false);
      assert((await approve(p, "next_manual_run", at(`${d}T09:00`), { isTest: false })).status === 200, "s17 live item approved");
      const w = await claimPublish(at(`${d}T09:01`), "s17", { mode: "live" });
      assert((await identity(w, at(`${d}T09:01`), X_ACCOUNT_ID, 200, liveEnv)).body.proceed === true, "s17 account confirmed");
      assert((await dispatch(w, at(`${d}T09:02`), liveEnv)).body.permit === "issued", "s17 permit issued; the create result is deliberately never reported");

      const within = at(`${d}T09:04`);
      const inTime = await readXPublishingPanel(within);
      assert(!inTime.attention.some((a) => a.queueId === p.id) && (inTime.counts?.awaiting_confirmation ?? 0) >= 1, "within the deadline: awaiting confirmation, not review");

      const past = at(`${d}T09:30`);
      const before = await tableState();
      const panel = await readXPublishingPanel(past);
      const live = await adminRead(liveEnv, past);
      const test = await adminRead(dryEnv, past);
      assert((await tableState()) === before, "dashboard reads wrote nothing (posts, attempts, events, control unchanged)");
      assert((await getAttempt(w.attemptId))?.state === "dispatched" && (await getPost(p.id))?.status === "dispatched", "stored state still dispatched: visibility is derived, not written");

      const att = panel.attention.find((a) => a.queueId === p.id);
      assert(att?.label === X_DISPLAY_LABELS.uncertain && panel.attentionTotal >= 1 && (panel.counts?.uncertain ?? 0) >= 1, "Mission Control shows outcome unknown / review required without a claim");
      assert(!panel.recent.some((r) => r.queueId === p.id && r.displayState === "awaiting_confirmation"), "Mission Control never shows the overdue item as awaiting confirmation");
      const view = live.sections.review.posts.find((v) => v.id === p.id);
      const av = view?.attempts.find((a) => a.id === w.attemptId);
      assert(view?.displayState === "uncertain" && av?.state === "dispatched" && av.dispatchOverdue && av.effectiveState === "uncertain", "/admin-social lists it under review as outcome unknown (from the attempt's own deadline)");
      assert(!allViews(test.sections).some((v) => v.id === p.id), "TEST view does not include the live item");

      const published = ((await sql`
        SELECT a.id, a.post_id FROM x_publishing_attempts a
        WHERE a.state = 'published' AND a.is_test = false AND a.dispatch_deadline < ${past.toISOString()}::timestamptz LIMIT 1
      `) as Array<{ id: string; post_id: string }>)[0];
      assert(published, "an older confirmed live publication exists");
      const pv = allViews(live.sections).find((v) => v.id === published.post_id);
      assert(pv?.displayState === "published" && !live.sections.review.posts.some((v) => v.id === published.post_id), "an old confirmed result is not downgraded by its age");
      assert((await setReconcileCandidate({ attemptId: published.id, candidatePostId: postIdFor(), isTest: false, actor: TAG, now: past })).status === 409, "a confirmed result cannot be reconciled");
      assert((await resolveNotCreated({ attemptId: published.id, confirm: true, isTest: false, actor: TAG, now: past })).status === 409, "a confirmed result cannot be resolved as not created");
      assert((await getAttempt(published.id))?.state === "published", "confirmed result unchanged");

      const again = await dispatch(w, past, liveEnv);
      assert(again.body.permit !== "issued" && typeof again.body.text !== "string", "no second permit or text for the overdue attempt");

      const id = postIdFor();
      const rec = await setReconcileCandidate({ attemptId: w.attemptId, candidatePostId: id, isTest: false, actor: TAG, now: past });
      assert(rec.status === 200, `owner reconciliation accepted without a new claim (${JSON.stringify(rec.body)})`);
      const ra = await getAttempt(w.attemptId);
      assert(ra?.state === "uncertain" && ra.reconcileCandidateId === id && (await getPost(p.id))?.status === "uncertain", "owner action recorded the uncertain state and the candidate atomically");
      const lc = (await claim(addMinutes(past, 1), { mode: "live" })).body.work as Work;
      assert(lc?.kind === "lookup" && lc.purpose === "reconcile" && lc.xPostId === id, "the only follow-up work is a read-only reconcile lookup (no Create Post)");
      assert((await lookup(lc, addMinutes(past, 1), xPost(id, p.text), 200, false, liveEnv)).body.state === "published", "reconciled candidate confirmed");
      log("S17 overdue visible from reads, reads write nothing, reconcile without a claim: ok");
    }

    // ---------- S18: late receipts and resolve-not-created on overdue attempts (TEST) ----------
    {
      const overdueAttempt = async (d: string, label: string) => {
        const p = await approvedManual(label, at(`${d}T09:00`));
        const w = await claimPublish(at(`${d}T09:01`), label);
        await identity(w, at(`${d}T09:01`));
        assert((await dispatch(w, at(`${d}T09:01`))).body.permit === "issued", `${label}: permit issued, result omitted`);
        const r = await adminRead(dryEnv, at(`${d}T09:30`));
        assert(r.sections.review.posts.some((v) => v.id === p.id && v.displayState === "uncertain"), `${label}: review-required after the deadline without a claim`);
        return { p, w };
      };

      const c = await overdueAttempt("2031-04-18", "s18 late receipt");
      const idC = postIdFor();
      const late = await result(c.w, at("2031-04-18T09:40"), { httpStatus: 201, postId: idC });
      assert(late.body.state === "created" && late.body.xPostId === idC, "late confirmed receipt on a still-dispatched overdue attempt resolves it");
      const cr = await adminRead(dryEnv, at("2031-04-18T09:41"));
      assert(!cr.sections.review.posts.some((v) => v.id === c.p.id) && allViews(cr.sections).some((v) => v.id === c.p.id && v.displayState === "created_unconfirmed"), "no longer outcome unknown after the late receipt");
      assert((await lookup(c.w, at("2031-04-18T09:41"), xPost(idC, c.p.text))).body.state === "published", "late receipt verified");

      const dd = await overdueAttempt("2031-04-19", "s18 owner then late receipt");
      const idD = postIdFor();
      assert((await setReconcileCandidate({ attemptId: dd.w.attemptId, candidatePostId: idD, isTest: true, actor: TAG, now: at("2031-04-19T09:30") })).status === 200, "owner reconcile on an overdue TEST attempt without a claim");
      const lateD = await result(dd.w, at("2031-04-19T09:35"), { httpStatus: 201, postId: idD });
      assert(lateD.body.state === "created" && lateD.body.xPostId === idD, "late confirmed receipt after the owner transition still resolves");
      assert((await lookup(dd.w, at("2031-04-19T09:36"), xPost(idD, dd.p.text))).body.state === "published", "resolved attempt verified");
      assert((await result(dd.w, at("2031-04-19T09:40"), { httpStatus: null, transportError: true })).status === 409, "a later non-confirmation cannot downgrade the confirmed result");
      assert((await getAttempt(dd.w.attemptId))?.state === "published", "confirmed result kept");

      const b = await overdueAttempt("2031-04-20", "s18 resolve not created");
      assert((await resolveNotCreated({ attemptId: b.w.attemptId, confirm: true, isTest: true, actor: TAG, now: at("2031-04-20T09:30") })).status === 200, "owner resolves an overdue attempt as not created without a claim");
      assert((await getAttempt(b.w.attemptId))?.state === "not_created" && (await getPost(b.p.id))?.status === "cancelled", "attempt not_created, post cancelled");
      assert((await claim(at("2031-04-20T09:31"))).body.work === null, "nothing is re-dispatched");
      log("S18 late receipts / owner actions on overdue attempts: ok");
    }

    // ---------- S19: unresolved items are never hidden behind newer records ----------
    {
      const d = "2031-04-22";
      const old = await draft(textFor("s19 old unresolved"), null, false);
      assert((await approve(old, "next_manual_run", at(`${d}T09:00`), { isTest: false })).status === 200, "s19 live item approved");
      const w = await claimPublish(at(`${d}T09:01`), "s19", { mode: "live" });
      await identity(w, at(`${d}T09:01`), X_ACCOUNT_ID, 200, liveEnv);
      await dispatch(w, at(`${d}T09:01`), liveEnv);
      assert((await result(w, at(`${d}T09:02`), { httpStatus: null, transportError: true }, liveEnv)).body.state === "uncertain", "old live item is unresolved (timeout)");

      const now = at("2031-07-01T09:00");
      const basePanel = await readXPublishingPanel(now);
      const baseLive = await adminRead(liveEnv, now);
      const baseTest = await adminRead(dryEnv, now);
      assert(basePanel.attention.some((a) => a.queueId === old.id), "old unresolved item listed before the bulk insert");

      const newer = at("2031-06-01T09:00").toISOString();
      await sql`
        INSERT INTO x_publishing_posts (id, status, revision, text, text_hash, account_id, account_handle, is_test, schedule_kind, created_by, created_at, updated_at)
        SELECT gen_random_uuid(), CASE WHEN g <= 120 THEN 'draft' ELSE 'cancelled' END, 1,
               'bulk ' || ${TAG} || ' ' || g, md5('bulk ' || ${TAG} || ' ' || g), ${X_ACCOUNT_ID}, ${X_ACCOUNT_HANDLE}, false,
               'next_manual_run', ${TAG}, ${newer}::timestamptz + make_interval(mins => g), ${newer}::timestamptz + make_interval(mins => g)
        FROM generate_series(1, 160) AS g
      `;
      await sql`
        INSERT INTO x_publishing_posts (id, status, revision, text, text_hash, account_id, account_handle, is_test, schedule_kind,
          scheduled_for, expires_at, scheduled_day, approval_hash, approved_revision, review_required, created_by, created_at, updated_at)
        SELECT gen_random_uuid(), 'uncertain', 1, 'bulk review ' || ${TAG} || ' ' || g || ' ' || t,
               md5('bulk review ' || ${TAG} || ' ' || g || ' ' || t), ${X_ACCOUNT_ID}, ${X_ACCOUNT_HANDLE}, t,
               'next_manual_run', ${newer}::timestamptz, ${newer}::timestamptz + interval '15 minutes', '2031-06-01', md5('bulk'), 1, true,
               ${TAG}, ${newer}::timestamptz + make_interval(mins => 200 + g), ${newer}::timestamptz + make_interval(mins => 200 + g)
        FROM generate_series(1, 60) AS g, (VALUES (false), (true)) AS v(t)
        WHERE t = false OR g <= 30
      `;

      const panel = await readXPublishingPanel(now);
      assert(panel.totalPosts === basePanel.totalPosts + 220, `Mission Control total is exact (${panel.totalPosts})`);
      assert(panel.attentionTotal === basePanel.attentionTotal + 60, `Mission Control unresolved count is exact and excludes TEST (${panel.attentionTotal})`);
      assert(panel.attention.length === Math.min(panel.attentionTotal, 20) && panel.attention[0]?.queueId === old.id, "the oldest unresolved item stays listed first behind 220 newer records");
      assert(!panel.recent.some((r) => r.queueId === old.id), "the recent-history window is separate from the unresolved list");

      const live = await adminRead(liveEnv, now);
      assert(live.totalPosts === baseLive.totalPosts + 220 && live.sections.review.total === baseLive.sections.review.total + 60, "/admin-social live totals exact");
      assert(live.sections.open.total === baseLive.sections.open.total + 120 && live.sections.history.total === baseLive.sections.history.total + 40, "/admin-social open/history totals exact");
      assert(live.sections.review.posts.length === 50 && live.sections.review.posts[0].id === old.id, "old unresolved item on the first review page");
      const seen = new Set(live.sections.review.posts.map((v) => v.id));
      for (let offset = 50; offset < live.sections.review.total; offset += 50) {
        const page = await adminRead(liveEnv, now, `reviewOffset=${offset}`);
        assert(page.sections.review.offset === offset && page.sections.review.total === live.sections.review.total, "later review page reports the same exact total");
        page.sections.review.posts.forEach((v) => seen.add(v.id));
      }
      assert(seen.size === live.sections.review.total, `every unresolved live item reachable by paging (${seen.size})`);
      assert(Object.values(live.counts).reduce((a, n) => a + n, 0) === live.totalPosts, "state counts sum to the exact total");

      const test = await adminRead(dryEnv, now);
      assert(test.sections.review.total === baseTest.sections.review.total + 30 && test.totalPosts === baseTest.totalPosts + 30, "TEST partition counted separately");
      assert(!allViews(test.sections).some((v) => v.id === old.id), "TEST view excludes live items");
      log(`S19 unresolved never hidden: ok (live total ${live.totalPosts}, live review ${live.sections.review.total}, test review ${test.sections.review.total})`);
    }

    // ---------- S16: nothing due ----------
    {
      const c1 = await claim(at("2031-05-01T09:00"));
      const c2 = await claim(at("2031-05-01T09:00"), { mode: "live" });
      assert(c1.body.work === null && c2.body.work === null, "no due posts and no pending lookups → work null (no X calls)");
    }

    const [ev] = (await sql`
      SELECT COUNT(*)::int AS n,
             COUNT(*) FILTER (WHERE excluded = false)::int AS included,
             COUNT(DISTINCT event_type)::int AS types
      FROM ops_activity_events WHERE source_system = 'x_publishing'
    `) as Array<{ n: number; included: number; types: number }>;
    assert(ev.n > 0 && ev.types >= 8, `Mission Control events recorded (${ev.n} events, ${ev.types} types)`);
    const summaries = (await sql`SELECT summary FROM ops_activity_events WHERE source_system = 'x_publishing'`) as Array<{ summary: string }>;
    assert(summaries.every((s) => !s.summary.includes(TAG)), "event summaries never include post text");
    assert(refusedHosts.length === 0, `no network requests outside the test database (refused: ${refusedHosts.join(",")})`);
    log(`network guard: ${allowedFetches} database requests allowed, ${refusedHosts.length} refused`);
  } catch (error) {
    failure = error;
  } finally {
    let cleanupError: unknown = null;
    try {
      await cleanup();
      const after = await counts();
      const ctl = (await sql`SELECT paused, updated_by FROM x_publishing_control WHERE id = 1`) as Array<Record<string, unknown>>;
      const restored = controlBefore[0]
        ? ctl[0]?.paused === controlBefore[0].paused && ctl[0]?.updated_by === controlBefore[0].updated_by
        : ctl.length === 0;
      if (after.posts !== 0 || after.attempts !== 0 || after.events !== 0 || after.slots !== 0 || after.authorizations !== 0 || !restored) {
        throw new Error(`cleanup incomplete: ${JSON.stringify(after)} control restored ${restored}`);
      }
      log("cleanup verified: 0 posts, 0 attempts, 0 x_publishing events, 0 autopilot slots/authorizations; control row restored");
    } catch (e) {
      cleanupError = e;
    }
    __setSqlClientForTests(null);
    globalThis.fetch = realFetch;
    if (failure) throw failure;
    if (cleanupError) throw cleanupError;
  }
  console.log(`\n[x-db] ${passed} real-database assertions passed (X responses simulated; no X endpoint reachable).`);
}

main().catch((error) => {
  console.error("[x-db] FAILED — treat as an incomplete run:", error instanceof Error ? error.message : error);
  process.exit(1);
});
