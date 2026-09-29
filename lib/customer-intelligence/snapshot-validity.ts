/**
 * Which `customer_intelligence_snapshots` rows count as real scan output.
 * QA rows (`snapshot_json.test = true`, e.g. the DB smoke test's 2099 period),
 * rows marked `snapshot_json.reporting_excluded = true`, and future-dated or
 * malformed periods must never drive "latest snapshot" freshness, CEO /
 * Decision readiness, dashboard evidence health, or default activity.
 */

export type CustomerIntelSnapshotRecord = {
  periodStart: unknown;
  periodEnd: unknown;
  generatedAt: unknown;
  /** Only the flag keys are read; full snapshot_json is fine too. */
  snapshot?: Record<string, unknown> | null;
};

export type CustomerIntelSnapshotExclusion =
  | "test"
  | "reporting_excluded"
  | "future_dated"
  | "invalid";

const DAY_MS = 24 * 60 * 60 * 1000;
/** A scan covers the trailing window ending yesterday; allow one day of timezone slack. */
const FUTURE_TOLERANCE_MS = DAY_MS;

function flag(value: unknown): boolean {
  return value === true || value === "true";
}

/**
 * `YYYY-MM-DD` for a Postgres DATE. The Neon driver returns DATE as a JS Date
 * at local midnight, so read local components — `String(date)` or
 * `toISOString()` would yield "Sun Sep 27" or shift the day east of UTC.
 */
export function toDateOnly(value: unknown): string | null {
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) return null;
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${value.getFullYear()}-${m}-${d}`;
  }
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
  return value.slice(0, 10);
}

function dateMs(value: unknown): number | null {
  const day = toDateOnly(value);
  if (!day) return null;
  const t = Date.parse(`${day}T00:00:00Z`);
  return Number.isFinite(t) ? t : null;
}

function timestampMs(value: unknown): number | null {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
  if (typeof value !== "string" || !value) return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : null;
}

export function customerIntelSnapshotExclusion(
  record: CustomerIntelSnapshotRecord
): CustomerIntelSnapshotExclusion | null {
  const snapshot = record.snapshot ?? {};
  if (flag(snapshot.test)) return "test";
  if (flag(snapshot.reporting_excluded)) return "reporting_excluded";
  const start = dateMs(record.periodStart);
  const end = dateMs(record.periodEnd);
  const generated = timestampMs(record.generatedAt);
  if (start === null || end === null || generated === null || start > end) {
    return "invalid";
  }
  if (end > generated + FUTURE_TOLERANCE_MS) return "future_dated";
  return null;
}

/** Newest legitimate snapshot by its own `generated_at`; null when none qualify. */
export function pickLatestLegitimateSnapshot<T extends CustomerIntelSnapshotRecord>(
  records: T[]
): T | null {
  let best: T | null = null;
  let bestAt = -Infinity;
  for (const record of records) {
    if (customerIntelSnapshotExclusion(record) !== null) continue;
    const at = timestampMs(record.generatedAt)!;
    if (at > bestAt) {
      best = record;
      bestAt = at;
    }
  }
  return best;
}

/** Recent rows scanned when picking the latest legitimate snapshot (weekly cadence). */
export const CUSTOMER_INTEL_SNAPSHOT_SCAN_LIMIT = 50;

export type LegitimateCustomerIntelSnapshot = {
  id: string;
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  snapshot: Record<string, unknown>;
};

type SqlTag = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>;

/**
 * The single read path for "latest customer intelligence snapshot": Mission
 * Control worker + connections, CI dashboard, CEO Brief and Decision Engine
 * readiness all resolve through here. Plain SELECT — callers decide whether
 * to ensure schema first.
 */
export async function fetchLatestLegitimateCustomerIntelSnapshot(
  sql: SqlTag
): Promise<LegitimateCustomerIntelSnapshot | null> {
  const rows = ((await sql`
    SELECT id, period_start, period_end, generated_at, snapshot_json
    FROM customer_intelligence_snapshots
    ORDER BY generated_at DESC, id DESC
    LIMIT ${CUSTOMER_INTEL_SNAPSHOT_SCAN_LIMIT}
  `) ?? []) as Array<Record<string, unknown>>;
  const best = pickLatestLegitimateSnapshot(
    rows.map((row) => ({
      row,
      periodStart: row.period_start,
      periodEnd: row.period_end,
      generatedAt: row.generated_at,
      snapshot: (row.snapshot_json ?? {}) as Record<string, unknown>,
    }))
  );
  if (!best) return null;
  return {
    id: String(best.row.id),
    periodStart: toDateOnly(best.periodStart)!,
    periodEnd: toDateOnly(best.periodEnd)!,
    generatedAt: new Date(timestampMs(best.generatedAt)!).toISOString(),
    snapshot: best.snapshot ?? {},
  };
}
