import { getSql } from "@/lib/db/sql";

export const X_PUBLISHING_TABLES = [
  "x_publishing_posts",
  "x_publishing_attempts",
  "x_publishing_control",
] as const;

/**
 * Additive DDL for the approved X post queue. Only the explicit migration
 * (`npm run migrate-x-publishing`) and the isolated DB test call this — never
 * a page load, API read, or n8n request. Creates no rows: a missing control
 * row means paused.
 */
export async function ensureXPublishingSchema(): Promise<void> {
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS x_publishing_posts (
      id UUID PRIMARY KEY,
      status TEXT NOT NULL CHECK (status IN (
        'draft','approved','claimed','dispatched','created','published',
        'rejected','uncertain','expired','cancelled'
      )),
      revision INTEGER NOT NULL CHECK (revision >= 1),
      text TEXT NOT NULL,
      text_hash TEXT NOT NULL,
      source_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
      account_id TEXT NOT NULL CHECK (account_id ~ '^[1-9][0-9]{0,18}$'),
      account_handle TEXT NOT NULL,
      is_test BOOLEAN NOT NULL,
      schedule_kind TEXT NOT NULL CHECK (schedule_kind IN ('scheduled','next_manual_run')),
      scheduled_for TIMESTAMPTZ,
      expires_at TIMESTAMPTZ,
      scheduled_day TEXT,
      approval_hash TEXT,
      approved_revision INTEGER,
      approved_at TIMESTAMPTZ,
      approved_by TEXT,
      approval_context JSONB,
      active_attempt_id UUID,
      x_post_id TEXT CHECK (x_post_id IS NULL OR x_post_id ~ '^[1-9][0-9]{0,18}$'),
      verified_at TIMESTAMPTZ,
      review_required BOOLEAN NOT NULL DEFAULT false,
      last_error_code TEXT,
      last_error_message TEXT,
      created_by TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT x_publishing_posts_approval_complete CHECK (
        status NOT IN ('approved','claimed','dispatched','created','published','uncertain')
        OR (
          approval_hash IS NOT NULL AND approved_revision = revision
          AND scheduled_for IS NOT NULL AND expires_at > scheduled_for
          AND scheduled_day IS NOT NULL
        )
      )
    )
  `;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS x_publishing_posts_active_text_uq
    ON x_publishing_posts (account_id, text_hash, is_test)
    WHERE status IN ('approved','claimed','dispatched','created','published','uncertain')
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS x_publishing_posts_due_idx
    ON x_publishing_posts (is_test, status, scheduled_for)
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS x_publishing_attempts (
      id UUID PRIMARY KEY,
      post_id UUID NOT NULL REFERENCES x_publishing_posts(id),
      approved_revision INTEGER NOT NULL,
      approval_hash TEXT NOT NULL,
      payload_text TEXT NOT NULL,
      account_id TEXT NOT NULL CHECK (account_id ~ '^[1-9][0-9]{0,18}$'),
      is_test BOOLEAN NOT NULL,
      mode TEXT NOT NULL CHECK (mode IN ('live','dry_run')),
      trigger TEXT NOT NULL CHECK (trigger IN ('manual','schedule')),
      execution_id TEXT NOT NULL,
      claim_token_hash TEXT NOT NULL,
      state TEXT NOT NULL CHECK (state IN (
        'claimed','identity_ok','released','identity_failed','dispatched',
        'created','published','rejected','uncertain','not_created'
      )),
      claimed_at TIMESTAMPTZ NOT NULL,
      lease_expires_at TIMESTAMPTZ NOT NULL,
      identity_checked_at TIMESTAMPTZ,
      identity_http_status INTEGER,
      identity_account_id TEXT,
      permit_issued_at TIMESTAMPTZ,
      permit_day TEXT,
      dispatch_deadline TIMESTAMPTZ,
      result_received_at TIMESTAMPTZ,
      result_http_status INTEGER,
      result_fingerprint TEXT,
      x_post_id TEXT CHECK (x_post_id IS NULL OR x_post_id ~ '^[1-9][0-9]{0,18}$'),
      error_code TEXT,
      error_message TEXT,
      rate_limit_reset_at TIMESTAMPTZ,
      review_required BOOLEAN NOT NULL DEFAULT false,
      review_note TEXT,
      lookup_token_hash TEXT,
      lookup_lease_expires_at TIMESTAMPTZ,
      lookup_attempts INTEGER NOT NULL DEFAULT 0,
      next_lookup_at TIMESTAMPTZ,
      verified_at TIMESTAMPTZ,
      verification JSONB,
      reconcile_candidate_id TEXT CHECK (
        reconcile_candidate_id IS NULL OR reconcile_candidate_id ~ '^[1-9][0-9]{0,18}$'
      ),
      resolved_by TEXT,
      resolved_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT x_publishing_attempts_permit_complete CHECK (
        permit_issued_at IS NULL OR (permit_day IS NOT NULL AND dispatch_deadline IS NOT NULL)
      ),
      CONSTRAINT x_publishing_attempts_sent_has_permit CHECK (
        state NOT IN ('dispatched','created','published','rejected','uncertain','not_created')
        OR permit_issued_at IS NOT NULL
      )
    )
  `;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS x_publishing_attempts_one_permit_uq
    ON x_publishing_attempts (post_id, approved_revision)
    WHERE permit_issued_at IS NOT NULL
  `;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS x_publishing_attempts_one_active_uq
    ON x_publishing_attempts (post_id)
    WHERE state IN ('claimed','identity_ok','dispatched')
  `;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS x_publishing_attempts_x_post_uq
    ON x_publishing_attempts (is_test, x_post_id)
    WHERE x_post_id IS NOT NULL
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS x_publishing_attempts_permit_day_idx
    ON x_publishing_attempts (is_test, permit_day)
    WHERE permit_issued_at IS NOT NULL
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS x_publishing_control (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      paused BOOLEAN NOT NULL,
      reason TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_by TEXT NOT NULL
    )
  `;
}

export type XPublishingSchemaState = { initialized: boolean; missing: string[] };

/** Read-only catalog probe; never creates anything. */
export async function getXPublishingSchemaState(): Promise<XPublishingSchemaState> {
  const sql = getSql();
  const rows = (await sql`
    SELECT
      to_regclass('public.x_publishing_posts')::text AS x_posts,
      to_regclass('public.x_publishing_attempts')::text AS x_attempts,
      to_regclass('public.x_publishing_control')::text AS x_control
  `) as Array<Record<string, string | null>>;
  const row = rows[0] ?? {};
  const missing: string[] = [];
  if (!row.x_posts) missing.push("x_publishing_posts");
  if (!row.x_attempts) missing.push("x_publishing_attempts");
  if (!row.x_control) missing.push("x_publishing_control");
  return { initialized: missing.length === 0, missing };
}
