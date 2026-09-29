/**
 * Integration-style regression: every "latest customer intelligence snapshot"
 * consumer resolves through the shared selector and agrees on the newest
 * legitimate snapshot for the actual production rows 1–6.
 *
 * Fixtures use the Neon driver's real value shapes (DATE → Date at local
 * midnight, timestamptz → Date, jsonb → objects) and run in several time
 * zones, since string fixtures hid a "Sun Sep 27" formatting bug.
 * Run: npm run test:mission-control
 */
import type { NeonQueryFunction } from "@neondatabase/serverless";

import { __setSqlClientForTests } from "../lib/db/sql";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

const FIXED_NOW_MS = Date.parse("2026-09-28T13:00:00.000Z");
const RealDate = Date;
class FixedDate extends RealDate {
  constructor(...args: unknown[]) {
    if (args.length === 0) super(FIXED_NOW_MS);
    else super(...(args as [string]));
  }
  static now() {
    return FIXED_NOW_MS;
  }
}
globalThis.Date = FixedDate as unknown as DateConstructor;

const EXPECTED = {
  generatedAt: "2026-09-28T11:59:10.652Z",
  periodStart: "2026-08-31",
  periodEnd: "2026-09-27",
};

/** DATE as node-postgres parses it: local midnight. */
function pgDate(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function productionRows() {
  const legit = (id: string, start: string, end: string, generatedAt: string, extra = {}) => ({
    id,
    period_start: pgDate(start),
    period_end: pgDate(end),
    generated_at: new Date(generatedAt),
    snapshot_json: {
      priorEnd: null,
      periodEnd: end,
      priorStart: null,
      generatedAt,
      periodStart: start,
      evidenceHealth: { customerMessages: 4 },
      recommendations: [],
      ...extra,
    },
  });
  return [
    {
      id: "1",
      period_start: pgDate("2099-01-01"),
      period_end: pgDate("2099-01-28"),
      generated_at: new Date("2026-09-12T13:41:31.896Z"),
      snapshot_json: {
        pass: 2,
        test: true,
        reporting_excluded: true,
        reporting_exclusion_reason: "QA: customer-intelligence DB smoke test",
      },
    },
    legit("2", "2026-08-16", "2026-09-12", "2026-09-13T10:40:58.348Z"),
    legit("3", "2026-08-18", "2026-09-14", "2026-09-15T12:33:28.821Z"),
    legit("4", "2026-08-23", "2026-09-19", "2026-09-20T10:40:57.614Z"),
    legit("5", "2026-08-30", "2026-09-26", "2026-09-27T10:40:58.333Z"),
    legit("6", "2026-08-31", "2026-09-27", "2026-09-28T11:59:10.652Z", {
      evidenceHealth: { customerMessages: 6 },
    }),
  ];
}

const SIGNAL = {
  id: 1,
  signal_key: "customer:shipping_question",
  signal_type: "explicit_question",
  theme: "shipping_question",
  evidence_class: "customer",
  product_sku: null,
  source_channel: "support",
  current_count: 5,
  prior_count: 1,
  sample_size: 5,
  confidence_level: "meaningful",
  evidence_json: { note: "5 legitimate shipping questions." },
  status: "early",
  recommendation: "SHIPPING_CLARITY_REVIEW",
};

function fakeSql() {
  const rows = productionRows();
  const statements: string[] = [];
  const fn = (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("?").replace(/\s+/g, " ").trim();
    statements.push(text);
    if (/^SELECT/i.test(text) && /FROM customer_intelligence_snapshots/.test(text)) {
      const limit = Number(values[values.length - 1]) || rows.length;
      return Promise.resolve(
        [...rows]
          .sort((a, b) => b.generated_at.getTime() - a.generated_at.getTime())
          .slice(0, limit)
      );
    }
    if (/^SELECT \* FROM customer_intelligence_signals/i.test(text)) {
      return Promise.resolve([SIGNAL]);
    }
    return Promise.resolve([]);
  };
  return { sql: fn as unknown as NeonQueryFunction<false, false>, statements };
}

async function runInTimeZone(tz: string) {
  process.env.TZ = tz;
  const fake = fakeSql();
  __setSqlClientForTests(fake.sql);

  const { collectMissionControlSnapshot } = await import("../lib/ops/mission-control/snapshot");
  const { buildCustomerIntelligenceDashboard } = await import("../lib/customer-intelligence/dashboard");
  const { collectCustomerIntelligenceSnapshot } = await import("../lib/ceo-brief/customer-intelligence");
  const { collectSystemReadinessMatrix } = await import("../lib/decision-engine/readiness");

  const mc = await collectMissionControlSnapshot({
    writeMode: { enabled: true, reason: "test" },
    schema: { initialized: true, missing: [] },
    now: new Date(),
  });
  const card = mc.workers.find((w) => w.worker === "customer_intelligence");
  assert(card, `[${tz}] CI worker card present`);
  assert(
    card.lastSuccessAt === EXPECTED.generatedAt,
    `[${tz}] 1 worker card last success ${card.lastSuccessAt}`
  );
  assert(card.status === "idle", `[${tz}] 1 worker card status ${card.status} (${card.detail})`);

  const connection = mc.connections?.find((c) => c.area === "Customer Intelligence");
  assert(
    connection?.status === "Healthy" && connection.detail === EXPECTED.generatedAt,
    `[${tz}] 2 Mission Control system connection ${JSON.stringify(connection)}`
  );

  const dashboard = await buildCustomerIntelligenceDashboard();
  assert(
    dashboard.latestSnapshot?.generatedAt === EXPECTED.generatedAt &&
      dashboard.latestSnapshot.periodStart === EXPECTED.periodStart &&
      dashboard.latestSnapshot.periodEnd === EXPECTED.periodEnd,
    `[${tz}] 3 CI dashboard latest ${JSON.stringify(dashboard.latestSnapshot && { ...dashboard.latestSnapshot, snapshot: undefined })}`
  );
  assert(
    (dashboard.evidenceHealth as Record<string, number>).customerMessages === 6,
    `[${tz}] 3 CI dashboard evidence health comes from snapshot #6`
  );

  const ceo = await collectCustomerIntelligenceSnapshot();
  assert(
    ceo.message === `Customer intelligence through ${EXPECTED.periodEnd}.`,
    `[${tz}] 4 CEO Brief source date: ${ceo.status} "${ceo.message}"`
  );

  const readiness = await collectSystemReadinessMatrix();
  const ciReadiness = readiness.find((r) => r.area === "Customer Intelligence");
  assert(
    ciReadiness?.status === "Healthy" && ciReadiness.detail === EXPECTED.generatedAt,
    `[${tz}] 5 Decision Engine readiness ${JSON.stringify(ciReadiness)}`
  );

  const snapshotReads = new Set(
    fake.statements.filter((s) => /^SELECT/i.test(s) && /FROM customer_intelligence_snapshots/.test(s))
  );
  assert(snapshotReads.size === 1, `[${tz}] one shared snapshot query, saw ${snapshotReads.size}`);
  assert(
    [...snapshotReads][0].includes("ORDER BY generated_at DESC"),
    `[${tz}] shared query orders by generated_at`
  );
  assert(
    !fake.statements.some((s) => /ops_activity_events/.test(s) && /customer_intelligence/.test(s)),
    `[${tz}] freshness never derived from activity rows`
  );
}

async function main() {
  const savedTz = process.env.TZ;
  try {
    for (const tz of ["UTC", "America/Los_Angeles", "Asia/Tokyo"]) {
      await runInTimeZone(tz);
    }
    console.log("[test-ci-snapshot-read-paths] all assertions passed");
  } finally {
    __setSqlClientForTests(null);
    globalThis.Date = RealDate;
    if (savedTz === undefined) delete process.env.TZ;
    else process.env.TZ = savedTz;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
