import { getSql } from "@/lib/db/sql";
import { ensureCustomerFeedbackSchema } from "./store";

export const CUSTOMER_INTEL_TABLES = [
  "customer_intelligence_signals",
  "customer_intelligence_snapshots",
] as const;

let intelSchemaReady: Promise<void> | null = null;

export async function ensureCustomerIntelligenceSchema(): Promise<void> {
  await ensureCustomerFeedbackSchema();
  if (!intelSchemaReady) {
    intelSchemaReady = (async () => {
      const sql = getSql();
      await sql`
        CREATE TABLE IF NOT EXISTS customer_intelligence_signals (
          id BIGSERIAL PRIMARY KEY,
          signal_key TEXT NOT NULL UNIQUE,
          signal_type TEXT NOT NULL,
          theme TEXT NOT NULL,
          evidence_class TEXT NOT NULL,
          product_sku TEXT,
          source_channel TEXT NOT NULL DEFAULT '',
          current_count INTEGER NOT NULL DEFAULT 0,
          prior_count INTEGER NOT NULL DEFAULT 0,
          sample_size INTEGER NOT NULL DEFAULT 0,
          confidence_level TEXT NOT NULL DEFAULT 'insufficient',
          first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          evidence_json JSONB NOT NULL DEFAULT '{}'::jsonb,
          status TEXT NOT NULL DEFAULT 'early',
          recommendation TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS customer_intel_signals_status_idx
        ON customer_intelligence_signals (status, confidence_level, last_seen_at DESC)
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS customer_intelligence_snapshots (
          id BIGSERIAL PRIMARY KEY,
          period_start DATE NOT NULL,
          period_end DATE NOT NULL,
          generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          snapshot_json JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (period_start, period_end)
        )
      `;
    })().catch((e) => {
      intelSchemaReady = null;
      throw e;
    });
  }
  await intelSchemaReady;
}
