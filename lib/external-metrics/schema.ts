import { getSql } from "@/lib/db/sql";

export const EXTERNAL_METRICS_TABLES = [
  "external_metric_sync_runs",
  "search_console_daily",
  "paid_acquisition_daily",
] as const;

let schemaReady: Promise<void> | null = null;

export async function ensureExternalMetricsSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      const sql = getSql();

      await sql`
        CREATE TABLE IF NOT EXISTS external_metric_sync_runs (
          id BIGSERIAL PRIMARY KEY,
          provider TEXT NOT NULL,
          started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          completed_at TIMESTAMPTZ,
          status TEXT NOT NULL DEFAULT 'running',
          records_received INTEGER NOT NULL DEFAULT 0,
          records_written INTEGER NOT NULL DEFAULT 0,
          error_summary TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS external_metric_sync_runs_provider_idx
        ON external_metric_sync_runs (provider, started_at DESC)
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS search_console_daily (
          id BIGSERIAL PRIMARY KEY,
          date DATE NOT NULL,
          property TEXT NOT NULL,
          page TEXT NOT NULL DEFAULT '',
          query TEXT NOT NULL DEFAULT '',
          clicks NUMERIC(12,2) NOT NULL DEFAULT 0,
          impressions NUMERIC(12,2) NOT NULL DEFAULT 0,
          ctr NUMERIC(10,6) NOT NULL DEFAULT 0,
          position NUMERIC(10,4) NOT NULL DEFAULT 0,
          is_brand BOOLEAN NOT NULL DEFAULT false,
          synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (date, property, page, query)
        )
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS search_console_daily_date_idx
        ON search_console_daily (date DESC)
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS search_console_daily_brand_idx
        ON search_console_daily (date, is_brand)
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS paid_acquisition_daily (
          id BIGSERIAL PRIMARY KEY,
          date DATE NOT NULL,
          platform TEXT NOT NULL,
          account_id TEXT NOT NULL DEFAULT '',
          campaign_id TEXT NOT NULL DEFAULT '',
          campaign_name TEXT NOT NULL DEFAULT '',
          adset_id TEXT,
          adset_name TEXT,
          ad_id TEXT,
          ad_name TEXT,
          spend_usd NUMERIC(12,2) NOT NULL DEFAULT 0,
          impressions BIGINT NOT NULL DEFAULT 0,
          clicks BIGINT NOT NULL DEFAULT 0,
          platform_purchases NUMERIC(12,2),
          platform_purchase_value_usd NUMERIC(12,2),
          synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;
      await sql`
        CREATE UNIQUE INDEX IF NOT EXISTS paid_acquisition_daily_uniq
        ON paid_acquisition_daily (
          date,
          platform,
          account_id,
          campaign_id,
          COALESCE(adset_id, ''),
          COALESCE(ad_id, '')
        )
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS paid_acquisition_daily_date_idx
        ON paid_acquisition_daily (date DESC, platform)
      `;
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  await schemaReady;
}
