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
} from "../lib/x-publishing/admin-store";
import { X_ACCOUNT_ID, X_LIMITS, X_PROVENANCE } from "../lib/x-publishing/constants";
import { checkPostText } from "../lib/x-publishing/content";
import {
  __resetXMachineRateLimiterForTests,
  handleXMachineRequest,
  type XMachineAction,
} from "../lib/x-publishing/handlers";
import { tokenHash } from "../lib/x-publishing/hash";
import { getAttempt, getControl, getPost, previewHashFor, type ScheduleKind, type XPostRecord } from "../lib/x-publishing/records";
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
               (SELECT COUNT(*)::int FROM ops_activity_events WHERE source_system = 'x_publishing') AS events
      `) as Array<{ posts: number; attempts: number; events: number }>
    )[0];
  const before = await counts();
  assert(before.posts === 0 && before.attempts === 0 && before.events === 0, "isolated DB has no x_publishing rows before the run");
  const controlBefore = (await sql`SELECT paused, reason, updated_at, updated_by FROM x_publishing_control WHERE id = 1`) as Array<Record<string, unknown>>;

  const texts: string[] = [];
  const cleanup = async () => {
    await sql`DELETE FROM ops_activity_events WHERE source_system = 'x_publishing'`;
    await sql`DELETE FROM x_publishing_attempts WHERE post_id IN (SELECT id FROM x_publishing_posts WHERE created_by = ${TAG})`;
    await sql`DELETE FROM x_publishing_posts WHERE created_by = ${TAG}`;
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

    // ---------- S3: daily cap under concurrent permit requests (simulated raced claim) ----------
    for (const [t, dn] of [6, 8, 10].entries()) {
      const dA = day(dn);
      const dB = day(dn + 1);
      const b = await draft(textFor(`s3t${t}b`), `${dB}T00:00`);
      assert((await approve(b, "scheduled", at(`${dA}T22:00`))).status === 200, "B approved for 00:00 next day");
      const a = await approvedManual(`s3t${t}a`, at(`${dA}T23:50`));
      const now = at(`${dB}T00:01`);
      const wA = await claimPublish(now, "s3 A");
      assert(wA.queueId === a.id, "earliest due item claimed first");
      const blocked = await claim(now);
      assert(blocked.body.work === null, "claim-time cap: a second concurrent claim is refused while A is in flight");
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
      log(`S3 trial ${t + 1}: two due items, simultaneous permit requests → issued ${issued}, other: ${denied?.body.code}`);
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
      assert((await approve(same, "next_manual_run", at(`${d}T09:05`))).status === 409, "the day's dispatch was used; same-day approval refused");
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
      if (after.posts !== 0 || after.attempts !== 0 || after.events !== 0 || !restored) {
        throw new Error(`cleanup incomplete: ${JSON.stringify(after)} control restored ${restored}`);
      }
      log("cleanup verified: 0 posts, 0 attempts, 0 x_publishing events; control row restored");
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
