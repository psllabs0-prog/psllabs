import { getSql } from "@/lib/db/sql";
import { RETENTION_TABLES } from "@/lib/retention/schema";

export const NEWSLETTER_WELCOME_TABLES = [
  "newsletter_consent_requests",
  "newsletter_subscriptions",
  "newsletter_email_sends",
  "newsletter_rate_limits",
  "newsletter_welcome_runs",
] as const;

export const NEWSLETTER_SEND_KINDS = ["confirmation", "welcome_1", "welcome_2", "welcome_3"] as const;
export type NewsletterSendKind = (typeof NEWSLETTER_SEND_KINDS)[number];

export const NEWSLETTER_SEND_STATUSES = [
  "queued",
  "attempting",
  "accepted",
  "simulated",
  "failed",
  "rejected",
  "unknown",
  "suppressed",
  "skipped_stale",
  "cancelled",
] as const;
export type NewsletterSendStatus = (typeof NEWSLETTER_SEND_STATUSES)[number];

const list = (values: readonly string[]) => values.map((v) => `'${v}'`).join(", ");

/**
 * Explicit, idempotent, additive DDL. Called only by
 * `npm run migrate-newsletter-welcome` and the isolated DB test — never by
 * page loads, API requests, or cron runs.
 */
export async function ensureNewsletterWelcomeSchema(): Promise<void> {
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS newsletter_consent_requests (
      id BIGSERIAL PRIMARY KEY,
      email TEXT NOT NULL,
      is_test BOOLEAN NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      placement TEXT NOT NULL,
      signup_copy_version TEXT NOT NULL,
      consent_version TEXT NOT NULL,
      consent_text_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      confirmed_at TIMESTAMPTZ,
      invalidated_at TIMESTAMPTZ,
      invalidated_reason TEXT
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS newsletter_consent_requests_email_idx
    ON newsletter_consent_requests (email, is_test, created_at DESC)
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS newsletter_subscriptions (
      id BIGSERIAL PRIMARY KEY,
      public_id TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL,
      is_test BOOLEAN NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('confirmed', 'unsubscribed')),
      request_id BIGINT NOT NULL,
      placement TEXT NOT NULL,
      signup_copy_version TEXT NOT NULL,
      consent_version TEXT NOT NULL,
      consent_text_hash TEXT NOT NULL,
      confirmed_at TIMESTAMPTZ NOT NULL,
      unsubscribed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL,
      UNIQUE (email, is_test)
    )
  `;
  await sql.query(`
    CREATE TABLE IF NOT EXISTS newsletter_email_sends (
      id BIGSERIAL PRIMARY KEY,
      kind TEXT NOT NULL CHECK (kind IN (${list(NEWSLETTER_SEND_KINDS)})),
      email TEXT NOT NULL,
      is_test BOOLEAN NOT NULL,
      request_id BIGINT,
      subscription_id BIGINT,
      status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN (${list(NEWSLETTER_SEND_STATUSES)})),
      due_at TIMESTAMPTZ NOT NULL,
      template_version TEXT,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      claim_token TEXT,
      claimed_at TIMESTAMPTZ,
      accepted_at TIMESTAMPTZ,
      simulated_at TIMESTAMPTZ,
      finished_at TIMESTAMPTZ,
      message_id TEXT,
      provider_queue_id TEXT,
      provider_response TEXT,
      error_category TEXT,
      status_reason TEXT,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL,
      CHECK ((kind = 'confirmation' AND request_id IS NOT NULL) OR (kind <> 'confirmation' AND subscription_id IS NOT NULL))
    )
  `);
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS newsletter_email_sends_confirmation_uniq
    ON newsletter_email_sends (request_id) WHERE kind = 'confirmation'
  `;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS newsletter_email_sends_step_uniq
    ON newsletter_email_sends (subscription_id, kind) WHERE subscription_id IS NOT NULL
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS newsletter_email_sends_due_idx
    ON newsletter_email_sends (status, due_at)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS newsletter_email_sends_email_idx
    ON newsletter_email_sends (email, created_at DESC)
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS newsletter_rate_limits (
      bucket TEXT NOT NULL,
      window_start TIMESTAMPTZ NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (bucket, window_start)
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS newsletter_welcome_runs (
      id BIGSERIAL PRIMARY KEY,
      started_at TIMESTAMPTZ NOT NULL,
      finished_at TIMESTAMPTZ,
      ok BOOLEAN,
      is_test BOOLEAN NOT NULL DEFAULT false,
      summary JSONB,
      error_summary TEXT
    )
  `;
}

export type NewsletterSchemaState = { ready: boolean; missing: string[] };

let readyCache = false;

/** Read-only presence check (never creates anything). Only a positive result is cached. */
export async function getNewsletterWelcomeSchemaState(): Promise<NewsletterSchemaState> {
  if (readyCache) return { ready: true, missing: [] };
  const sql = getSql();
  const names = [...NEWSLETTER_WELCOME_TABLES, ...RETENTION_TABLES] as string[];
  const rows = (await sql`
    SELECT n AS name, to_regclass('public.' || n) IS NOT NULL AS present
    FROM unnest(${names}::text[]) AS n
  `) as Array<{ name: string; present: boolean }>;
  const missing = rows.filter((r) => !r.present).map((r) => r.name);
  readyCache = missing.length === 0;
  return { ready: readyCache, missing };
}

export function __resetNewsletterSchemaCacheForTests(): void {
  readyCache = false;
}
