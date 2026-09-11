import { getSql } from "@/lib/db/sql";

import { SUPPORT_TABLES } from "./constants";

let schemaReady: Promise<void> | null = null;

/**
 * Idempotent support agent schema.
 * Prefer `npm run migrate-support` before deploy.
 */
export async function ensureSupportSchema(): Promise<void> {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    const sql = getSql();

    await sql`
      CREATE TABLE IF NOT EXISTS support_threads (
        id BIGSERIAL PRIMARY KEY,
        thread_key TEXT NOT NULL UNIQUE,
        from_email TEXT NOT NULL,
        subject TEXT,
        auto_send_disabled BOOLEAN NOT NULL DEFAULT false,
        status TEXT NOT NULL DEFAULT 'open',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS support_messages (
        id BIGSERIAL PRIMARY KEY,
        thread_id BIGINT NOT NULL REFERENCES support_threads(id),
        provider_message_id TEXT NOT NULL UNIQUE,
        from_email TEXT NOT NULL,
        subject TEXT NOT NULL,
        received_at TIMESTAMPTZ NOT NULL,
        normalized_body TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ingested',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS support_messages_thread_idx
      ON support_messages (thread_id, received_at DESC)
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS support_messages_status_idx
      ON support_messages (status)
    `;
    await sql`
      ALTER TABLE support_messages
      ADD COLUMN IF NOT EXISTS reporting_excluded BOOLEAN NOT NULL DEFAULT false
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS support_messages_reporting_excluded_idx
      ON support_messages (reporting_excluded)
      WHERE reporting_excluded = true
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS support_classifications (
        id BIGSERIAL PRIMARY KEY,
        message_id BIGINT NOT NULL UNIQUE REFERENCES support_messages(id),
        category TEXT NOT NULL,
        risk_level TEXT NOT NULL,
        confidence NUMERIC(5,4) NOT NULL,
        reasons_json JSONB NOT NULL DEFAULT '[]'::jsonb,
        auto_response_allowed BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS support_responses (
        id BIGSERIAL PRIMARY KEY,
        message_id BIGINT NOT NULL REFERENCES support_messages(id),
        draft_body TEXT NOT NULL,
        sent_body TEXT,
        knowledge_sources JSONB NOT NULL DEFAULT '[]'::jsonb,
        ai_drafted BOOLEAN NOT NULL DEFAULT false,
        human_approved BOOLEAN NOT NULL DEFAULT false,
        policy_decision TEXT NOT NULL,
        sent_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS support_responses_message_idx
      ON support_responses (message_id)
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS support_escalations (
        id BIGSERIAL PRIMARY KEY,
        message_id BIGINT NOT NULL REFERENCES support_messages(id),
        risk_level TEXT NOT NULL,
        reason TEXT NOT NULL,
        notified_at TIMESTAMPTZ,
        resolved_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS support_escalations_open_idx
      ON support_escalations (resolved_at, created_at DESC)
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS support_job_runs (
        id BIGSERIAL PRIMARY KEY,
        started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        finished_at TIMESTAMPTZ,
        ok BOOLEAN,
        messages_checked INTEGER NOT NULL DEFAULT 0,
        new_messages INTEGER NOT NULL DEFAULT 0,
        auto_sent INTEGER NOT NULL DEFAULT 0,
        escalated INTEGER NOT NULL DEFAULT 0,
        failed INTEGER NOT NULL DEFAULT 0,
        skipped INTEGER NOT NULL DEFAULT 0,
        error_summary TEXT,
        details_json JSONB
      )
    `;
  })().catch((error) => {
    schemaReady = null;
    throw error;
  });
  return schemaReady;
}

export { SUPPORT_TABLES };
