import { getSql } from "@/lib/db/sql";

export const OPS_TABLES = [
  "ops_exception_acknowledgements",
  "ops_activity_events",
  "ops_activity_sync_state",
] as const;

let schemaReady: Promise<void> | null = null;

export async function ensureOpsSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      const sql = getSql();
      await sql`
        CREATE TABLE IF NOT EXISTS ops_exception_acknowledgements (
          id BIGSERIAL PRIMARY KEY,
          source_type TEXT NOT NULL,
          source_id TEXT NOT NULL,
          acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          acknowledged_by TEXT,
          note TEXT,
          resolved_at TIMESTAMPTZ,
          UNIQUE (source_type, source_id)
        )
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS ops_exception_ack_open_idx
        ON ops_exception_acknowledgements (resolved_at, acknowledged_at DESC)
      `;

      // Mission Control shared activity records (append-only, deduped by source_event_key).
      await sql`
        CREATE TABLE IF NOT EXISTS ops_activity_events (
          id BIGSERIAL PRIMARY KEY,
          source_event_key TEXT NOT NULL UNIQUE,
          correlation_id TEXT,
          parent_task_id TEXT,
          source_system TEXT NOT NULL,
          worker TEXT NOT NULL,
          event_type TEXT NOT NULL,
          outcome TEXT NOT NULL,
          observation TEXT NOT NULL,
          occurred_at TIMESTAMPTZ NOT NULL,
          received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          summary TEXT NOT NULL,
          source_ref TEXT,
          source_href TEXT,
          excluded BOOLEAN NOT NULL DEFAULT false,
          versions_json JSONB NOT NULL DEFAULT '{}'::jsonb,
          estimated_cost_usd NUMERIC(12,4),
          provider_cost_usd NUMERIC(12,4)
        )
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS ops_activity_events_occurred_idx
        ON ops_activity_events (occurred_at DESC)
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS ops_activity_events_worker_idx
        ON ops_activity_events (worker, occurred_at DESC)
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS ops_activity_sync_state (
          source TEXT PRIMARY KEY,
          last_attempt_at TIMESTAMPTZ,
          last_ok_at TIMESTAMPTZ,
          last_error TEXT,
          last_inserted INTEGER NOT NULL DEFAULT 0
        )
      `;
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  await schemaReady;
}
