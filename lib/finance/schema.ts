import { getSql } from "@/lib/db/sql";

let schemaReady: Promise<void> | null = null;

/**
 * Idempotent finance schema bootstrap.
 *
 * Prefer `npm run migrate-finance` before production deploy so tables exist
 * intentionally. Runtime callers still invoke this as a safe fallback
 * (CREATE TABLE / ALTER … ADD COLUMN / CREATE INDEX IF NOT EXISTS only).
 *
 * finance_transactions.processor_fee is nullable with no DEFAULT — unknown
 * fees stay NULL. Do not treat legacy financial_ledger.transaction_fees
 * DEFAULT 0 as a verified processor fee for Phase 1 finance reporting.
 */
export async function ensureFinanceSchema(): Promise<void> {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    const sql = getSql();

    await sql`
      CREATE TABLE IF NOT EXISTS payment_events (
        id BIGSERIAL PRIMARY KEY,
        provider TEXT NOT NULL,
        provider_event_id TEXT NOT NULL,
        provider_payment_id TEXT,
        provider_order_id TEXT,
        psl_order_id TEXT,
        event_type TEXT NOT NULL,
        event_timestamp TIMESTAMPTZ,
        amount NUMERIC(12,2),
        currency TEXT,
        payment_status TEXT,
        payment_method TEXT,
        raw_event_json JSONB,
        processing_status TEXT NOT NULL DEFAULT 'received',
        processing_error TEXT,
        processed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (provider, provider_event_id)
      )
    `;
    await sql`
      ALTER TABLE payment_events
      ADD COLUMN IF NOT EXISTS provider_payment_id TEXT
    `;
    await sql`
      ALTER TABLE payment_events
      ADD COLUMN IF NOT EXISTS provider_order_id TEXT
    `;
    await sql`
      ALTER TABLE payment_events
      ADD COLUMN IF NOT EXISTS psl_order_id TEXT
    `;
    await sql`
      ALTER TABLE payment_events
      ADD COLUMN IF NOT EXISTS event_timestamp TIMESTAMPTZ
    `;
    await sql`
      ALTER TABLE payment_events
      ADD COLUMN IF NOT EXISTS amount NUMERIC(12,2)
    `;
    await sql`
      ALTER TABLE payment_events
      ADD COLUMN IF NOT EXISTS currency TEXT
    `;
    await sql`
      ALTER TABLE payment_events
      ADD COLUMN IF NOT EXISTS payment_status TEXT
    `;
    await sql`
      ALTER TABLE payment_events
      ADD COLUMN IF NOT EXISTS payment_method TEXT
    `;
    await sql`
      ALTER TABLE payment_events
      ADD COLUMN IF NOT EXISTS raw_event_json JSONB
    `;
    await sql`
      ALTER TABLE payment_events
      ADD COLUMN IF NOT EXISTS processing_status TEXT NOT NULL DEFAULT 'received'
    `;
    await sql`
      ALTER TABLE payment_events
      ADD COLUMN IF NOT EXISTS processing_error TEXT
    `;
    await sql`
      ALTER TABLE payment_events
      ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ
    `;
    await sql`
      ALTER TABLE payment_events
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS payment_events_created_at_idx
      ON payment_events (created_at DESC)
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS payment_events_psl_order_idx
      ON payment_events (psl_order_id)
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS finance_transactions (
        id BIGSERIAL PRIMARY KEY,
        psl_order_id TEXT NOT NULL UNIQUE,
        provider TEXT NOT NULL,
        provider_payment_id TEXT,
        payment_method TEXT,
        event_timestamp TIMESTAMPTZ NOT NULL,
        gross_amount NUMERIC(12,2) NOT NULL,
        currency TEXT NOT NULL DEFAULT 'USD',
        processor_fee NUMERIC(12,2),
        products TEXT,
        quantities TEXT,
        utm_source TEXT,
        utm_medium TEXT,
        utm_campaign TEXT,
        utm_content TEXT,
        landing_page TEXT,
        sheet_sync_status TEXT NOT NULL DEFAULT 'pending',
        sheet_sync_error TEXT,
        sheet_synced_at TIMESTAMPTZ,
        source_payment_event_id BIGINT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;
    await sql`
      ALTER TABLE finance_transactions
      ADD COLUMN IF NOT EXISTS provider_payment_id TEXT
    `;
    await sql`
      ALTER TABLE finance_transactions
      ADD COLUMN IF NOT EXISTS payment_method TEXT
    `;
    await sql`
      ALTER TABLE finance_transactions
      ADD COLUMN IF NOT EXISTS event_timestamp TIMESTAMPTZ
    `;
    await sql`
      ALTER TABLE finance_transactions
      ADD COLUMN IF NOT EXISTS gross_amount NUMERIC(12,2)
    `;
    await sql`
      ALTER TABLE finance_transactions
      ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'USD'
    `;
    // Nullable, no DEFAULT — unknown fees must remain NULL (not 0).
    await sql`
      ALTER TABLE finance_transactions
      ADD COLUMN IF NOT EXISTS processor_fee NUMERIC(12,2)
    `;
    await sql`
      ALTER TABLE finance_transactions
      ADD COLUMN IF NOT EXISTS products TEXT
    `;
    await sql`
      ALTER TABLE finance_transactions
      ADD COLUMN IF NOT EXISTS quantities TEXT
    `;
    await sql`
      ALTER TABLE finance_transactions
      ADD COLUMN IF NOT EXISTS utm_source TEXT
    `;
    await sql`
      ALTER TABLE finance_transactions
      ADD COLUMN IF NOT EXISTS utm_medium TEXT
    `;
    await sql`
      ALTER TABLE finance_transactions
      ADD COLUMN IF NOT EXISTS utm_campaign TEXT
    `;
    await sql`
      ALTER TABLE finance_transactions
      ADD COLUMN IF NOT EXISTS utm_content TEXT
    `;
    await sql`
      ALTER TABLE finance_transactions
      ADD COLUMN IF NOT EXISTS landing_page TEXT
    `;
    await sql`
      ALTER TABLE finance_transactions
      ADD COLUMN IF NOT EXISTS sheet_sync_status TEXT NOT NULL DEFAULT 'pending'
    `;
    await sql`
      ALTER TABLE finance_transactions
      ADD COLUMN IF NOT EXISTS sheet_sync_error TEXT
    `;
    await sql`
      ALTER TABLE finance_transactions
      ADD COLUMN IF NOT EXISTS sheet_synced_at TIMESTAMPTZ
    `;
    await sql`
      ALTER TABLE finance_transactions
      ADD COLUMN IF NOT EXISTS source_payment_event_id BIGINT
    `;
    await sql`
      ALTER TABLE finance_transactions
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    `;
    await sql`
      ALTER TABLE finance_transactions
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS finance_transactions_sheet_status_idx
      ON finance_transactions (sheet_sync_status)
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS finance_transactions_provider_payment_idx
      ON finance_transactions (provider_payment_id)
      WHERE provider_payment_id IS NOT NULL
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS finance_reconciliation_warnings (
        id BIGSERIAL PRIMARY KEY,
        warning_key TEXT NOT NULL UNIQUE,
        warning_type TEXT NOT NULL,
        psl_order_id TEXT,
        provider TEXT,
        provider_payment_id TEXT,
        message TEXT NOT NULL,
        details_json JSONB,
        status TEXT NOT NULL DEFAULT 'open',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;
    await sql`
      ALTER TABLE finance_reconciliation_warnings
      ADD COLUMN IF NOT EXISTS psl_order_id TEXT
    `;
    await sql`
      ALTER TABLE finance_reconciliation_warnings
      ADD COLUMN IF NOT EXISTS provider TEXT
    `;
    await sql`
      ALTER TABLE finance_reconciliation_warnings
      ADD COLUMN IF NOT EXISTS provider_payment_id TEXT
    `;
    await sql`
      ALTER TABLE finance_reconciliation_warnings
      ADD COLUMN IF NOT EXISTS details_json JSONB
    `;
    await sql`
      ALTER TABLE finance_reconciliation_warnings
      ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'open'
    `;
    await sql`
      ALTER TABLE finance_reconciliation_warnings
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    `;
    await sql`
      ALTER TABLE finance_reconciliation_warnings
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS finance_warnings_open_idx
      ON finance_reconciliation_warnings (created_at DESC)
      WHERE status = 'open'
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS finance_job_runs (
        id BIGSERIAL PRIMARY KEY,
        job_name TEXT NOT NULL,
        started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        finished_at TIMESTAMPTZ,
        status TEXT NOT NULL DEFAULT 'running',
        summary_json JSONB,
        error TEXT
      )
    `;
    await sql`
      ALTER TABLE finance_job_runs
      ADD COLUMN IF NOT EXISTS finished_at TIMESTAMPTZ
    `;
    await sql`
      ALTER TABLE finance_job_runs
      ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'running'
    `;
    await sql`
      ALTER TABLE finance_job_runs
      ADD COLUMN IF NOT EXISTS summary_json JSONB
    `;
    await sql`
      ALTER TABLE finance_job_runs
      ADD COLUMN IF NOT EXISTS error TEXT
    `;
    await sql`
      ALTER TABLE finance_job_runs
      ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ NOT NULL DEFAULT now()
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS finance_job_runs_started_idx
      ON finance_job_runs (started_at DESC)
    `;
  })().catch((error) => {
    schemaReady = null;
    throw error;
  });
  return schemaReady;
}

/**
 * Production migration check: processor_fee must be nullable with no DEFAULT.
 * Unknown fees must never be forced to 0.
 */
export async function assertFinanceProcessorFeeNullable(): Promise<{
  isNullable: boolean;
  columnDefault: string | null;
}> {
  await ensureFinanceSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'finance_transactions'
      AND column_name = 'processor_fee'
    LIMIT 1
  `) as Array<{ is_nullable: string; column_default: string | null }>;

  const row = rows[0];
  if (!row) {
    throw new Error(
      "finance_transactions.processor_fee column missing after migration"
    );
  }

  const isNullable = row.is_nullable === "YES";
  if (!isNullable) {
    throw new Error(
      "finance_transactions.processor_fee must be NULLABLE (unknown fees must not be forced to 0)"
    );
  }
  if (row.column_default !== null) {
    throw new Error(
      `finance_transactions.processor_fee must have no DEFAULT (found ${row.column_default})`
    );
  }

  return { isNullable, columnDefault: row.column_default };
}

/** Tables owned by the finance Phase 1 migration. */
export const FINANCE_TABLES = [
  "payment_events",
  "finance_transactions",
  "finance_reconciliation_warnings",
  "finance_job_runs",
] as const;
