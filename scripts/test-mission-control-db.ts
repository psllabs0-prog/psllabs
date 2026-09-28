/**
 * DB integration tests for Mission Control activity records.
 *
 * Writes only rows keyed `test:mc:*` (flagged excluded) and deletes them after.
 * Enables the write gate for this process only; requires migrate-ops to have run.
 * Requires an explicit opt-in because `.env.local` may point at production:
 *   MISSION_CONTROL_DB_TEST=1 npm run test:mission-control-db
 */
import { loadEnvLocal } from "./_env";
import { getSql } from "@/lib/db/sql";
import {
  insertActivityEvents,
  listActivityEventsAfter,
  recordActivityEventSafe,
} from "@/lib/ops/mission-control/events";
import {
  claimActivitySync,
  listActivitySyncStates,
  syncActivityFromSources,
} from "@/lib/ops/mission-control/projectors";
import { getMissionControlSchemaState } from "@/lib/ops/mission-control/schema";
import type { ActivityEventInput } from "@/lib/ops/mission-control/types";

loadEnvLocal();

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

const PREFIX = `test:mc:${Date.now()}`;

function event(n: number): ActivityEventInput {
  return {
    sourceEventKey: `${PREFIX}:${n}`,
    sourceSystem: "test",
    worker: "support",
    eventType: "test_event",
    outcome: "completed",
    observation: "live",
    occurredAt: new Date(Date.now() - n * 1000).toISOString(),
    summary: `Mission Control DB test ${n} for someone@example.com`,
    excluded: true,
  };
}

async function cleanup() {
  const sql = getSql();
  await sql`DELETE FROM ops_activity_events WHERE source_event_key LIKE ${`${PREFIX}%`}`;
  await sql`DELETE FROM ops_activity_sync_state WHERE source LIKE ${`${PREFIX}%`}`;
}

async function main() {
  if (process.env.MISSION_CONTROL_DB_TEST !== "1") {
    console.log(
      "[test-mission-control-db] skipped — set MISSION_CONTROL_DB_TEST=1 to run against DATABASE_URL."
    );
    return;
  }
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? "";
  console.log(`[test-mission-control-db] target host: ${url.replace(/^.*@([^/]+).*$/, "$1")}`);

  const schema = await getMissionControlSchemaState();
  if (!schema.initialized) {
    throw new Error(
      `Mission Control tables missing (${schema.missing.join(", ")}). Run npm run migrate-ops against this database first; this test never creates schema.`
    );
  }
  process.env.MISSION_CONTROL_SYNC_ENABLED = "1";
  delete process.env.VERCEL_ENV;
  const sql = getSql();
  const before = (await sql`SELECT COALESCE(MAX(id), 0)::bigint AS id FROM ops_activity_events`) as Array<{ id: string }>;
  const cursor = Number(before[0].id);

  try {
    const first = await insertActivityEvents([event(1), event(2), event(2)]);
    assert(first === 2, `expected 2 inserted (in-batch dupe collapsed), got ${first}`);
    const second = await insertActivityEvents([event(1), event(2)]);
    assert(second === 0, "duplicate source_event_key ignored");
    await recordActivityEventSafe(event(1));

    const after = (await listActivityEventsAfter(cursor)).filter((e) =>
      e.sourceEventKey.startsWith(PREFIX)
    );
    assert(after.length === 2, `cursor read returns 2 test events, got ${after.length}`);
    assert(after.every((e) => e.excluded), "excluded flag stored");
    assert(after.every((e) => !e.summary.includes("@")), "summary sanitized at write");
    assert(after[0].id < after[1].id, "cursor order ascending by id");
    assert(after.every((e) => e.receivedAt && e.occurredAt), "occurred/received timestamps stored");

    const result = await syncActivityFromSources({
      force: true,
      sources: [
        {
          name: `${PREFIX}:ok`,
          fetch: async () => [{ n: 3 }, { n: 3 }],
          map: (row) => [event(Number(row.n))],
        },
        {
          name: `${PREFIX}:missing`,
          fetch: async () => {
            throw new Error('relation "not_a_table" does not exist');
          },
          map: () => [],
        },
      ],
    });
    assert(result.ran && result.inserted === 1, "projector inserted once despite dupes");
    const states = (await listActivitySyncStates()).filter((s) => s.source.startsWith(PREFIX));
    const missing = states.find((s) => s.source.endsWith(":missing"));
    assert(
      missing?.lastError === "Source table not present in this database",
      "source failure recorded as coverage issue, others unaffected"
    );
    assert(states.find((s) => s.source.endsWith(":ok"))?.lastOkAt, "ok source recorded");

    await claimActivitySync(60);
    assert((await claimActivitySync(60)) === false, "second claim within interval throttled");

    console.log("[test-mission-control-db] all assertions passed");
  } finally {
    await cleanup();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
