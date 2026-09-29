/**
 * Offline safety tests: Mission Control reads never run DDL or writes, the
 * write gate defaults closed (including previews), missing tables degrade
 * gracefully, and enabled sync still deduplicates.
 *
 * Every statement in the process goes through a recording fake client, so a
 * business-module `ensure*Schema()` reached from the read path would fail here.
 * Run: npm run test:mission-control
 */
import type { NeonQueryFunction } from "@neondatabase/serverless";

import { __setSqlClientForTests } from "../lib/db/sql";
import {
  handleMissionControlGet,
  type MissionControlResponseBody,
} from "../lib/ops/mission-control/api";
import { getMissionControlWriteMode } from "../lib/ops/mission-control/config";
import {
  insertActivityEvents,
  recordActivityEventSafe,
} from "../lib/ops/mission-control/events";
import {
  claimActivitySync,
  syncActivityFromSources,
} from "../lib/ops/mission-control/projectors";
import { MISSION_CONTROL_SYNC_HEADER, type ActivityEventInput } from "../lib/ops/mission-control/types";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

const DDL_RE =
  /^\s*(CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|COMMENT)\b|\b(CREATE|ALTER)\s+(TABLE|INDEX|UNIQUE|OR\s+REPLACE|FUNCTION|EXTENSION|SCHEMA)\b/i;
const WRITE_RE = /\bINSERT\s+INTO\b|\bDELETE\s+FROM\b|^\s*UPDATE\s/i;

type Call = { text: string; values: unknown[] };

function createFakeSql(opts: { tablesExist: boolean }) {
  const calls: Call[] = [];
  const keys = new Set<string>();
  const excluded = new Map<string, boolean>();
  const respond = (text: string, values: unknown[]): unknown[] => {
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
    if (/^INSERT INTO ops_activity_events/i.test(text)) {
      const batch = values[0] as string[];
      const flags = values[12] as boolean[];
      const out: Array<{ inserted: boolean }> = [];
      batch.forEach((key, i) => {
        if (!keys.has(key)) {
          keys.add(key);
          excluded.set(key, flags[i]);
          out.push({ inserted: true });
        } else if (excluded.get(key) !== flags[i]) {
          excluded.set(key, flags[i]);
          out.push({ inserted: false });
        }
      });
      return out;
    }
    if (/^INSERT INTO ops_activity_sync_state/i.test(text)) {
      return [{ source: "__claim" }];
    }
    return [];
  };
  const fn = (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("$?").replace(/\s+/g, " ").trim();
    calls.push({ text, values });
    try {
      return Promise.resolve(respond(text, values));
    } catch (error) {
      return Promise.reject(error);
    }
  };
  return {
    sql: fn as unknown as NeonQueryFunction<false, false>,
    calls,
    keys,
    excluded,
    ddl: () => calls.filter((c) => DDL_RE.test(c.text)),
    writes: () => calls.filter((c) => WRITE_RE.test(c.text)),
  };
}

