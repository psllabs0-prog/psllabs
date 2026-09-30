/**
 * REAL-database test for the X draft assistant. Opt-in only, and only against
 * an isolated, disposable Neon database:
 *
 *   X_DRAFTS_DB_TEST=1 N8N_TEST_DATABASE_URL=<isolated DB URL> npm run test:x-drafts-db
 *
 * Drives the same handlers the n8n workflow calls. Model output is a fixed
 * in-process fixture (no model is called). Global fetch is guarded: any
 * request to a host other than the Neon test database fails the run.
 *
 * Refuses to run when the target host matches any application database URL
 * or the target contains business tables. Requires the x_publishing tables to
 * be empty, deletes only rows created during the run, restores the control
 * row, and verifies cleanup. Never prints connection details or tokens.
 */
import crypto from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { neon } from "@neondatabase/serverless";

import { __setSqlClientForTests } from "../lib/db/sql";
import { ensureMissionControlSchema } from "../lib/ops/mission-control/schema";
import { approveXPost, saveXDraft } from "../lib/x-publishing/admin-store";
import { handleXAdminGet } from "../lib/x-publishing/admin-api";
import { X_ACCOUNT_ID } from "../lib/x-publishing/constants";
import { checkPostText } from "../lib/x-publishing/content";
import { getPost, previewHashFor, type XPostRecord } from "../lib/x-publishing/records";
import { ensureXPublishingSchema } from "../lib/x-publishing/schema";
import { X_DRAFT_AI_LABEL, X_DRAFT_ASSISTANT_ACTOR, X_DRAFT_LIMITS } from "../lib/x-drafts/constants";
import { __resetXDraftRateLimitersForTests, handleXDraftRequest, type XDraftAction } from "../lib/x-drafts/handlers";
import { batchSigningKey } from "../lib/x-drafts/config";
import { draftItemId, signBatchToken, X_DRAFT_PACKET_VERSION } from "../lib/x-drafts/packet";

let passed = 0;
function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
  passed++;
}
const log = (m: string) => console.log(`[x-drafts-db] ${m}`);

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

const TAG = `xdraftsdb-${Date.now().toString(36)}`;
const DRAFT_TOKEN = crypto.randomBytes(48).toString("base64url");
const PUBLISHER_TOKEN = crypto.randomBytes(48).toString("base64url");
type Env = Record<string, string | undefined>;
type Body = Record<string, unknown>;
const testEnv: Env = {
  X_DRAFT_ASSISTANT_ENABLED: "true",
  X_DRAFT_ASSISTANT_TOKEN: DRAFT_TOKEN,
  X_PUBLISHER_TOKEN: PUBLISHER_TOKEN,
  X_EXPECTED_ACCOUNT_ID: X_ACCOUNT_ID,
};
const liveEnv: Env = { ...testEnv, VERCEL_ENV: "production" };

const refusedHosts: string[] = [];
let allowedFetches = 0;
let seq = 0;

const DAY1 = new Date("2031-04-01T18:00:00.000Z");
const DAY2 = new Date("2031-04-02T18:00:00.000Z");
const DAY3 = new Date("2031-04-03T18:00:00.000Z");

const COA = "science:how-to-read-a-coa";
const EXCERPT = { sourceId: COA, quote: "Results apply only to the tested sample identified in that report." };
const cand = (text: string) => ({ text, sourceIds: [COA], excerpt: EXCERPT, purpose: "What does a COA actually cover?", warnings: [] });
const WORDS = ["amber", "birch", "cedar", "delta", "ember", "fjord", "grove", "harbor", "indigo", "juniper", "kestrel", "lagoon", "meadow", "nectar", "orchid", "prairie"];
const textFor = (w: string) => `Check the lot on your label against the original laboratory report before filing it (${w}). Results apply only to the tested sample identified in that report.`;

