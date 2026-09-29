/**
 * Offline tests for the n8n → Mission Control connection-test bridge:
 * fail-closed gating, authentication, strict validation, idempotent and
 * reorder-safe lifecycle reports, timeout → outcome unknown, TEST/EXCLUDED
 * storage, and absence of business side effects. Every SQL statement goes
 * through a recording fake; no database or network is used.
 * Run: npm run test:mission-control
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { NeonQueryFunction } from "@neondatabase/serverless";

import { __setSqlClientForTests } from "../lib/db/sql";
import {
  handleMissionControlGet,
  type MissionControlResponseBody,
} from "../lib/ops/mission-control/api";
import { normalizeActivityEvent } from "../lib/ops/mission-control/events";
import {
  getN8nIntegrationMode,
  verifyN8nAuthorization,
} from "../lib/ops/mission-control/n8n/config";
import {
  __resetN8nRateLimiterForTests,
  handleN8nRequest,
  N8N_REQUESTS_PER_MINUTE,
  type N8nAction,
} from "../lib/ops/mission-control/n8n/handlers";
import {
  N8N_CONNECTION_TEST_TIMEOUT_MS,
  N8N_REGISTRATION_LIMIT,
  N8N_REGISTRATION_MAX_ATTEMPTS,
  N8N_REGISTRATION_WINDOW_MS,
} from "../lib/ops/mission-control/n8n/runs";
import { N8N_MAX_BODY_BYTES, N8N_WORKFLOW_ID } from "../lib/ops/mission-control/n8n/validate";
import { filterActivityFeed, type ActivityEvent } from "../lib/ops/mission-control/types";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

const TOKEN = "n8n-test-token-0123456789abcdef-XYZ";
const BASE = "https://psl.test/api/integrations/n8n/mission-control/runs";
const T0 = Date.parse("2026-09-28T18:00:00.000Z");
const STALE_AT = "2026-09-20T00:00:00.000Z";

const DDL_RE =
  /^\s*(CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|COMMENT)\b|\b(CREATE|ALTER)\s+(TABLE|INDEX|UNIQUE|OR\s+REPLACE|FUNCTION|EXTENSION|SCHEMA)\b/i;
const WRITE_RE = /\bINSERT\s+INTO\b|\bDELETE\s+FROM\b|^\s*UPDATE\s|\bUPDATE\s+\w+\s+SET\b/i;

type Row = Record<string, unknown>;
type Call = { text: string; values: unknown[] };

let clock = T0;
const now = () => new Date(clock);

const tick = () => new Promise<void>((r) => setImmediate(r));

/**
 * Recording fake. Transactions are simulated adversarially: statements of
 * concurrent transactions interleave (each yields to the event loop), a
 * transaction's inserts stay invisible to others until it commits (READ
 * COMMITTED), and `pg_advisory_xact_lock` is a mutex released only after
 * commit. `ignoreAdvisoryLock` is the negative control. This is a simulation,
 * not proof of Postgres behaviour; see test-mission-control-n8n-db.ts.
 */