function setEnv(values: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(values)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

const READ_ONLY_ENV = {
  MISSION_CONTROL_SYNC_ENABLED: undefined,
  MISSION_CONTROL_SYNC_ALLOW_PREVIEW: undefined,
  VERCEL_ENV: undefined,
};

function request(query: string, withHeader: boolean) {
  const headers = new Headers();
  if (withHeader) headers.set(MISSION_CONTROL_SYNC_HEADER, "1");
  return {
    url: new URL(`https://example.test/api/admin/ops/mission-control${query}`),
    headers,
    now: new Date("2026-09-28T18:00:00.000Z"),
  };
}

function body(result: { status: number; body: unknown }): MissionControlResponseBody {
  assert(result.status === 200, `expected 200, got ${result.status}`);
  return result.body as MissionControlResponseBody;
}

function event(n: number): ActivityEventInput {
  return {
    sourceEventKey: `test:readonly:${n}`,
    sourceSystem: "test",
    worker: "support",
    eventType: "test_event",
    outcome: "completed",
    observation: "live",
    occurredAt: "2026-09-28T10:00:00Z",
    summary: `event ${n}`,
    excluded: true,
  };
}

function testWriteModeConfig() {
  assert(!getMissionControlWriteMode({}).enabled, "unset → disabled");
  assert(
    !getMissionControlWriteMode({ MISSION_CONTROL_SYNC_ENABLED: "false" }).enabled,
    "false → disabled"
  );
  assert(
    getMissionControlWriteMode({ MISSION_CONTROL_SYNC_ENABLED: "true" }).enabled,
    "true → enabled"
  );
  assert(
    !getMissionControlWriteMode({
      MISSION_CONTROL_SYNC_ENABLED: "true",
      VERCEL_ENV: "preview",
    }).enabled,
    "preview needs second opt-in even when enabled"
  );
  assert(
    getMissionControlWriteMode({
      MISSION_CONTROL_SYNC_ENABLED: "true",
      VERCEL_ENV: "preview",
      MISSION_CONTROL_SYNC_ALLOW_PREVIEW: "true",
    }).enabled,
    "preview with explicit allow → enabled"
  );
  assert(
    getMissionControlWriteMode({
      MISSION_CONTROL_SYNC_ENABLED: "true",
      VERCEL_ENV: "production",
    }).enabled,
    "production with flag → enabled"
  );
}

async function testReadPathNoDdlDefault() {
  setEnv(READ_ONLY_ENV);
  const fake = createFakeSql({ tablesExist: true });
  __setSqlClientForTests(fake.sql);

  const snap = body(await handleMissionControlGet(request("?snapshot=1", true)));
  assert(snap.initialized, "initialized when tables exist");
  assert(!snap.writeMode.enabled, "writes disabled by default");
  assert(snap.sync === null, "client header alone does not trigger sync");
  assert(snap.snapshot?.workers.length === 11, "worker cards still rendered read-only");
  assert(snap.snapshot?.incidents === null, "shared incident collector not called read-only");
  assert(snap.snapshot?.incidentsNote, "incidents note explains read-only mode");
  assert(fake.ddl().length === 0, `read path ran DDL:\n${fake.ddl().map((c) => c.text).join("\n")}`);
  assert(fake.writes().length === 0, `read path wrote:\n${fake.writes().map((c) => c.text).join("\n")}`);

  const before = fake.calls.length;
  const poll = body(await handleMissionControlGet(request("?after=0", false)));
  assert(poll.snapshot === null, "cursor poll returns no snapshot");
  const pollCalls = fake.calls.slice(before);
  assert(pollCalls.length === 2, `cursor poll is catalog probe + one indexed read, got ${pollCalls.length}`);
  assert(pollCalls.every((c) => !DDL_RE.test(c.text) && !WRITE_RE.test(c.text)), "poll is read-only");

  const bad = await handleMissionControlGet(request("?after=abc", false));
  assert(bad.status === 400, "invalid cursor rejected");
}

async function testPreviewEnabledFlagStillReadOnly() {
  setEnv({ ...READ_ONLY_ENV, MISSION_CONTROL_SYNC_ENABLED: "true", VERCEL_ENV: "preview" });
  const fake = createFakeSql({ tablesExist: true });
  __setSqlClientForTests(fake.sql);
  const res = body(await handleMissionControlGet(request("?snapshot=1", true)));
  assert(!res.writeMode.enabled, "preview without allow stays read-only");
  assert(res.sync === null, "no sync on preview");
  assert(fake.ddl().length === 0 && fake.writes().length === 0, "preview: no DDL, no writes");
}

async function testDisabledSyncCannotInsert() {
  setEnv(READ_ONLY_ENV);
  const fake = createFakeSql({ tablesExist: true });
  __setSqlClientForTests(fake.sql);

  assert((await insertActivityEvents([event(1)])) === 0, "insert refused when disabled");
  await recordActivityEventSafe(event(2));
  assert((await claimActivitySync()) === false, "claim refused when disabled");
  const result = await syncActivityFromSources({
    force: true,
    sources: [{ name: "test", fetch: async () => [{}], map: () => [event(3)] }],
  });
  assert(!result.ran && result.disabled, "force cannot bypass the write gate");
  assert(fake.calls.length === 0, `disabled write paths issued SQL: ${fake.calls.length}`);
  assert(fake.keys.size === 0, "no activity inserted");
}

async function testMissingTablesGraceful() {
  setEnv(READ_ONLY_ENV);
  const fake = createFakeSql({ tablesExist: false });
  __setSqlClientForTests(fake.sql);

  const res = body(await handleMissionControlGet(request("?snapshot=1", true)));
  assert(res.initialized === false, "reports uninitialized");
  assert(res.migrationRequired?.includes("migrate-ops"), "points to explicit migration");
  assert(
    res.missingTables.includes("ops_activity_events") &&
      res.missingTables.includes("ops_activity_sync_state"),
    "lists missing tables"
  );
  assert(res.events.length === 0, "no events, none fabricated");
  assert(res.snapshot?.workers.length === 11, "worker cards still available");
  assert(res.snapshot?.coverage.length === 0, "sync-state table not queried");
  assert(fake.ddl().length === 0, "missing tables are never auto-created");
  assert(fake.writes().length === 0, "no writes when uninitialized");

  setEnv({ ...READ_ONLY_ENV, MISSION_CONTROL_SYNC_ENABLED: "true" });
  const enabled = body(await handleMissionControlGet(request("?after=5", true)));
  assert(!enabled.initialized && enabled.cursor === 5, "enabled + missing tables still graceful");
  assert(
    !fake.calls.some((c) => /INSERT INTO ops_activity/i.test(c.text)),
    "no backfill attempted into missing tables"
  );
}

async function testEnabledSyncDeduplicates() {
  setEnv({ ...READ_ONLY_ENV, MISSION_CONTROL_SYNC_ENABLED: "true" });
  const fake = createFakeSql({ tablesExist: true });
  __setSqlClientForTests(fake.sql);

  const source = {
    name: "test:dedupe",
    fetch: async () => [{ n: 1 }, { n: 2 }, { n: 2 }],
    map: (row: Record<string, unknown>) => [event(Number(row.n))],
  };
  const first = await syncActivityFromSources({ force: true, sources: [source] });
  assert(first.ran && first.inserted === 2, `first sync inserts 2, got ${first.inserted}`);
  const insert = fake.calls.find((c) => /^INSERT INTO ops_activity_events/i.test(c.text));
  assert(
    insert &&
      /ON CONFLICT \(source_event_key\) DO UPDATE SET excluded = EXCLUDED\.excluded WHERE ops_activity_events\.excluded IS DISTINCT FROM EXCLUDED\.excluded/i.test(insert.text),
    "conflict-safe insert only carries the excluded flag"
  );
  assert((insert.values[0] as string[]).length === 2, "in-batch duplicates collapsed");

  const second = await syncActivityFromSources({ force: true, sources: [source] });
  assert(second.ran && second.inserted === 0, "re-sync inserts nothing (dedupe)");
  assert(fake.ddl().length === 0, "enabled sync still never runs DDL");

  const handler = body(await handleMissionControlGet(request("?snapshot=1", true)));
  assert(handler.writeMode.enabled && handler.sync?.ran === true, "enabled + header → sync runs");
  const noHeader = createFakeSql({ tablesExist: true });
  __setSqlClientForTests(noHeader.sql);
  const withoutHeader = body(await handleMissionControlGet(request("?snapshot=1", false)));
  assert(withoutHeader.sync === null, "enabled but no header → no sync");
  assert(
    !noHeader.calls.some((c) => /INSERT INTO ops_activity/i.test(c.text)),
    "no activity writes without the header"
  );
}

async function main() {
  const saved = { ...process.env };
  try {
    testWriteModeConfig();
    await testReadPathNoDdlDefault();
    await testPreviewEnabledFlagStillReadOnly();
    await testDisabledSyncCannotInsert();
    await testMissingTablesGraceful();
    await testEnabledSyncDeduplicates();
    console.log("[test-mission-control-readonly] all assertions passed");
  } finally {
    __setSqlClientForTests(null);
    process.env = saved;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
