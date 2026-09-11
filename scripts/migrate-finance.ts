/**
 * Explicit, idempotent finance Phase 1 schema migration.
 *
 * Usage:
 *   npm run migrate-finance
 *
 * Creates/upgrades:
 *   payment_events
 *   finance_transactions
 *   finance_reconciliation_warnings
 *   finance_job_runs
 *
 * Also marks known historical QA/test finance rows as reporting_excluded.
 *
 * Runtime still keeps CREATE IF NOT EXISTS fallbacks; this script is the
 * intentional production path before deploy.
 */
import { loadEnvLocal } from "./_env";
import { getSql } from "@/lib/db/sql";
import {
  assertFinanceProcessorFeeNullable,
  ensureFinanceSchema,
  FINANCE_TABLES,
} from "@/lib/finance/schema";
import {
  HISTORICAL_QA_EXCLUSION_REASON,
  HISTORICAL_QA_TEST_ORDER_IDS,
  REPORTING_EXCLUDED_SHEET_ERROR,
} from "@/lib/finance/reporting-exclusion";

loadEnvLocal();

async function main() {
  console.log("[migrate-finance] applying idempotent finance schema…");
  await ensureFinanceSchema();

  const sql = getSql();
  const tables = (await sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN (
        'payment_events',
        'finance_transactions',
        'finance_reconciliation_warnings',
        'finance_job_runs'
      )
    ORDER BY table_name
  `) as Array<{ table_name: string }>;

  const found = new Set(tables.map((t) => t.table_name));
  for (const name of FINANCE_TABLES) {
    if (!found.has(name)) {
      throw new Error(`Expected table missing after migration: ${name}`);
    }
    console.log(`[migrate-finance] ok: ${name}`);
  }

  const fee = await assertFinanceProcessorFeeNullable();
  console.log(
    "[migrate-finance] finance_transactions.processor_fee is NULLABLE with no DEFAULT (unknown ≠ 0)."
  );
  console.log(
    `[migrate-finance] processor_fee check: is_nullable=YES column_default=${fee.columnDefault}`
  );

  console.log(
    "[migrate-finance] marking historical QA/test finance rows as reporting_excluded…"
  );
  for (const orderId of HISTORICAL_QA_TEST_ORDER_IDS) {
    const rows = (await sql`
      UPDATE finance_transactions
      SET
        reporting_excluded = true,
        reporting_exclusion_reason = ${HISTORICAL_QA_EXCLUSION_REASON},
        sheet_sync_status = 'skipped',
        sheet_sync_error = ${REPORTING_EXCLUDED_SHEET_ERROR},
        updated_at = now()
      WHERE psl_order_id = ${orderId}
      RETURNING psl_order_id, reporting_excluded, reporting_exclusion_reason
    `) as Array<{
      psl_order_id: string;
      reporting_excluded: boolean;
      reporting_exclusion_reason: string | null;
    }>;

    if (!rows[0]) {
      console.warn(
        `[migrate-finance] WARNING: no finance_transactions row for ${orderId}`
      );
      continue;
    }
    console.log(
      `[migrate-finance] excluded ${rows[0].psl_order_id} reason=${rows[0].reporting_exclusion_reason}`
    );
  }

  const excludedCount = (await sql`
    SELECT COUNT(*)::int AS count
    FROM finance_transactions
    WHERE reporting_excluded = true
      AND psl_order_id IN (
        'psl_1787930970857_3jenqbhc',
        'psl_1788062270276_p52p38o8',
        'psl_1788327024394_5mkdfvn4'
      )
  `) as { count: number }[];
  console.log(
    `[migrate-finance] historical QA excluded count=${excludedCount[0]?.count ?? 0}/3`
  );

  console.log(
    "[migrate-finance] note: legacy financial_ledger.transaction_fees DEFAULT 0 is not used as verified fee for Phase 1 finance reporting."
  );
  console.log("[migrate-finance] done.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
