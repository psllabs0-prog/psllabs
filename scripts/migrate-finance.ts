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
    "[migrate-finance] note: legacy financial_ledger.transaction_fees DEFAULT 0 is not used as verified fee for Phase 1 finance reporting."
  );
  console.log("[migrate-finance] done.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