async function call(action: XDraftAction, body: unknown, now: Date, env: Env = testEnv, auth = `Bearer ${DRAFT_TOKEN}`) {
  __resetXDraftRateLimitersForTests();
  const res = await handleXDraftRequest(
    new Request(`https://psl.test/api/integrations/n8n/x-drafts/${action === "packet" ? "packet" : "batches"}`, {
      method: "POST",
      headers: { authorization: auth, "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    action,
    { env, now }
  );
  return { status: res.status, body: (await res.json()) as Body };
}

async function packet(now: Date, env: Env = testEnv) {
  const p = await call("packet", { executionId: `p${++seq}` }, now, env);
  assert(p.status === 200 && typeof p.body.batchToken === "string", `packet issued (${JSON.stringify(p.body.error ?? "")})`);
  return { batchId: String(p.body.batchId), batchToken: String(p.body.batchToken), isTest: p.body.isTest };
}

const submit = (batchToken: string, candidates: unknown[], now: Date, env: Env = testEnv) =>
  call("batch", { batchToken, executionId: `b${++seq}`, model: "fixture-model", stopReason: "end_turn", usage: null, modelOutput: JSON.stringify({ candidates }) }, now, env);

const counts = (b: Body) => b.counts as { candidates: number; saved: number; alreadySaved: number; blocked: number };

async function main() {
  if (process.env.X_DRAFTS_DB_TEST !== "1") {
    console.log("[x-drafts-db] skipped: set X_DRAFTS_DB_TEST=1 and N8N_TEST_DATABASE_URL (isolated DB only).");
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

  const tally = async () =>
    (
      (await sql`
        SELECT (SELECT COUNT(*)::int FROM x_publishing_posts) AS posts,
               (SELECT COUNT(*)::int FROM x_publishing_attempts) AS attempts,
               (SELECT COUNT(*)::int FROM ops_activity_events WHERE source_system = 'x_publishing') AS events
      `) as Array<{ posts: number; attempts: number; events: number }>
    )[0];
  const before = await tally();
  assert(before.posts === 0 && before.attempts === 0 && before.events === 0, "isolated DB has no x_publishing rows before the run");
  const controlBefore = (await sql`SELECT paused, reason, updated_at, updated_by FROM x_publishing_control WHERE id = 1`) as Array<Record<string, unknown>>;

  const cleanup = async () => {
    await sql`DELETE FROM ops_activity_events WHERE source_system = 'x_publishing'`;
    await sql`DELETE FROM x_publishing_attempts WHERE post_id IN (SELECT id FROM x_publishing_posts WHERE created_by IN (${TAG}, ${X_DRAFT_ASSISTANT_ACTOR}))`;
    await sql`DELETE FROM x_publishing_posts WHERE created_by IN (${TAG}, ${X_DRAFT_ASSISTANT_ACTOR})`;
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
    // ---------- D1: packet issuance writes nothing ----------
    const p1 = await packet(DAY1);
    assert(p1.isTest === true, "D1: local packet targets the TEST partition");
    assert((await tally()).posts === 0, "D1: packet issuance wrote no rows");
    assert((await call("packet", { executionId: "x" }, DAY1, testEnv, `Bearer ${PUBLISHER_TOKEN}`)).status === 401, "D1: publisher token refused");

    // ---------- D2: batch saves drafts only ----------
    const batch2 = [cand(textFor(WORDS[0])), cand(textFor(WORDS[1])), { ...cand(textFor(WORDS[2])), sourceIds: [COA, "guide:verify-peptide-coa"] }];
    const r2 = await submit(p1.batchToken, batch2, DAY1);
    assert(r2.status === 200 && counts(r2.body).saved === 2 && counts(r2.body).blocked === 1, `D2: 2 saved, 1 blocked (${JSON.stringify(r2.body.counts)})`);
    assert(/unrecognized_source: guide:verify-peptide-coa/.test(JSON.stringify(r2.body.blocked)), "D2: removed guide-metadata source cannot be cited");
    const id1 = draftItemId(p1.batchId, 1);
    const id2 = draftItemId(p1.batchId, 2);
    const row1 = await getPost(id1);
    assert(row1 && row1.status === "draft" && row1.revision === 1 && row1.isTest && row1.createdBy === X_DRAFT_ASSISTANT_ACTOR, "D2: row is an unapproved TEST draft by x-draft-assistant");
    assert(row1.scheduledFor === null && row1.approvalHash === null && row1.approvedAt === null && row1.activeAttemptId === null, "D2: no schedule, approval, or attempt");
    assert(row1.text === textFor(WORDS[0]) && row1.sourceRefs[0].startsWith(X_DRAFT_AI_LABEL) && row1.sourceRefs.length <= 5, "D2: exact text with AI-assisted provenance");
    assert((await getPost(id2))?.text === textFor(WORDS[1]), "D2: second candidate stored under its own item ID");
    assert(!(await getPost(draftItemId(p1.batchId, 3))), "D2: blocked candidate not stored");
    const updated1 = row1.updatedAt;

    // ---------- D3: replay is idempotent ----------
    const r3 = await submit(p1.batchToken, batch2, DAY1);
    assert(counts(r3.body).saved === 0 && counts(r3.body).alreadySaved === 2, `D3: replay reports already saved (${JSON.stringify(r3.body.counts)})`);
    assert((await tally()).posts === 2 && (await getPost(id1))!.updatedAt === updated1, "D3: replay created and modified nothing");

    // ---------- D4: conflicting content under the same item is never written ----------
    const r4 = await submit(p1.batchToken, [cand(textFor(WORDS[3])), cand(textFor(WORDS[1]))], DAY1);
    assert(/batch_item_conflict/.test(JSON.stringify(r4.body.blocked)) && counts(r4.body).alreadySaved === 1, "D4: changed item 1 reported as conflict; item 2 already saved");
    assert((await getPost(id1))!.text === textFor(WORDS[0]) && (await tally()).posts === 2, "D4: existing row unchanged, nothing added");

    // ---------- D5: exact duplicates blocked, near duplicates flagged ----------
    const p5 = await packet(DAY1);
    const nearText = textFor(WORDS[0]).replace("before filing it", "before you file it");
    const r5 = await submit(p5.batchToken, [cand(textFor(WORDS[0])), cand(nearText)], DAY1);
    assert(/duplicate_existing/.test(JSON.stringify(r5.body.blocked)) && counts(r5.body).saved === 1, `D5: exact duplicate blocked (${JSON.stringify(r5.body.counts)})`);
    const nearRow = await getPost(draftItemId(p5.batchId, 2));
    assert(nearRow && nearRow.sourceRefs.some((r) => /near_duplicate: queue /.test(r)), "D5: near duplicate saved with a review warning");

    // ---------- D6: approved posts are untouched ----------
    const ownerText = "Owner-approved COA note: results apply only to the tested sample identified in that report.";
    const d = await saveXDraft({ id: null, expectedRevision: null, text: ownerText, sourceRefs: [], scheduledForLocal: null, isTest: true, actor: TAG, now: new Date() });
    assert(d.status === 201, "D6: owner draft saved");
    const draftPost = d.body.post as XPostRecord;
    const a = await approveXPost({
      id: draftPost.id,
      expectedRevision: draftPost.revision,
      previewHash: previewHashFor(draftPost, "next_manual_run", checkPostText(draftPost.text)),
      scheduleKind: "next_manual_run",
      confirmPublic: true,
      confirmManualRun: true,
      acknowledgedWarnings: checkPostText(draftPost.text).warnings.map((w) => w.code),
      isTest: true,
      env: "test",
      actor: TAG,
      now: new Date(),
    });
    assert(a.status === 200, `D6: owner post approved (${JSON.stringify(a.body)})`);
    const approvedBefore = await getPost(draftPost.id);
    const p6 = await packet(DAY1);
    const r6 = await submit(p6.batchToken, [cand(ownerText)], DAY1);
    assert(/duplicate_existing/.test(JSON.stringify(r6.body.blocked)), "D6: assistant cannot re-propose an approved post's text");
    const approvedAfter = await getPost(draftPost.id);
    assert(JSON.stringify(approvedAfter) === JSON.stringify(approvedBefore), "D6: approved post unchanged (status, revision, approval, timestamps)");

    // ---------- D7: daily cap under the lock, and packet refused at the cap ----------
    const capWords = WORDS.slice(3, 3 + X_DRAFT_LIMITS.maxDraftsPerPhoenixDay + 1);
    const pa = await packet(DAY2);
    const ra = await submit(pa.batchToken, capWords.slice(0, 5).map((w) => cand(textFor(w))), DAY2);
    const pb = await packet(DAY2);
    const rb = await submit(pb.batchToken, capWords.slice(5, 10).map((w) => cand(textFor(w))), DAY2);
    assert(counts(ra.body).saved === 5 && counts(rb.body).saved === 5, `D7: ${X_DRAFT_LIMITS.maxDraftsPerPhoenixDay} drafts saved on day 2`);
    const capped = await call("packet", { executionId: "cap" }, DAY2);
    assert(capped.status === 429, "D7: packet refused once the daily cap is reached (no model spend)");
    const replayB = await submit(pb.batchToken, capWords.slice(5, 10).map((w) => cand(textFor(w))), DAY2);
    assert(counts(replayB.body).alreadySaved === 5 && counts(replayB.body).saved === 0, "D7: replay at the cap still reports already saved");
    // The packet endpoint refuses at the cap, so sign a batch directly to prove the insert itself is capped.
    const extraToken = signBatchToken({ batchId: crypto.randomUUID(), packetVersion: X_DRAFT_PACKET_VERSION, issuedAt: DAY2.toISOString(), isTest: true }, batchSigningKey(testEnv)!);
    const rc = await submit(extraToken, [cand(textFor(capWords[10]))], DAY2);
    assert(/daily_cap/.test(JSON.stringify(rc.body.blocked)) && counts(rc.body).saved === 0, "D7: insert past the cap refused inside the locked transaction");
    const day2Count = (await sql`
      SELECT COUNT(*)::int AS n FROM x_publishing_posts
      WHERE created_by = ${X_DRAFT_ASSISTANT_ACTOR} AND (created_at AT TIME ZONE 'America/Phoenix')::date = '2031-04-02'::date
    `) as Array<{ n: number }>;
    assert(day2Count[0].n === X_DRAFT_LIMITS.maxDraftsPerPhoenixDay, "D7: exactly the cap stored for that Phoenix day");

    // ---------- D8: live vs TEST partitions ----------
    assert((await submit(pa.batchToken, [cand(textFor(WORDS[0]))], DAY2, liveEnv)).status === 409, "D8: TEST batch refused in live mode");
    const pl = await packet(DAY3, liveEnv);
    assert(pl.isTest === false, "D8: Production packet targets the live partition");
    const rl = await submit(pl.batchToken, [cand(textFor(WORDS[0]))], DAY3, liveEnv);
    assert(counts(rl.body).saved === 1, "D8: same text allowed in the other partition (dedupe is per partition)");
    const liveRow = await getPost(draftItemId(pl.batchId, 1));
    assert(liveRow && liveRow.isTest === false && liveRow.status === "draft", "D8: live-partition row is an unapproved draft");
    assert((await getPost(id1))!.isTest === true, "D8: TEST rows unaffected");

    // ---------- D9: owner review surface ----------
    const admin = await handleXAdminGet({ env: { X_EXPECTED_ACCOUNT_ID: X_ACCOUNT_ID }, now: DAY1 });
    const sections = admin.body.sections as Record<string, { posts: XPostRecord[] }>;
    const visible = Object.values(sections).flatMap((s) => s.posts).filter((p) => p.createdBy === X_DRAFT_ASSISTANT_ACTOR);
    assert(visible.length > 0 && visible.every((p) => p.status === "draft" && p.isTest), "D9: /admin-social lists assistant drafts as TEST drafts");

    // ---------- D10: activity events and untouched publisher state ----------
    const events = (await sql`
      SELECT source_event_key, summary FROM ops_activity_events WHERE source_system = 'x_publishing' AND event_type = 'x_drafts_proposed'
    `) as Array<{ source_event_key: string; summary: string }>;
    assert(events.length >= 6 && events.some((e) => e.source_event_key.endsWith(p1.batchId)), "D10: one event per batch (replays deduplicated by key)");
    assert(events.filter((e) => e.source_event_key.endsWith(p1.batchId)).length === 1, "D10: replays of a batch add no events");
    assert(events.every((e) => !e.summary.includes("laboratory report") && /owner review required/.test(e.summary)), "D10: counts-only summaries");
    assert((await tally()).attempts === 0, "D10: no publishing attempts created");
    const ctl = (await sql`SELECT paused, updated_by FROM x_publishing_control WHERE id = 1`) as Array<Record<string, unknown>>;
    assert(controlBefore[0] ? ctl[0]?.updated_by === controlBefore[0].updated_by : ctl.length === 0, "D10: queue control untouched (not resumed)");

    assert(refusedHosts.length === 0, `no network requests outside the test database (refused: ${refusedHosts.join(",")})`);
    log(`network guard: ${allowedFetches} database requests allowed, ${refusedHosts.length} refused`);
  } catch (error) {
    failure = error;
  } finally {
    let cleanupError: unknown = null;
    try {
      await cleanup();
      const after = await tally();
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
  console.log(`\n[x-drafts-db] ${passed} real-database assertions passed (model output is a fixture; no model or X endpoint reachable).`);
}

main().catch((error) => {
  console.error("[x-drafts-db] FAILED — treat as an incomplete run:", error instanceof Error ? error.message : error);
  process.exit(1);
});
