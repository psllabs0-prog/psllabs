/**
 * Customer Intelligence data-quality regressions for Mission Control.
 * Fixtures mirror the production snapshot rows (ids 1–6), including the
 * 2099 QA smoke-test row.
 * Run: npm run test:mission-control
 */
import type { NeonQueryFunction } from "@neondatabase/serverless";

import { __setSqlClientForTests } from "../lib/db/sql";
import { getLatestCustomerIntelSnapshot } from "../lib/customer-intelligence/signals-store";
import { mapCustomerIntelSnapshot, syncActivityFromSources } from "../lib/ops/mission-control/projectors";
import { normalizeActivityEvent } from "../lib/ops/mission-control/events";
import { collectWorkerCards } from "../lib/ops/mission-control/workers";
import { filterActivityFeed, type ActivityEvent } from "../lib/ops/mission-control/types";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

type SnapshotRow = {
  id: string;
  period_start: string;
  period_end: string;
  generated_at: string;
  snapshot_json: Record<string, unknown>;
};

const QA_2099: SnapshotRow = {
  id: "1",
  period_start: "2099-01-01",
  period_end: "2099-01-28",
  generated_at: "2026-09-12T13:41:31.896Z",
  snapshot_json: { test: true, pass: 2 },
};
const legit = (id: string, start: string, end: string, generatedAt: string): SnapshotRow => ({
  id,
  period_start: start,
  period_end: end,
  generated_at: generatedAt,
  snapshot_json: { periodStart: start, periodEnd: end, evidenceHealth: {} },
});
const PRODUCTION_ROWS: SnapshotRow[] = [
  QA_2099,
  legit("2", "2026-08-16", "2026-09-12", "2026-09-13T10:40:58.348Z"),
  legit("3", "2026-08-18", "2026-09-14", "2026-09-15T12:33:28.821Z"),
  legit("4", "2026-08-23", "2026-09-19", "2026-09-20T10:40:57.614Z"),
  legit("5", "2026-08-30", "2026-09-26", "2026-09-27T10:40:58.333Z"),
  legit("6", "2026-08-31", "2026-09-27", "2026-09-28T11:59:10.652Z"),
];
const NOW = new Date("2026-09-28T12:40:00.000Z");

/** Answers snapshot queries like Postgres would (flag columns via `->`, generated_at DESC). */
function fakeSql(rows: SnapshotRow[]) {
  const sorted = [...rows].sort((a, b) => b.generated_at.localeCompare(a.generated_at));
  const fn = (strings: TemplateStringsArray) => {
    const text = strings.join("?").replace(/\s+/g, " ");
    if (/FROM customer_intelligence_snapshots/.test(text) && /^\s*SELECT/i.test(text)) {
      return Promise.resolve(
        sorted.map((r) => ({
          ...r,
          test_flag: r.snapshot_json.test ?? null,
          excluded_flag: r.snapshot_json.reporting_excluded ?? null,
        }))
      );
    }
    return Promise.resolve([]);
  };
  return fn as unknown as NeonQueryFunction<false, false>;
}

async function ciCard(rows: SnapshotRow[], now = NOW) {
  __setSqlClientForTests(fakeSql(rows));
  const card = (await collectWorkerCards({ now })).find((c) => c.worker === "customer_intelligence");
  assert(card, "customer intelligence card present");
  return card;
}

const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

async function testNewestLegitimateSnapshotDrivesFreshness() {
  const card = await ciCard(PRODUCTION_ROWS);
  assert(
    card.lastSuccessAt === "2026-09-28T11:59:10.652Z",
    `last success is the 2026-09-28 snapshot's own generated_at, got ${card.lastSuccessAt}`
  );
  assert(card.status !== "stale", `current legitimate snapshot is not stale, got ${card.status}`);
}

async function testTestOrFutureSnapshotsCannotMisreport() {
  const staleLegit = legit("10", "2026-08-10", "2026-09-07", daysAgo(20));
  const freshQa = { ...QA_2099, id: "11", generated_at: daysAgo(0.1) };
  const freshFuture = legit("12", "2099-02-01", "2099-02-28", daysAgo(0.1));
  const freshExcluded: SnapshotRow = {
    ...legit("13", "2026-08-31", "2026-09-27", daysAgo(0.1)),
    snapshot_json: { reporting_excluded: true },
  };

  const card = await ciCard([staleLegit, freshQa, freshFuture, freshExcluded]);
  assert(card.lastSuccessAt === staleLegit.generated_at, "QA/future/excluded rows never count as success");
  assert(card.status === "stale", `20-day-old legitimate snapshot stays stale, got ${card.status}`);

  const onlyBad = await ciCard([freshQa, freshFuture, freshExcluded]);
  assert(onlyBad.lastSuccessAt === null, "no legitimate snapshot → no success");
  assert(
    onlyBad.status === "configured" && onlyBad.detail === "No runs recorded yet",
    `QA/future/excluded rows read as "no runs recorded", never healthy; got ${onlyBad.status}`
  );

  const oldQaOnly = await ciCard([QA_2099, legit("6", "2026-08-31", "2026-09-27", daysAgo(0.03))]);
  assert(oldQaOnly.status !== "stale", "an old QA row with a later period cannot make CI look stale");
}

