import { getSql } from "@/lib/db/sql";

export const RETENTION_TABLES = [
  "customer_marketing_preferences",
  "marketing_suppressions",
  "retention_email_sends",
  "retention_job_runs",
] as const;

export const RETENTION_CAMPAIGN_30D = "post_purchase_30d_v1";

let schemaReady: Promise<void> | null = null;

export async function ensureRetentionSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      const sql = getSql();

      await sql`
        CREATE TABLE IF NOT EXISTS customer_marketing_preferences (
          id BIGSERIAL PRIMARY KEY,
          email TEXT NOT NULL UNIQUE,
          marketing_eligible BOOLEAN NOT NULL DEFAULT false,
          source TEXT,
          consented_at TIMESTAMPTZ,
          unsubscribed_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS customer_marketing_preferences_eligible_idx
        ON customer_marketing_preferences (marketing_eligible)
        WHERE marketing_eligible = true AND unsubscribed_at IS NULL
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS marketing_suppressions (
          id BIGSERIAL PRIMARY KEY,
          email TEXT NOT NULL,
          reason TEXT NOT NULL,
          source TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (email, reason)
        )
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS marketing_suppressions_email_idx
        ON marketing_suppressions (email)
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS retention_email_sends (
          id BIGSERIAL PRIMARY KEY,
          campaign TEXT NOT NULL,
          order_id TEXT NOT NULL,
          email TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          claimed_at TIMESTAMPTZ,
          sent_at TIMESTAMPTZ,
          last_error TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (campaign, order_id)
        )
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS retention_email_sends_status_idx
        ON retention_email_sends (status, created_at DESC)
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS retention_job_runs (
          id BIGSERIAL PRIMARY KEY,
          started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          finished_at TIMESTAMPTZ,
          ok BOOLEAN,
          candidates INTEGER NOT NULL DEFAULT 0,
          sent INTEGER NOT NULL DEFAULT 0,
          skipped INTEGER NOT NULL DEFAULT 0,
          failed INTEGER NOT NULL DEFAULT 0,
          error_summary TEXT,
          details_json JSONB
        )
      `;
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  await schemaReady;
}
