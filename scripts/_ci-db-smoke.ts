/**
 * Customer-intelligence snapshot smoke used by `npm run test:customer-intelligence-db`.
 * Creates one QA snapshot in a unique far-future period, asserts upsert
 * idempotency and that QA rows are never "latest", then deletes exactly that
 * row. Never touches a snapshot it did not create.
 */
import { getSql } from "@/lib/db/sql";
import { ensureCustomerIntelligenceSchema } from "@/lib/customer-intelligence/schema";
import {
  getLatestCustomerIntelSnapshot,
  upsertCustomerIntelSnapshot,
} from "@/lib/customer-intelligence/signals-store";

export const QA_SNAPSHOT_FLAGS = {
  test: true,
  reporting_excluded: true,
  reporting_exclusion_reason: "customer-intelligence DB smoke test",
} as const;

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

export function qaSnapshotPeriod(random = Math.random): { periodStart: string; periodEnd: string } {
  const year = 2100 + Math.floor(random() * 800);
  const month = String(1 + Math.floor(random() * 12)).padStart(2, "0");
  return { periodStart: `${year}-${month}-01`, periodEnd: `${year}-${month}-28` };
}

export async function runCustomerIntelSnapshotSmoke(): Promise<{ qaRowId: number }> {
  await ensureCustomerIntelligenceSchema();
  const sql = getSql();
  const { periodStart, periodEnd } = qaSnapshotPeriod();

  const clash = (await sql`
    SELECT id FROM customer_intelligence_snapshots
    WHERE period_start = ${periodStart}::date AND period_end = ${periodEnd}::date
  `) as Array<{ id: number }>;
  if (clash.length > 0) {
    throw new Error(
      `QA period ${periodStart}→${periodEnd} already exists (id ${clash[0].id}); refusing to touch it. Re-run.`
    );
  }

  const created = await upsertCustomerIntelSnapshot({
    periodStart,
    periodEnd,
    snapshot: { ...QA_SNAPSHOT_FLAGS, pass: 1 },
  });
  const qaRowId = Number(created.id);
  let failure: unknown = null;
  try {
    assert(created.inserted, "smoke must create its own QA row");
    const again = await upsertCustomerIntelSnapshot({
      periodStart,
      periodEnd,
      snapshot: { ...QA_SNAPSHOT_FLAGS, pass: 2 },
    });
    assert(Number(again.id) === qaRowId && !again.inserted, "snapshot should upsert same period");
    const latest = await getLatestCustomerIntelSnapshot();
    assert(latest?.periodStart !== periodStart, "QA smoke snapshot must not be returned as latest");
  } catch (error) {
    failure = error;
  } finally {
    let deleted: Array<{ id: number }> = [];
    let cleanupError: unknown = null;
    try {
      deleted = (await sql`
        DELETE FROM customer_intelligence_snapshots
        WHERE id = ${qaRowId}
          AND period_start = ${periodStart}::date
          AND period_end = ${periodEnd}::date
          AND snapshot_json->>'test' = 'true'
          AND snapshot_json->>'reporting_excluded' = 'true'
        RETURNING id
      `) as Array<{ id: number }>;
    } catch (error) {
      cleanupError = error;
    }
    if (cleanupError || deleted.length !== 1) {
      const why = cleanupError instanceof Error ? cleanupError.message : `deleted ${deleted.length} rows`;
      const cause = failure instanceof Error ? ` (test also failed: ${failure.message})` : "";
      throw new Error(
        `QA CLEANUP FAILED: customer_intelligence_snapshots id=${qaRowId} (${periodStart}→${periodEnd}) was not removed — ${why}${cause}`
      );
    }
  }
  if (failure) throw failure;
  return { qaRowId };
}
