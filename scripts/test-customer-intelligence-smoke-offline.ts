/**
 * Offline checks for the CI DB smoke's cleanup contract, against an in-memory
 * fake of customer_intelligence_snapshots. No database is touched.
 * Run: npm run test:customer-intelligence
 */
import type { NeonQueryFunction } from "@neondatabase/serverless";

import { __setSqlClientForTests } from "../lib/db/sql";
import { runCustomerIntelSnapshotSmoke } from "./_ci-db-smoke";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

type Row = {
  id: number;
  period_start: string;
  period_end: string;
  generated_at: string;
  snapshot_json: Record<string, unknown>;
};

function fakeStore(seed: Row[], opts: { deleteFails?: "throw" | "noop" } = {}) {
  const rows = new Map(seed.map((r) => [r.id, { ...r }]));
  let nextId = Math.max(0, ...seed.map((r) => r.id)) + 1;
  const deletes: number[] = [];
  const fn = (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("?").replace(/\s+/g, " ").trim();
    const run = (): unknown[] => {
      if (/^(CREATE|ALTER)\b/i.test(text)) return [];
      if (/^SELECT id FROM customer_intelligence_snapshots WHERE period_start/i.test(text)) {
        return [...rows.values()]
          .filter((r) => r.period_start === values[0] && r.period_end === values[1])
          .map((r) => ({ id: r.id }));
      }
      if (/^INSERT INTO customer_intelligence_snapshots/i.test(text)) {
        const id = nextId++;
        rows.set(id, {
          id,
          period_start: values[0] as string,
          period_end: values[1] as string,
          generated_at: new Date().toISOString(),
          snapshot_json: JSON.parse(values[2] as string),
        });
        return [{ id }];
      }
      if (/^UPDATE customer_intelligence_snapshots SET snapshot_json/i.test(text)) {
        const row = rows.get(Number(values[1]));
        if (row) row.snapshot_json = JSON.parse(values[0] as string);
        return [];
      }
      if (/^SELECT period_start, period_end, generated_at, snapshot_json/i.test(text)) {
        return [...rows.values()].sort((a, b) => b.generated_at.localeCompare(a.generated_at));
      }
      if (/^DELETE FROM customer_intelligence_snapshots/i.test(text)) {
        if (opts.deleteFails === "throw") throw new Error("connection reset");
        if (opts.deleteFails === "noop") return [];
        const row = rows.get(Number(values[0]));
        if (
          !row ||
          row.period_start !== values[1] ||
          row.period_end !== values[2] ||
          row.snapshot_json.test !== true ||
          row.snapshot_json.reporting_excluded !== true
        ) {
          return [];
        }
        rows.delete(row.id);
        deletes.push(row.id);
        return [{ id: row.id }];
      }
      return [];
    };
    try {
      return Promise.resolve(run());
    } catch (error) {
      return Promise.reject(error);
    }
  };
  return { sql: fn as unknown as NeonQueryFunction<false, false>, rows, deletes };
}

const EXISTING: Row[] = [
  {
    id: 1,
    period_start: "2099-01-01",
    period_end: "2099-01-28",
    generated_at: "2026-09-12T13:41:31.896Z",
    snapshot_json: { test: true, pass: 2, reporting_excluded: true },
  },
  {
    id: 6,
    period_start: "2026-08-31",
    period_end: "2026-09-27",
    generated_at: "2026-09-28T11:59:10.652Z",
    snapshot_json: { evidenceHealth: {} },
  },
];

async function testCleansUpOnlyItsOwnRow() {
  const store = fakeStore(EXISTING);
  __setSqlClientForTests(store.sql);
  const { qaRowId } = await runCustomerIntelSnapshotSmoke();
  assert(store.deletes.length === 1 && store.deletes[0] === qaRowId, "deleted exactly the row it created");
  assert(!store.rows.has(qaRowId), "no QA row left behind");
  assert(store.rows.size === EXISTING.length, "pre-existing rows untouched");
  assert(store.rows.has(1) && store.rows.has(6), "2099 QA row and legitimate snapshot both survive");
}

async function testCleanupFailureIsLoud() {
  for (const mode of ["throw", "noop"] as const) {
    const store = fakeStore(EXISTING, { deleteFails: mode });
    __setSqlClientForTests(store.sql);
    let message = "";
    try {
      await runCustomerIntelSnapshotSmoke();
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    const leftover = [...store.rows.keys()].find((id) => !EXISTING.some((r) => r.id === id));
    assert(leftover !== undefined, "fixture: QA row remained");
    assert(
      message.includes("QA CLEANUP FAILED") && message.includes(`id=${leftover}`),
      `cleanup failure (${mode}) names the exact QA row, got: ${message}`
    );
  }
}

async function testRefusesExistingPeriod() {
  const realRandom = Math.random;
  Math.random = () => 0;
  try {
    const clash: Row = {
      id: 50,
      period_start: "2100-01-01",
      period_end: "2100-01-28",
      generated_at: "2026-01-01T00:00:00Z",
      snapshot_json: { important: true },
    };
    const store = fakeStore([...EXISTING, clash]);
    __setSqlClientForTests(store.sql);
    let message = "";
    try {
      await runCustomerIntelSnapshotSmoke();
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    assert(message.includes("refusing to touch it"), "refuses a period it did not create");
    assert(store.deletes.length === 0 && store.rows.get(50)?.snapshot_json.important === true, "existing row unchanged");
  } finally {
    Math.random = realRandom;
  }
}

async function main() {
  try {
    await testCleansUpOnlyItsOwnRow();
    await testCleanupFailureIsLoud();
    await testRefusesExistingPeriod();
    console.log("[test-customer-intelligence-smoke-offline] all assertions passed");
  } finally {
    __setSqlClientForTests(null);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