async function testLatestSnapshotReaderSkipsExcluded() {
  __setSqlClientForTests(fakeSql(PRODUCTION_ROWS));
  const latest = await getLatestCustomerIntelSnapshot();
  assert(latest, "legitimate latest snapshot returned");
  assert(
    latest.periodStart === "2026-08-31" && latest.periodEnd === "2026-09-27",
    `CEO/Decision/dashboard read the 2026-09-28 snapshot, got ${latest.periodStart} → ${latest.periodEnd}`
  );
  __setSqlClientForTests(fakeSql([QA_2099]));
  assert((await getLatestCustomerIntelSnapshot()) === null, "QA-only table yields no latest snapshot");
}

function toActivityEvent(row: SnapshotRow, id: number): ActivityEvent {
  const [input] = mapCustomerIntelSnapshot({
    ...row,
    test_flag: row.snapshot_json.test ?? null,
    excluded_flag: row.snapshot_json.reporting_excluded ?? null,
  });
  const e = normalizeActivityEvent(input)!;
  return {
    id,
    receivedAt: NOW.toISOString(),
    sourceEventKey: e.sourceEventKey,
    correlationId: e.correlationId ?? null,
    parentTaskId: e.parentTaskId ?? null,
    sourceSystem: e.sourceSystem,
    worker: e.worker,
    eventType: e.eventType,
    outcome: e.outcome,
    observation: e.observation,
    occurredAt: e.occurredAt,
    summary: e.summary,
    sourceRef: e.sourceRef ?? null,
    sourceHref: e.sourceHref ?? null,
    excluded: Boolean(e.excluded),
    versions: {},
    estimatedCostUsd: null,
    providerCostUsd: null,
  } as ActivityEvent;
}

function testActivityExclusionAndVisibility() {
  const events = PRODUCTION_ROWS.map((r, i) => toActivityEvent(r, i + 1));
  const qa = events.find((e) => e.sourceEventKey === "customer_intelligence_snapshots:1:generated")!;
  const current = events.find((e) => e.sourceEventKey === "customer_intelligence_snapshots:6:generated")!;
  assert(qa.excluded, "2099 QA snapshot projects as excluded activity");
  assert(events.filter((e) => e.excluded).length === 1, "only the QA snapshot is excluded");

  const future = toActivityEvent(legit("12", "2099-02-01", "2099-02-28", "2026-09-28T00:00:00Z"), 99);
  assert(future.excluded, "future-dated period projects as excluded even without a test flag");

  const defaultFeed = filterActivityFeed(events, { showExcluded: false, worker: "all" });
  assert(!defaultFeed.some((e) => e.id === qa.id), "excluded CI snapshot hidden from default feed");
  assert(defaultFeed[0].id === current.id, "legitimate 2026-09-28 snapshot visible and newest");
  assert(
    current.summary.includes("2026-08-31 → 2026-09-27") && !current.excluded,
    "2026-09-28 snapshot summary intact and not excluded"
  );
  const withExcluded = filterActivityFeed(events, { showExcluded: true, worker: "customer_intelligence" });
  assert(withExcluded.some((e) => e.id === qa.id), "QA snapshot visible only with Show test/excluded");
}

async function testExistingActivityPicksUpExclusion() {
  const saved = { ...process.env };
  process.env.MISSION_CONTROL_SYNC_ENABLED = "true";
  delete process.env.VERCEL_ENV;
  const keys = new Map<string, boolean>();
  const fn = (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("?").replace(/\s+/g, " ").trim();
    if (!/^INSERT INTO ops_activity_events/i.test(text)) return Promise.resolve([]);
    const batch = values[0] as string[];
    const flags = values[12] as boolean[];
    const out: Array<{ inserted: boolean }> = [];
    batch.forEach((k, i) => {
      if (!keys.has(k)) out.push({ inserted: true });
      else if (keys.get(k) !== flags[i]) out.push({ inserted: false });
      keys.set(k, flags[i]);
    });
    return Promise.resolve(out);
  };
  __setSqlClientForTests(fn as unknown as NeonQueryFunction<false, false>);
  try {
    const key = "customer_intelligence_snapshots:1:generated";
    keys.set(key, false);
    const after = await syncActivityFromSources({
      force: true,
      sources: [{ name: "ci", fetch: async () => [{ ...QA_2099, test_flag: true }], map: mapCustomerIntelSnapshot }],
    });
    assert(after.inserted === 0, "re-sync does not duplicate the event");
    assert(keys.get(key) === true, "existing activity row now carries the exclusion");
    const again = await syncActivityFromSources({
      force: true,
      sources: [{ name: "ci", fetch: async () => [{ ...QA_2099, test_flag: true }], map: mapCustomerIntelSnapshot }],
    });
    assert(again.inserted === 0 && keys.get(key) === true, "unchanged flag is a no-op");
  } finally {
    process.env = saved;
  }
}

async function main() {
  try {
    await testNewestLegitimateSnapshotDrivesFreshness();
    await testTestOrFutureSnapshotsCannotMisreport();
    await testLatestSnapshotReaderSkipsExcluded();
    testActivityExclusionAndVisibility();
    await testExistingActivityPicksUpExclusion();
    console.log("[test-mission-control-ci-quality] all assertions passed");
  } finally {
    __setSqlClientForTests(null);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
