import { getSql } from "@/lib/db/sql";

export const DECISION_ENGINE_TABLES = [
  "decision_engine_runs",
  "decision_signals",
] as const;

let schemaReady: Promise<void> | null = null;

export async function ensureDecisionEngineSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      const sql = getSql();
      await sql`
        CREATE TABLE IF NOT EXISTS decision_engine_runs (
          id BIGSERIAL PRIMARY KEY,
          started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          completed_at TIMESTAMPTZ,
          status TEXT NOT NULL DEFAULT 'running',
          sources_checked_json JSONB NOT NULL DEFAULT '{}'::jsonb,
          signals_created INTEGER NOT NULL DEFAULT 0,
          signals_resolved INTEGER NOT NULL DEFAULT 0,
          error_summary TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS decision_signals (
          id BIGSERIAL PRIMARY KEY,
          signal_key TEXT NOT NULL UNIQUE,
          signal_type TEXT NOT NULL,
          area TEXT NOT NULL,
          priority TEXT NOT NULL,
          confidence TEXT NOT NULL DEFAULT 'insufficient',
          status TEXT NOT NULL DEFAULT 'active',
          title TEXT NOT NULL,
          summary TEXT NOT NULL DEFAULT '',
          recommendation TEXT NOT NULL DEFAULT '',
          reasoning_json JSONB NOT NULL DEFAULT '{}'::jsonb,
          evidence_json JSONB NOT NULL DEFAULT '{}'::jsonb,
          risks_json JSONB NOT NULL DEFAULT '{}'::jsonb,
          what_could_make_wrong_json JSONB NOT NULL DEFAULT '[]'::jsonb,
          data_needed_json JSONB NOT NULL DEFAULT '[]'::jsonb,
          recommended_owner TEXT NOT NULL DEFAULT 'luke',
          source_href TEXT NOT NULL DEFAULT '/admin-decisions',
          first_detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          last_detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          acknowledged_at TIMESTAMPTZ,
          resolved_at TIMESTAMPTZ,
          dismissed_at TIMESTAMPTZ,
          last_notified_at TIMESTAMPTZ,
          last_notified_evidence_hash TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;

      await sql`
        CREATE INDEX IF NOT EXISTS decision_signals_status_priority_idx
        ON decision_signals (status, priority, last_detected_at DESC)
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS decision_signals_area_idx
        ON decision_signals (area, status)
      `;
    })().catch((e) => {
      schemaReady = null;
      throw e;
    });
  }
  await schemaReady;
}
