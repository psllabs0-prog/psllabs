import { getSql } from "@/lib/db/sql";

export const MISSION_CONTROL_TABLES = [
  "ops_activity_events",
  "ops_activity_sync_state",
] as const;

/**
 * DDL for Mission Control activity records. Only the explicit migration
 * (`npm run migrate-ops`) calls this — never a page load, API read, or sync.
 */
export async function ensureMissionControlSchema(): Promise<void> {
  const sql = getSql();
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
}

export type MissionControlSchemaState = {
  initialized: boolean;
  missing: string[];
};

/** Read-only catalog probe; never creates anything. */
export async function getMissionControlSchemaState(): Promise<MissionControlSchemaState> {
  const sql = getSql();
  const rows = (await sql`
    SELECT
      to_regclass('public.ops_activity_events')::text AS events,
      to_regclass('public.ops_activity_sync_state')::text AS sync_state
  `) as Array<{ events: string | null; sync_state: string | null }>;
  const row = rows[0];
  const missing: string[] = [];
  if (!row?.events) missing.push("ops_activity_events");
  if (!row?.sync_state) missing.push("ops_activity_sync_state");
  return { initialized: missing.length === 0, missing };
}