function createFakeSql(opts: { tablesExist: boolean; ignoreAdvisoryLock?: boolean }) {
  const calls: Call[] = [];
  const rows: Row[] = [];
  const transactions: Array<{ texts: string[]; options: unknown }> = [];
  let nextId = 1;
  let nextTx = 1;
  let raceNextInsert: Row | null = null;
  let lockHeld: Promise<void> | null = null;
  let failNext: { count: number; code: string } = { count: 0, code: "40001" };

  const visible = (r: Row, tx: number | null) => r.pending_tx === undefined || r.pending_tx === tx;
  const committed = (tx: number | null) => rows.filter((r) => visible(r, tx));

  const respond = (text: string, values: unknown[], tx: number | null): unknown[] => {
    if (/to_regclass/i.test(text)) {
      return [
        {
          events: opts.tablesExist ? "ops_activity_events" : null,
          sync_state: opts.tablesExist ? "ops_activity_sync_state" : null,
        },
      ];
    }
    if (!opts.tablesExist && /\bops_activity_(events|sync_state)\b/.test(text)) {
      throw new Error('relation "ops_activity_events" does not exist');
    }
    if (/^SET LOCAL lock_timeout/.test(text) || /pg_advisory_xact_lock/.test(text)) return [];
    if (/^INSERT INTO ops_activity_events .* SELECT .* WHERE \( SELECT COUNT\(\*\) FROM ops_activity_events/.test(text)) {
      assert(tx !== null, "quota insert must run inside a transaction");
      if (raceNextInsert) {
        rows.push({ ...raceNextInsert, id: nextId++ });
        raceNextInsert = null;
      }
      const key = values[0] as string;
      if (rows.some((r) => r.source_event_key === key)) return [];
      const since = Date.parse(values[12] as string);
      const used = committed(tx).filter(
        (r) =>
          r.source_system === "n8n" &&
          r.event_type === values[11] &&
          (r.received_at as Date).getTime() > since
      ).length;
      if (used >= Number(values[13])) return [];
      const row: Row = {
        id: nextId++,
        source_event_key: key,
        correlation_id: values[1],
        parent_task_id: null,
        source_system: values[2],
        worker: values[3],
        event_type: values[4],
        outcome: values[5],
        observation: values[6],
        occurred_at: new Date(values[7] as string),
        summary: values[8],
        source_ref: values[9],
        source_href: null,
        excluded: true,
        versions_json: JSON.parse(values[10] as string),
        received_at: new Date(clock),
        estimated_cost_usd: null,
        provider_cost_usd: null,
        pending_tx: tx,
      };
      rows.push(row);
      return [row];
    }
    if (/^INSERT INTO ops_activity_events .* VALUES .*DO NOTHING RETURNING \*$/i.test(text)) {
      const key = values[0] as string;
      if (rows.some((r) => r.source_event_key === key)) return [];
      const row: Row = {
        id: nextId++,
        source_event_key: key,
        correlation_id: values[1],
        parent_task_id: values[2],
        source_system: values[3],
        worker: values[4],
        event_type: values[5],
        outcome: values[6],
        observation: values[7],
        occurred_at: new Date(values[8] as string),
        summary: values[9],
        source_ref: values[10],
        source_href: values[11],
        excluded: values[12],
        versions_json: JSON.parse(values[13] as string),
        received_at: new Date(clock),
        estimated_cost_usd: null,
        provider_cost_usd: null,
      };
      rows.push(row);
      return [row];
    }
    if (/WHERE source_event_key = \$\? AND source_system = 'n8n'/.test(text)) {
      return committed(tx).filter((r) => r.source_event_key === values[0] && r.source_system === "n8n");
    }
    if (/WHERE source_system = 'n8n' AND correlation_id = \$\?/.test(text)) {
      return committed(tx).filter((r) => r.source_system === "n8n" && r.correlation_id === values[0]);
    }
    if (/FROM ops_activity_events WHERE source_system = 'n8n' ORDER BY id DESC/.test(text)) {
      return committed(tx).filter((r) => r.source_system === "n8n").sort((a, b) => Number(b.id) - Number(a.id));
    }
    if (/SELECT \* FROM ops_activity_events ORDER BY id DESC/.test(text)) {
      return committed(tx).sort((a, b) => Number(b.id) - Number(a.id));
    }
    // Worker observers: one stale source and one unreadable source.
    if (/DISTINCT ON \(provider\)/.test(text)) {
      return [{ provider: "gsc", status: "ok", started_at: STALE_AT, completed_at: STALE_AT, id: 1 }];
    }
    if (/SELECT completed_at AS at FROM external_metric_sync_runs/.test(text)) {
      return [{ at: STALE_AT }];
    }
    if (/inventory_monitor_snapshots/.test(text)) {
      throw new Error('relation "inventory_monitor_snapshots" does not exist');
    }
    return [];
  };

  const exec = (text: string, values: unknown[], tx: number | null) => {
    calls.push({ text, values });
    return respond(text, values, tx);
  };

  type LazyQuery = PromiseLike<unknown[]> & { text: string; values: unknown[] };
  const fn = (strings: TemplateStringsArray, ...values: unknown[]): LazyQuery => {
    const text = strings.join("$?").replace(/\s+/g, " ").trim();
    return {
      text,
      values,
      then(onFulfilled, onRejected) {
        return new Promise<unknown[]>((resolve) => resolve(exec(text, values, null))).then(
          onFulfilled,
          onRejected
        );
      },
    };
  };
  (fn as unknown as { transaction: unknown }).transaction = async (
    queries: LazyQuery[],
    options: unknown
  ) => {
    transactions.push({ texts: queries.map((q) => q.text), options });
    if (failNext.count > 0) {
      failNext.count--;
      throw Object.assign(new Error("simulated contention"), { code: failNext.code });
    }
    const tx = nextTx++;
    let release: (() => void) | null = null;
    try {
      const results: unknown[][] = [];
      for (const q of queries) {
        await tick();
        if (/pg_advisory_xact_lock/.test(q.text) && !opts.ignoreAdvisoryLock) {
          while (lockHeld) await lockHeld;
          lockHeld = new Promise<void>((r) => {
            release = () => {
              lockHeld = null;
              r();
            };
          });
        }
        results.push(exec(q.text, q.values, tx));
      }
      await tick();
      for (const r of rows) if (r.pending_tx === tx) delete r.pending_tx;
      return results;
    } catch (error) {
      for (let i = rows.length - 1; i >= 0; i--) if (rows[i].pending_tx === tx) rows.splice(i, 1);
      throw error;
    } finally {
      (release as (() => void) | null)?.();
    }
  };
  return {
    sql: fn as unknown as NeonQueryFunction<false, false>,
    calls,
    rows,
    transactions,
    raceNext(row: Row) {
      raceNextInsert = row;
    },
    failNextTransactions(count: number, code = "40001") {
      failNext = { count, code };
    },
    ddl: () => calls.filter((c) => DDL_RE.test(c.text)),
    writes: () => calls.filter((c) => WRITE_RE.test(c.text)),
  };
}

const ENABLED_ENV = {
  MISSION_CONTROL_N8N_ENABLED: "true",
  MISSION_CONTROL_N8N_TOKEN: TOKEN,
  MISSION_CONTROL_N8N_ALLOW_PREVIEW: undefined,
  MISSION_CONTROL_SYNC_ENABLED: "true",
  MISSION_CONTROL_SYNC_ALLOW_PREVIEW: undefined,
  VERCEL_ENV: undefined,
  VERCEL: undefined,
  ADMIN_PASSWORD: "admin-password-for-tests",
  CRON_SECRET: "cron-secret-for-tests",
};

function setEnv(values: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(values)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

function req(
  path: string,
  init: { body?: string | object; token?: string | null; headers?: Record<string, string> } = {}
): Request {
  const headers = new Headers(init.headers ?? {});
  const token = init.token === undefined ? TOKEN : init.token;
  if (token !== null) headers.set("authorization", `Bearer ${token}`);
  let body: string | undefined;
  if (init.body !== undefined) {
    body = typeof init.body === "string" ? init.body : JSON.stringify(init.body);
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
  }
  return new Request(`${BASE}${path}`, { method: "POST", headers, body });
}

async function call(
  action: N8nAction,
  path: string,
  init?: Parameters<typeof req>[1]
): Promise<{ status: number; body: Record<string, unknown>; headers: Headers }> {
  const res = await handleN8nRequest(req(path, init), action, { now: now() });
  return { status: res.status, body: (await res.json()) as Record<string, unknown>, headers: res.headers };
}

const register = (requestId: string, n8nExecutionId: string | null = "exec-1") =>
  call({ kind: "register" }, "", {
    body: { requestId, workflow: N8N_WORKFLOW_ID, n8nExecutionId },
  });
const status = (runId: string) => call({ kind: "status", runId }, `/${runId}/status`);
const report = (runId: string, body: object) =>
  call({ kind: "events", runId }, `/${runId}/events`, { body });

function reset(fake: ReturnType<typeof createFakeSql>) {
  __setSqlClientForTests(fake.sql);
  __resetN8nRateLimiterForTests();
  clock = T0;
}

function testIntegrationMode() {
  const base = { MISSION_CONTROL_SYNC_ENABLED: "true" };
  assert(!getN8nIntegrationMode({}).enabled, "unset → disabled");
  assert(
    !getN8nIntegrationMode({ ...base, MISSION_CONTROL_N8N_TOKEN: TOKEN }).enabled,
    "token without enable flag → disabled"
  );
  assert(
    !getN8nIntegrationMode({ ...base, MISSION_CONTROL_N8N_ENABLED: "true" }).enabled,
    "enabled without token → disabled"
  );
  assert(
    !getN8nIntegrationMode({ ...base, MISSION_CONTROL_N8N_ENABLED: "true", MISSION_CONTROL_N8N_TOKEN: "short" }).enabled,
    "short token → disabled"
  );
  for (const other of ["ADMIN_PASSWORD", "CRON_SECRET", "BTCPAY_WEBHOOK_SECRET"]) {
    assert(
      !getN8nIntegrationMode({
        ...base,
        MISSION_CONTROL_N8N_ENABLED: "true",
        MISSION_CONTROL_N8N_TOKEN: TOKEN,
        [other]: TOKEN,
      }).enabled,
      `token reused as ${other} → disabled`
    );
  }
  assert(
    !getN8nIntegrationMode({
      ...base,
      MISSION_CONTROL_N8N_ENABLED: "true",
      MISSION_CONTROL_N8N_TOKEN: TOKEN,
      DATABASE_URL: `postgres://u:${TOKEN}@host/db`,
    }).enabled,
    "token embedded in DATABASE_URL → disabled"
  );
  assert(
    !getN8nIntegrationMode({ MISSION_CONTROL_N8N_ENABLED: "true", MISSION_CONTROL_N8N_TOKEN: TOKEN }).enabled,
    "Mission Control writes off → disabled"
  );
  const preview = {
    ...base,
    MISSION_CONTROL_N8N_ENABLED: "true",
    MISSION_CONTROL_N8N_TOKEN: TOKEN,
    VERCEL_ENV: "preview",
    MISSION_CONTROL_SYNC_ALLOW_PREVIEW: "true",
  };
  assert(!getN8nIntegrationMode(preview).enabled, "preview needs n8n-specific opt-in");
  assert(
    !getN8nIntegrationMode({ ...preview, MISSION_CONTROL_N8N_ALLOW_PREVIEW: "true", MISSION_CONTROL_SYNC_ALLOW_PREVIEW: undefined }).enabled,
    "preview also needs the Mission Control preview opt-in"
  );
  assert(
    getN8nIntegrationMode({ ...preview, MISSION_CONTROL_N8N_ALLOW_PREVIEW: "true" }).enabled,
    "preview with both opt-ins → enabled"
  );
  assert(
    getN8nIntegrationMode({ ...base, MISSION_CONTROL_N8N_ENABLED: "true", MISSION_CONTROL_N8N_TOKEN: TOKEN }).enabled,
    "fully configured → enabled"
  );
  console.log("ok integration mode fails closed");
}

function testAuthorizationHeader() {
  const env = { MISSION_CONTROL_N8N_TOKEN: TOKEN };
  assert(verifyN8nAuthorization(`Bearer ${TOKEN}`, env), "correct bearer accepted");
  assert(!verifyN8nAuthorization(null, env), "missing header rejected");
  assert(!verifyN8nAuthorization(TOKEN, env), "bare token rejected");
  assert(!verifyN8nAuthorization(`Basic ${TOKEN}`, env), "basic scheme rejected");
  assert(!verifyN8nAuthorization(`Bearer ${TOKEN}x`, env), "wrong token rejected");
  assert(!verifyN8nAuthorization(`Bearer ${TOKEN} extra`, env), "trailing data rejected");
  assert(!verifyN8nAuthorization(`Bearer ${TOKEN}`, {}), "no configured token rejects all");
  console.log("ok authorization header");
}

async function testGatesBeforeDatabase() {
  const fake = createFakeSql({ tablesExist: true });
  reset(fake);

  setEnv({ ...ENABLED_ENV, MISSION_CONTROL_N8N_ENABLED: undefined });
  let r = await register("req-disabled-0001");
  assert(r.status === 503, `disabled → 503, got ${r.status}`);
  setEnv({ ...ENABLED_ENV, MISSION_CONTROL_N8N_TOKEN: undefined });
  r = await register("req-disabled-0002");
  assert(r.status === 503, "missing credential → 503");
  setEnv({ ...ENABLED_ENV, MISSION_CONTROL_SYNC_ENABLED: undefined });
  r = await register("req-disabled-0003");
  assert(r.status === 503, "Mission Control writes off → 503");

  setEnv(ENABLED_ENV);
  r = await call({ kind: "register" }, "", { token: null, body: { requestId: "req-noauth-0001", workflow: N8N_WORKFLOW_ID } });
  assert(r.status === 401 && r.headers.get("www-authenticate") === "Bearer", "missing auth → 401");
  r = await call({ kind: "register" }, "", { token: "wrong-token-wrong-token-wrong-token", body: {} });
  assert(r.status === 401, "wrong token → 401");
  r = await call({ kind: "register" }, "", {
    token: null,
    headers: { cookie: "psl_admin_session=admin:9999999999999.deadbeef" },
    body: { requestId: "req-cookie-0001", workflow: N8N_WORKFLOW_ID },
  });
  assert(r.status === 401, "admin session cookie is not an n8n credential");
  r = await call({ kind: "register" }, `?token=${TOKEN}`, { token: null, body: {} });
  assert(r.status === 400, "credentials in the URL are refused");
  r = await call({ kind: "register" }, "?x=1", { body: {} });
  assert(r.status === 400, "any query string is refused");

  setEnv({ ...ENABLED_ENV, VERCEL: "1" });
  r = await register("req-http-00001");
  assert(r.status === 400, "on Vercel, non-HTTPS forwarded proto → 400");
  r = await call({ kind: "register" }, "", {
    headers: { "x-forwarded-proto": "https" },
    body: { requestId: "req-https-0001", workflow: N8N_WORKFLOW_ID },
  });
  assert(r.status === 201, `HTTPS on Vercel accepted, got ${r.status}`);
  setEnv(ENABLED_ENV);
  console.log("ok gating and auth");
}

async function testNoDbCallsWhenRejected() {
  const fake = createFakeSql({ tablesExist: true });
  reset(fake);
  setEnv({ ...ENABLED_ENV, MISSION_CONTROL_N8N_ENABLED: undefined });
  await register("req-nodb-00001");
  setEnv(ENABLED_ENV);
  await call({ kind: "register" }, "", { token: null, body: {} });
  await call({ kind: "status", runId: "not-a-run" }, "/not-a-run/status");
  assert(fake.calls.length === 0, `rejected requests must not query the DB (got ${fake.calls.length})`);
  console.log("ok rejected requests make no database calls");
}

async function testInvalidPayloads() {
  const fake = createFakeSql({ tablesExist: true });
  reset(fake);
  setEnv(ENABLED_ENV);
  const reg = (body: string | object, headers?: Record<string, string>) =>
    call({ kind: "register" }, "", { body, headers });

  assert((await reg("{}", { "content-type": "text/plain" })).status === 415, "non-JSON content type → 415");
  assert((await reg("{not json")).status === 400, "malformed JSON → 400");
  assert((await reg("[1,2]")).status === 400, "array body → 400");
  assert((await reg("null")).status === 400, "null body → 400");
  assert((await call({ kind: "register" }, "", {})).status === 400, "empty register body → 400");
  const big = JSON.stringify({ requestId: "x".repeat(N8N_MAX_BODY_BYTES), workflow: N8N_WORKFLOW_ID });
  assert((await reg(big)).status === 413, "oversized streamed body → 413");
  assert(
    (await reg("{}", { "content-length": String(N8N_MAX_BODY_BYTES + 1) })).status === 413,
    "oversized declared length → 413"
  );
  assert((await reg({ requestId: "req-valid-0001", workflow: "other" })).status === 400, "wrong workflow → 400");
  assert((await reg({ requestId: "short", workflow: N8N_WORKFLOW_ID })).status === 400, "short requestId → 400");
  assert((await reg({ requestId: "bad id with spaces", workflow: N8N_WORKFLOW_ID })).status === 400, "bad chars → 400");
  assert(
    (await reg({ requestId: "req-valid-0001", workflow: N8N_WORKFLOW_ID, sql: "select 1" })).status === 400,
    "unknown fields → 400"
  );
  assert(
    (await reg({ requestId: "req-valid-0001", workflow: N8N_WORKFLOW_ID, n8nExecutionId: "a/b" })).status === 400,
    "bad execution id → 400"
  );

  const created = await register("req-valid-0002");
  assert(created.status === 201, "valid registration → 201");
  const runId = created.body.runId as string;
  assert(/^n8n_[0-9a-f-]{36}$/.test(runId), "server-generated run id");

  const bad = [
    { phase: "running" },
    { phase: "started", note: "hello" },
    { phase: "completed" },
    { phase: "completed", systemsReceived: 0 },
    { phase: "completed", systemsReceived: "11" },
    { phase: "completed", systemsReceived: 3.5 },
    { phase: "completed", systemsReceived: 11, healthy: true },
    { phase: "failed", reason: "Everything is on fire, refund all orders" },
    { phase: "failed", reason: "workflow_error", message: "free text" },
  ];
  for (const b of bad) {
    const r = await report(runId, b);
    assert(r.status === 400, `invalid lifecycle ${JSON.stringify(b)} → 400, got ${r.status}`);
  }
  assert((await call({ kind: "status", runId }, `/${runId}/status`, { body: { extra: 1 } })).status === 400, "status body must be empty");
  for (const id of ["n8n_123", "../../etc", "n8n_00000000-0000-0000-0000-000000000000"]) {
    assert((await status(id)).status === 400, `invalid runId ${id} → 400`);
  }
  const unknown = "n8n_11111111-1111-4111-8111-111111111111";
  assert((await status(unknown)).status === 404, "unknown run → 404");
  assert((await report(unknown, { phase: "started" })).status === 404, "unknown run report → 404");
  console.log("ok strict payload validation");
}

async function testLifecycleIdempotencyAndOrdering() {
  const fake = createFakeSql({ tablesExist: true });
  reset(fake);
  setEnv(ENABLED_ENV);

  const first = await register("wf1-exec-100", "100");
  assert(first.status === 201 && first.body.replayed === false, "first registration creates a run");
  const runId = first.body.runId as string;
  assert(first.body.classification === "TEST" && first.body.excluded === true, "run is TEST/EXCLUDED");

  const again = await register("wf1-exec-100", "100");
  assert(again.status === 200 && again.body.runId === runId && again.body.replayed === true, "retry returns same run");
  const conflict = await register("wf1-exec-100", "101");
  assert(conflict.status === 409, "reusing requestId with different content → 409");
  assert(fake.rows.length === 1, "retries created no duplicate rows");

  const early = await report(runId, { phase: "completed", systemsReceived: 11 });
  assert(early.status === 409, "completed before any summary was served → 409");

  const started = await report(runId, { phase: "started" });
  assert(started.status === 200 && started.body.applied === true && started.body.state === "running", "started recorded");
  const startedAgain = await report(runId, { phase: "started" });
  assert(startedAgain.status === 200 && startedAgain.body.applied === false, "duplicate started is a no-op");

  const summary = await status(runId);
  assert(summary.status === 200, `status summary served, got ${summary.status}`);
  const systems = summary.body.systems as Array<Record<string, unknown>>;
  assert(systems.length === 11, "one entry per registered system");
  const allowedKeys = ["system", "key", "status", "lastActivityAt", "lastRunAt", "lastSuccessAt", "note"];
  for (const s of systems) {
    assert(Object.keys(s).every((k) => allowedKeys.includes(k)), `summary exposes only minimal fields: ${Object.keys(s)}`);
  }
  const dataSync = systems.find((s) => s.key === "data_sync")!;
  assert(dataSync.status === "stale", `stale source stays stale, got ${String(dataSync.status)}`);
  const inventory = systems.find((s) => s.key === "inventory")!;
  assert(inventory.status === "unknown" && String(inventory.note).includes("not assumed healthy"), "unreadable source reported unavailable");
  const unavailable = summary.body.unavailableSources as string[];
  assert(unavailable.includes("data_sync") && unavailable.includes("inventory"), "unavailable sources listed");
  const again2 = await status(runId);
  assert(again2.status === 200, "status may be re-read while running");
  assert(fake.rows.filter((r) => r.event_type === "n8n_connection_test_status_served").length === 1, "status served recorded once");

  const mismatch = await report(runId, { phase: "completed", systemsReceived: 3 });
  assert(mismatch.status === 422, "completion count must match the served summary");

  const done = await report(runId, { phase: "completed", systemsReceived: 11 });
  assert(done.status === 200 && done.body.applied === true && done.body.state === "completed", "completed recorded");
  assert(String(done.body.meaning).includes("does not mean every business system is healthy"), "completion meaning stated");

  const doneAgain = await report(runId, { phase: "completed", systemsReceived: 11 });
  assert(doneAgain.status === 200 && doneAgain.body.applied === false, "duplicate completion is a no-op");
  assert((await report(runId, { phase: "failed", reason: "workflow_error" })).status === 409, "conflicting terminal → 409");
  assert((await report(runId, { phase: "completed", systemsReceived: 10 })).status === 409, "different completion → 409");

  const lateStart = await report(runId, { phase: "started" });
  assert(lateStart.status === 200 && lateStart.body.applied === false && lateStart.body.state === "completed", "late started does not reopen a completed run");
  assert((await status(runId)).status === 409, "no status summary after completion");
  assert(fake.rows.filter((r) => r.correlation_id === runId).length === 4, "exactly registered/started/served/terminal rows");

  const failRun = (await register("wf1-exec-200", "200")).body.runId as string;
  const failed = await report(failRun, { phase: "failed", reason: "status_request_failed" });
  assert(failed.status === 200 && failed.body.state === "failed", "failure recorded without a served summary");
  assert((await report(failRun, { phase: "failed", reason: "status_request_failed" })).body.applied === false, "duplicate failure no-op");

  fake.raceNext({
    source_event_key: "n8n:connection_test:request:wf1-exec-300",
    correlation_id: "n8n_22222222-2222-4222-8222-222222222222",
    source_system: "n8n",
    worker: "n8n",
    event_type: "n8n_connection_test_registered",
    outcome: "submitted",
    observation: "live",
    occurred_at: new Date(clock),
    received_at: new Date(clock),
    summary: "raced",
    excluded: true,
    versions_json: { requestFingerprint: "someone-else" },
  });
  assert((await register("wf1-exec-300", "300")).status === 409, "concurrent conflicting registration → 409");
  console.log("ok idempotent, reorder-safe lifecycle");
}

async function testTimeout() {
  const fake = createFakeSql({ tablesExist: true });
  reset(fake);
  setEnv(ENABLED_ENV);

  const runId = (await register("wf2-exec-100", "100")).body.runId as string;
  await report(runId, { phase: "started" });
  await status(runId);
  clock = T0 + N8N_CONNECTION_TEST_TIMEOUT_MS - 1000;
  const stillOpen = await handleMissionControlGet({ url: new URL("https://psl.test/x?snapshot=1"), headers: new Headers(), now: now() });
  const openRun = (stillOpen.body as MissionControlResponseBody).snapshot!.n8n.runs!.find((r) => r.runId === runId)!;
  assert(openRun.state === "running", "before timeout the run is running");

  clock = T0 + N8N_CONNECTION_TEST_TIMEOUT_MS + 1000;
  __resetN8nRateLimiterForTests();
  const late = await report(runId, { phase: "completed", systemsReceived: 11 });
  assert(late.status === 409 && late.body.state === "outcome_unknown", "late completion rejected; outcome unknown");
  assert((await report(runId, { phase: "started" })).status === 409, "late start rejected");
  assert((await status(runId)).status === 409, "no summary after timeout");
  const snap = await handleMissionControlGet({ url: new URL("https://psl.test/x?snapshot=1"), headers: new Headers(), now: now() });
  const run = (snap.body as MissionControlResponseBody).snapshot!.n8n.runs!.find((r) => r.runId === runId)!;
  assert(run.state === "outcome_unknown", `timed-out run shown as outcome unknown, got ${run.state}`);
  assert(!fake.rows.some((r) => r.event_type === "n8n_connection_test_completed"), "never marked completed");
  console.log("ok timeout → outcome unknown, never completed");
}

async function testRateLimits() {
  const fake = createFakeSql({ tablesExist: true });
  reset(fake);
  setEnv(ENABLED_ENV);
  for (let i = 0; i < N8N_REGISTRATION_LIMIT; i++) {
    assert((await register(`wf3-exec-${1000 + i}`, String(i))).status === 201, `registration ${i} ok`);
  }
  assert((await register("wf3-exec-9999", "9999")).status === 429, "registration limit enforced");
  assert((await register("wf3-exec-1000", "0")).status === 200, "replay still answered when limited");
  clock += N8N_REGISTRATION_WINDOW_MS + 1000;
  __resetN8nRateLimiterForTests();
  assert((await register("wf3-exec-9999", "9999")).status === 201, "limit window slides");

  __resetN8nRateLimiterForTests();
  let last = 0;
  for (let i = 0; i <= N8N_REQUESTS_PER_MINUTE; i++) {
    last = (await call({ kind: "register" }, "", { token: null, body: {} })).status;
  }
  assert(last === 429, "per-instance limiter caps request rate (including unauthenticated)");
  console.log("ok rate limits");
}

const registeredCount = (fake: ReturnType<typeof createFakeSql>) =>
  fake.rows.filter((r) => r.event_type === "n8n_connection_test_registered").length;

async function seedRegistrations(n: number, tag: string) {
  for (let i = 0; i < n; i++) {
    const r = await register(`${tag}-seed-${i}`, `${tag}${i}`);
    assert(r.status === 201, `seed ${i} → 201, got ${r.status}`);
  }
}

/** Simulated (mocked) concurrency — see the file header of createFakeSql. */
async function testConcurrentRegistrationQuota() {
  setEnv(ENABLED_ENV);

  const fake = createFakeSql({ tablesExist: true });
  reset(fake);
  await seedRegistrations(N8N_REGISTRATION_LIMIT - 1, "cq1");
  const pair = await Promise.all([register("cq1-new-a", "a1"), register("cq1-new-b", "b1")]);
  const statuses = pair.map((p) => p.status).sort();
  assert(statuses[0] === 201 && statuses[1] === 429, `two simultaneous → one 201 + one 429, got ${statuses}`);
  assert(registeredCount(fake) === N8N_REGISTRATION_LIMIT, "at most one additional run");

  const tx = fake.transactions.find((t) => t.texts.some((s) => /pg_advisory_xact_lock/.test(s)))!;
  assert(/^SET LOCAL lock_timeout/.test(tx.texts[0]), "lock timeout set first");
  assert(/pg_advisory_xact_lock/.test(tx.texts[1]), "advisory lock before the quota statement");
  assert(/^INSERT INTO ops_activity_events .* WHERE \( SELECT COUNT/.test(tx.texts[2]), "count and insert in one statement after the lock");
  assert((tx.options as { isolationLevel?: string }).isolationLevel === "ReadCommitted", "READ COMMITTED so the count sees prior commits");

  const burst = createFakeSql({ tablesExist: true });
  reset(burst);
  await seedRegistrations(N8N_REGISTRATION_LIMIT - 1, "cq2");
  const many = await Promise.all(
    Array.from({ length: 8 }, (_, i) => register(`cq2-burst-${i}`, `burst${i}`))
  );
  assert(many.filter((m) => m.status === 201).length === 1, "8 simultaneous → exactly one created");
  assert(registeredCount(burst) === N8N_REGISTRATION_LIMIT, "quota holds under burst");

  const control = createFakeSql({ tablesExist: true, ignoreAdvisoryLock: true });
  reset(control);
  await seedRegistrations(N8N_REGISTRATION_LIMIT - 1, "cq3");
  const unguarded = await Promise.all([register("cq3-new-a", "a3"), register("cq3-new-b", "b3")]);
  assert(
    unguarded.every((u) => u.status === 201) && registeredCount(control) === N8N_REGISTRATION_LIMIT + 1,
    "negative control: without the lock the simulation does exceed the quota"
  );

  const same = createFakeSql({ tablesExist: true });
  reset(same);
  const dup = await Promise.all([register("cq4-same", "s1"), register("cq4-same", "s1")]);
  const dupStatuses = dup.map((d) => d.status).sort();
  assert(dupStatuses[0] === 200 && dupStatuses[1] === 201, `same requestId concurrently → 201 + replay 200, got ${dupStatuses}`);
  assert(dup[0].body.runId === dup[1].body.runId && registeredCount(same) === 1, "one run for concurrent duplicates");
  const clash = await Promise.all([register("cq4-clash", "c1"), register("cq4-clash", "c2")]);
  assert(clash.map((c) => c.status).sort().join() === "201,409", "same requestId, different payload concurrently → 201 + 409");

  const slots = createFakeSql({ tablesExist: true });
  reset(slots);
  await seedRegistrations(N8N_REGISTRATION_LIMIT - 1, "cq5");
  const replays = await Promise.all([0, 1, 2].map((i) => register(`cq5-seed-${i}`, `cq5${i}`)));
  assert(replays.every((r) => r.status === 200 && r.body.replayed === true), "retries replay");
  assert((await register("cq5-final", "final")).status === 201, "retries did not consume the last slot");
  assert((await register("cq5-over", "over")).status === 429, "then the quota is full");
  console.log("ok registration quota holds under simulated concurrency (mocked)");
}

async function testContentionRetries() {
  setEnv(ENABLED_ENV);
  const fake = createFakeSql({ tablesExist: true });
  reset(fake);
  fake.failNextTransactions(N8N_REGISTRATION_MAX_ATTEMPTS - 1, "40001");
  const ok = await register("cr-retry-ok", "r1");
  assert(ok.status === 201, `retried serialization failures then succeeded, got ${ok.status}`);
  assert(fake.transactions.length === N8N_REGISTRATION_MAX_ATTEMPTS, "bounded attempts used");

  const busy = createFakeSql({ tablesExist: true });
  reset(busy);
  busy.failNextTransactions(N8N_REGISTRATION_MAX_ATTEMPTS, "55P03");
  const exhausted = await register("cr-busy-1", "r2");
  assert(exhausted.status === 503, `persistent lock timeouts → 503, got ${exhausted.status}`);
  assert(busy.transactions.length === N8N_REGISTRATION_MAX_ATTEMPTS, "no unbounded retry");
  assert(registeredCount(busy) === 0, "nothing stored after exhausted retries");

  const hard = createFakeSql({ tablesExist: true });
  reset(hard);
  hard.failNextTransactions(1, "XX000");
  const failed = await register("cr-hard-1", "r3");
  assert(failed.status === 500 && hard.transactions.length === 1, "non-contention errors are not retried");
  console.log("ok bounded contention retries");
}

async function testExclusionAndNoSideEffects() {
  const fake = createFakeSql({ tablesExist: true });
  reset(fake);
  setEnv(ENABLED_ENV);
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls++;
    throw new Error("network disabled in tests");
  }) as typeof fetch;
  try {
    const runId = (await register("wf4-exec-100", "100")).body.runId as string;
    await report(runId, { phase: "started" });
    await status(runId);
    await report(runId, { phase: "completed", systemsReceived: 11 });
    const failRun = (await register("wf4-exec-200", "200")).body.runId as string;
    await report(failRun, { phase: "failed", reason: "unexpected_response" });
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert(fetchCalls === 0, "no outbound network calls (no email, social, payment, shipping)");
  assert(fake.ddl().length === 0, "no DDL");
  const writes = fake.writes();
  assert(writes.length > 0, "sanity: events were written");
  for (const w of writes) {
    assert(/^INSERT INTO ops_activity_events \(/.test(w.text), `only activity-event inserts: ${w.text.slice(0, 80)}`);
    assert(!/DO UPDATE/i.test(w.text), "n8n inserts never update existing rows");
  }
  for (const r of fake.rows) {
    assert(r.excluded === true, "every n8n event is excluded");
    assert(r.worker === "n8n" && r.source_system === "n8n", "every event attributed to n8n");
    assert(String(r.source_event_key).startsWith("n8n:"), "n8n key namespace");
    assert(r.observation === "live", "observed live by the server");
    assert(/TEST|workflow-reported/.test(String(r.summary)), `summary labelled: ${String(r.summary)}`);
    assert(!/@/.test(String(r.summary)), "no addresses in summaries");
  }
  const reads = fake.calls.filter((c) => !WRITE_RE.test(c.text)).map((c) => c.text);
  const nonSelect = reads.filter((t) => !/^(SELECT|WITH)\b|^SET LOCAL lock_timeout\b/i.test(t));
  assert(nonSelect.length === 0, `every other statement is a read: ${nonSelect.map((t) => t.slice(0, 60)).join(" | ")}`);

  const events = fake.rows.map((r, i) => ({
    id: i + 1,
    excluded: r.excluded,
    worker: r.worker,
    occurredAt: (r.occurred_at as Date).toISOString(),
  })) as unknown as ActivityEvent[];
  assert(filterActivityFeed(events, { showExcluded: false, worker: "all" }).length === 0, "hidden from default feed");
  assert(filterActivityFeed(events, { showExcluded: true, worker: "n8n" }).length === events.length, "visible with test/excluded shown");

  const base = {
    sourceSystem: "n8n",
    eventType: "x",
    outcome: "completed" as const,
    observation: "live" as const,
    occurredAt: "2026-09-28T10:00:00Z",
    summary: "x",
  };
  assert(normalizeActivityEvent({ ...base, sourceEventKey: "n8n:x", worker: "finance" }) === null, "n8n namespace cannot be used as finance");
  assert(normalizeActivityEvent({ ...base, sourceEventKey: "finance:run:1", worker: "n8n" }) === null, "n8n cannot write into a worker namespace");
  assert(normalizeActivityEvent({ ...base, sourceSystem: "finance", sourceEventKey: "n8n:x", worker: "n8n" }) === null, "n8n cannot claim another source system");
  assert(normalizeActivityEvent({ ...base, sourceEventKey: "n8n:x", worker: "n8n" }) !== null, "well-formed n8n event accepted");
  console.log("ok TEST/EXCLUDED storage and no business side effects");
}

async function testSnapshotReadOnly() {
  const fake = createFakeSql({ tablesExist: true });
  reset(fake);
  setEnv(ENABLED_ENV);
  const runId = (await register("wf5-exec-100", "100")).body.runId as string;
  const before = fake.calls.length;
  setEnv({ ...ENABLED_ENV, MISSION_CONTROL_N8N_ENABLED: undefined, MISSION_CONTROL_SYNC_ENABLED: undefined });
  const res = await handleMissionControlGet({ url: new URL("https://psl.test/x?snapshot=1"), headers: new Headers(), now: now() });
  const snap = (res.body as MissionControlResponseBody).snapshot!;
  assert(!snap.n8n.mode.enabled, "panel shows integration disabled");
  assert(snap.n8n.runs?.[0]?.runId === runId && snap.n8n.runs[0].state === "registered", "panel lists the run");
  assert(snap.n8n.runs[0].classification === "TEST" && snap.n8n.runs[0].excluded, "panel run labelled TEST/EXCLUDED");
  const after = fake.calls.slice(before);
  assert(!after.some((c) => WRITE_RE.test(c.text) || DDL_RE.test(c.text)), "read-only admin page load writes nothing");
  assert(
    after.filter((c) => /'n8n'/.test(c.text)).every((c) => /^SELECT \* FROM ops_activity_events WHERE source_system = 'n8n'/.test(c.text)),
    "n8n panel only runs its SELECT"
  );

  const missing = createFakeSql({ tablesExist: false });
  reset(missing);
  const res2 = await handleMissionControlGet({ url: new URL("https://psl.test/x?snapshot=1"), headers: new Headers(), now: now() });
  const snap2 = (res2.body as MissionControlResponseBody).snapshot!;
  assert(snap2.n8n.runs === null, "no runs when tables are missing");
  assert(missing.ddl().length === 0 && missing.writes().length === 0, "no schema creation on the read path");

  setEnv(ENABLED_ENV);
  const r = await register("wf5-exec-200", "200");
  assert(r.status === 503, "n8n endpoints refuse when tables are missing (no auto-migration)");
  assert(missing.ddl().length === 0, "still no DDL");
  console.log("ok Mission Control panel is read-only");
}

function testWorkflowFile() {
  const path = join(process.cwd(), "integrations", "n8n", "psl-mission-control-connection-test.workflow.json");
  const raw = readFileSync(path, "utf8");
  const wf = JSON.parse(raw) as {
    active: boolean;
    nodes: Array<{ name: string; type: string; credentials?: unknown; parameters: Record<string, unknown> }>;
  };
  assert(wf.active === false, "workflow imports inactive");
  assert(!/Bearer\s+[A-Za-z0-9]/.test(raw), "no bearer token in the workflow");
  assert(wf.nodes.every((n) => n.credentials === undefined), "no credential ids embedded; bind from the n8n credential store");
  const types = wf.nodes.map((n) => n.type);
  assert(types.filter((t) => /trigger/i.test(t)).length === 1 && types.includes("n8n-nodes-base.manualTrigger"), "manual trigger only");
  assert(!types.some((t) => /schedule|cron|webhook|interval/i.test(t)), "no automatic scheduling or webhooks");
  const http = wf.nodes.filter((n) => n.type === "n8n-nodes-base.httpRequest");
  assert(http.length === 7, `seven HTTP Request nodes (README and notes depend on it), got ${http.length}`);

  const messages = wf.nodes
    .filter((n) => n.type === "n8n-nodes-base.stopAndError")
    .map((n) => String(n.parameters.errorMessage));
  assert(!messages.some((m) => /no run was recorded/i.test(m)), "no false 'no run was recorded' claim");
  const registration = messages.find((m) => /Registration could not be confirmed/.test(m));
  assert(registration && /may already exist/.test(registration) && /\$execution\.id/.test(registration), "registration message is uncertain and cites the request/execution ID");
  const unreported = messages.find((m) => /Result confirmation was not received/.test(m));
  assert(unreported && /may already be recorded/.test(unreported) && /If Mission Control has no result/.test(unreported), "unreported result does not guarantee outcome unknown");

  const readme = readFileSync(join(process.cwd(), "integrations", "n8n", "README.md"), "utf8");
  for (const n of http) assert(readme.includes(n.name), `README lists HTTP node "${n.name}"`);
  assert(/seven/i.test(readme) && /error[- ]branch/i.test(readme), "README says all seven nodes incl. error branches");
  assert(!/Get-Random/.test(readme) && /RandomNumberGenerator|randomBytes/.test(readme), "README uses a CSPRNG");
  const tokenLike = /[A-Za-z0-9+/=_]{40,}/;
  assert(!tokenLike.test(readme) && !tokenLike.test(raw), "no token-like strings in README or workflow");
  for (const n of http) {
    const p = n.parameters;
    assert(p.authentication === "genericCredentialType" && p.genericAuthType === "httpHeaderAuth", `${n.name} uses header-auth credential`);
    assert(String(p.url).includes("/api/integrations/n8n/mission-control/runs"), `${n.name} targets only the bridge`);
    assert(!/[?&](token|key|secret)=/i.test(String(p.url)), `${n.name} has no credentials in the URL`);
  }
  console.log("ok workflow JSON has no secrets and no schedule");
}

async function main() {
  const saved = { ...process.env };
  try {
    testWorkflowFile();
    testIntegrationMode();
    testAuthorizationHeader();
    await testGatesBeforeDatabase();
    await testNoDbCallsWhenRejected();
    await testInvalidPayloads();
    await testLifecycleIdempotencyAndOrdering();
    await testTimeout();
    await testRateLimits();
    await testConcurrentRegistrationQuota();
    await testContentionRetries();
    await testExclusionAndNoSideEffects();
    await testSnapshotReadOnly();
    console.log("\nAll n8n bridge tests passed.");
  } finally {
    __setSqlClientForTests(null);
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
