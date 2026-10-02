import { getSql } from "@/lib/db/sql";

import type { NewsletterSendKind } from "./schema";
import { NEWSLETTER_STEP_DELAY_HOURS } from "./templates";

type Sql = ReturnType<typeof getSql>;
type Row = Record<string, unknown>;
type Query = ReturnType<Sql>;

export const SIGNUP_LIMITS = {
  addressPerHour: 5,
  ipPerHour: 5,
  globalPerHour: 100,
  maxAttempts: 3,
} as const;

/** Hours after due_at before a step is skipped instead of sent late. */
export const STALE_AFTER_HOURS: Record<Exclude<NewsletterSendKind, "confirmation">, number> = {
  welcome_1: 48,
  welcome_2: 72,
  welcome_3: 72,
};

const iso = (d: Date) => d.toISOString();

/** Serialises every consent/send decision for one address. */
async function lockedForEmail(sql: Sql, email: string, queries: Query[]): Promise<Row[][]> {
  const results = (await sql.transaction(
    [sql`SELECT pg_advisory_xact_lock(hashtext(${`psl:newsletter:${email}`}))`, ...queries],
    { isolationLevel: "ReadCommitted" }
  )) as Row[][];
  return results.slice(1);
}

export async function incrementRateLimit(bucket: string, now: Date): Promise<number> {
  const sql = getSql();
  const rows = (await sql`
    INSERT INTO newsletter_rate_limits (bucket, window_start, count)
    VALUES (${bucket}, date_trunc('hour', ${iso(now)}::timestamptz), 1)
    ON CONFLICT (bucket, window_start) DO UPDATE SET count = newsletter_rate_limits.count + 1
    RETURNING count
  `) as Array<{ count: number }>;
  return Number(rows[0]?.count ?? 0);
}

export type EnrollResult =
  | { outcome: "subscribed"; subscriptionId: string; welcome1SendId: string | null }
  | { outcome: "blocked" }
  | { outcome: "already_subscribed" };

/**
 * Single opt-in: records the subscription and its three step rows, timed from
 * the submission, in one locked transaction. Refuses any address with a
 * suppression or unsubscribe of any reason (an unauthenticated signup never
 * re-subscribes an opt-out) or an active subscription in either partition, so
 * retries and concurrent submissions enroll once. confirmed_at stays NULL:
 * permission is recorded, mailbox ownership is not claimed.
 */
export async function enrollSingleOptIn(input: {
  email: string;
  isTest: boolean;
  publicId: string;
  placement: string;
  signupCopyVersion: string;
  consentVersion: string;
  consentTextHash: string;
  now: Date;
}): Promise<EnrollResult> {
  const sql = getSql();
  const e = input.email;
  const now = iso(input.now);
  const d = NEWSLETTER_STEP_DELAY_HOURS;
  const [rows] = await lockedForEmail(sql, e, [
    sql`
      WITH flags AS (
        SELECT
          (EXISTS (SELECT 1 FROM marketing_suppressions WHERE email = ${e})
            OR EXISTS (SELECT 1 FROM customer_marketing_preferences WHERE email = ${e} AND unsubscribed_at IS NOT NULL)
            OR EXISTS (SELECT 1 FROM newsletter_subscriptions WHERE email = ${e} AND unsubscribed_at IS NOT NULL)) AS blocked,
          EXISTS (SELECT 1 FROM newsletter_subscriptions WHERE email = ${e} AND status IN ('confirmed', 'subscribed')) AS already
      ),
      sub AS (
        INSERT INTO newsletter_subscriptions (
          public_id, email, is_test, status, consent_method, placement, signup_copy_version,
          consent_version, consent_text_hash, subscribed_at, created_at, updated_at
        )
        SELECT ${input.publicId}, ${e}, ${input.isTest}::boolean, 'subscribed', 'single_opt_in', ${input.placement},
               ${input.signupCopyVersion}, ${input.consentVersion}, ${input.consentTextHash},
               ${now}::timestamptz, ${now}::timestamptz, ${now}::timestamptz
        FROM flags WHERE NOT blocked AND NOT already
        ON CONFLICT (email, is_test) DO NOTHING
        RETURNING id, email, is_test
      ),
      steps AS (
        INSERT INTO newsletter_email_sends (kind, email, is_test, subscription_id, status, due_at, created_at, updated_at)
        SELECT k.kind, sub.email, sub.is_test, sub.id, 'queued',
               ${now}::timestamptz + make_interval(hours => k.hours), ${now}::timestamptz, ${now}::timestamptz
        FROM sub
        CROSS JOIN (VALUES ('welcome_1', ${d.welcome_1}::int), ('welcome_2', ${d.welcome_2}::int), ('welcome_3', ${d.welcome_3}::int)) AS k(kind, hours)
        ON CONFLICT DO NOTHING
        RETURNING id, kind
      )
      SELECT f.blocked, f.already,
             (SELECT id FROM sub)::text AS subscription_id,
             (SELECT id FROM steps WHERE kind = 'welcome_1')::text AS welcome1_id
      FROM flags f
    `,
  ]);
  const r = rows[0] ?? {};
  if (r.subscription_id) {
    return { outcome: "subscribed", subscriptionId: String(r.subscription_id), welcome1SendId: r.welcome1_id ? String(r.welcome1_id) : null };
  }
  return r.blocked ? { outcome: "blocked" } : { outcome: "already_subscribed" };
}

export type ConsentRequestRecord = {
  id: string;
  email: string;
  isTest: boolean;
  confirmedAt: string | null;
  invalidatedAt: string | null;
  expiresAt: string;
};

export async function findConsentRequestByTokenHash(tokenHash: string): Promise<ConsentRequestRecord | null> {
  const sql = getSql();
  const rows = (await sql`
    SELECT id::text AS id, email, is_test, confirmed_at, invalidated_at, expires_at
    FROM newsletter_consent_requests WHERE token_hash = ${tokenHash} LIMIT 1
  `) as Row[];
  const r = rows[0];
  if (!r) return null;
  const t = (v: unknown) => (v == null ? null : new Date(v as string).toISOString());
  return {
    id: String(r.id),
    email: String(r.email),
    isTest: Boolean(r.is_test),
    confirmedAt: t(r.confirmed_at),
    invalidatedAt: t(r.invalidated_at),
    expiresAt: t(r.expires_at)!,
  };
}

export type ConfirmResult =
  | { outcome: "confirmed"; subscriptionId: string; welcome1SendId: string | null }
  | { outcome: "already_confirmed" }
  | { outcome: "invalid"; reason: "not_found" | "expired" | "invalidated" | "blocked" | "already_subscribed" };

/**
 * Confirms exactly one current request. Refuses expired, superseded, or
 * replayed tokens and any address with an unsubscribe or suppression of any
 * reason — an old link can never undo an opt-out. Creates the subscription
 * and its three step rows atomically; repeat confirmation is idempotent.
 */
export async function confirmConsentRequest(input: {
  tokenHash: string;
  publicId: string;
  now: Date;
}): Promise<ConfirmResult> {
  const found = await findConsentRequestByTokenHash(input.tokenHash);
  if (!found) return { outcome: "invalid", reason: "not_found" };
  const sql = getSql();
  const e = found.email;
  const now = iso(input.now);
  const d = NEWSLETTER_STEP_DELAY_HOURS;
  const [rows, statusRows] = await lockedForEmail(sql, e, [
    sql`
      WITH req AS (
        UPDATE newsletter_consent_requests r
        SET confirmed_at = ${now}::timestamptz
        WHERE r.token_hash = ${input.tokenHash}
          AND r.confirmed_at IS NULL AND r.invalidated_at IS NULL AND r.expires_at > ${now}::timestamptz
          AND NOT EXISTS (SELECT 1 FROM marketing_suppressions WHERE email = r.email)
          AND NOT EXISTS (SELECT 1 FROM customer_marketing_preferences WHERE email = r.email AND unsubscribed_at IS NOT NULL)
          AND NOT EXISTS (SELECT 1 FROM newsletter_subscriptions WHERE email = r.email AND unsubscribed_at IS NOT NULL)
          AND NOT EXISTS (SELECT 1 FROM newsletter_subscriptions WHERE email = r.email AND status IN ('confirmed', 'subscribed'))
        RETURNING r.id, r.email, r.is_test, r.placement, r.signup_copy_version, r.consent_version, r.consent_text_hash
      ),
      sub AS (
        INSERT INTO newsletter_subscriptions (
          public_id, email, is_test, status, consent_method, request_id, placement, signup_copy_version,
          consent_version, consent_text_hash, confirmed_at, subscribed_at, created_at, updated_at
        )
        SELECT ${input.publicId}, email, is_test, 'confirmed', 'double_opt_in', id, placement, signup_copy_version,
               consent_version, consent_text_hash, ${now}::timestamptz, ${now}::timestamptz, ${now}::timestamptz, ${now}::timestamptz
        FROM req
        ON CONFLICT (email, is_test) DO NOTHING
        RETURNING id, email, is_test
      ),
      steps AS (
        INSERT INTO newsletter_email_sends (kind, email, is_test, subscription_id, status, due_at, created_at, updated_at)
        SELECT k.kind, sub.email, sub.is_test, sub.id, 'queued',
               ${now}::timestamptz + make_interval(hours => k.hours), ${now}::timestamptz, ${now}::timestamptz
        FROM sub
        CROSS JOIN (VALUES ('welcome_1', ${d.welcome_1}::int), ('welcome_2', ${d.welcome_2}::int), ('welcome_3', ${d.welcome_3}::int)) AS k(kind, hours)
        ON CONFLICT DO NOTHING
        RETURNING id, kind
      )
      SELECT (SELECT COUNT(*) FROM req)::int AS confirmed,
             (SELECT id FROM sub)::text AS subscription_id,
             (SELECT id FROM steps WHERE kind = 'welcome_1')::text AS welcome1_id
    `,
    sql`
      SELECT r.confirmed_at, r.invalidated_at, r.expires_at,
        (EXISTS (SELECT 1 FROM marketing_suppressions WHERE email = r.email)
          OR EXISTS (SELECT 1 FROM customer_marketing_preferences WHERE email = r.email AND unsubscribed_at IS NOT NULL)
          OR EXISTS (SELECT 1 FROM newsletter_subscriptions WHERE email = r.email AND unsubscribed_at IS NOT NULL)) AS blocked
      FROM newsletter_consent_requests r WHERE r.token_hash = ${input.tokenHash}
    `,
  ]);
  const r = rows[0] ?? {};
  if (Number(r.confirmed) === 1 && r.subscription_id) {
    return { outcome: "confirmed", subscriptionId: String(r.subscription_id), welcome1SendId: r.welcome1_id ? String(r.welcome1_id) : null };
  }
  const a = statusRows[0];
  if (!a) return { outcome: "invalid", reason: "not_found" };
  if (a.blocked) return { outcome: "invalid", reason: "blocked" };
  if (a.confirmed_at) return { outcome: "already_confirmed" };
  if (a.invalidated_at) return { outcome: "invalid", reason: "invalidated" };
  if (new Date(a.expires_at as string).getTime() <= input.now.getTime()) return { outcome: "invalid", reason: "expired" };
  return { outcome: "invalid", reason: "already_subscribed" };
}

export async function findSubscriptionEmailByPublicId(publicId: string): Promise<string | null> {
  const sql = getSql();
  const rows = (await sql`SELECT email FROM newsletter_subscriptions WHERE public_id = ${publicId} LIMIT 1`) as Row[];
  return rows[0] ? String(rows[0].email) : null;
}

/** Ends the welcome journey for an address (both partitions) and cancels pending work. */
export async function markNewsletterUnsubscribed(email: string, now: Date): Promise<{ subscriptions: number; cancelled: number }> {
  const sql = getSql();
  const t = iso(now);
  const [subs, sends] = await lockedForEmail(sql, email, [
    sql`
      UPDATE newsletter_subscriptions
      SET status = 'unsubscribed', unsubscribed_at = COALESCE(unsubscribed_at, ${t}::timestamptz), updated_at = ${t}::timestamptz
      WHERE email = ${email} AND unsubscribed_at IS NULL
      RETURNING id
    `,
    sql`
      UPDATE newsletter_email_sends
      SET status = 'cancelled', status_reason = 'unsubscribed', finished_at = ${t}::timestamptz, updated_at = ${t}::timestamptz
      WHERE email = ${email} AND status IN ('queued', 'failed')
      RETURNING id
    `,
    sql`
      UPDATE newsletter_consent_requests
      SET invalidated_at = ${t}::timestamptz, invalidated_reason = 'unsubscribed'
      WHERE email = ${email} AND confirmed_at IS NULL AND invalidated_at IS NULL
      RETURNING id
    `,
  ]);
  return { subscriptions: subs.length, cancelled: sends.length };
}

export type SendRecord = {
  id: string;
  kind: NewsletterSendKind;
  email: string;
  isTest: boolean;
  status: string;
  subscriptionPublicId: string | null;
};

export async function getSendRecord(id: string): Promise<SendRecord | null> {
  const sql = getSql();
  const rows = (await sql`
    SELECT s.id::text AS id, s.kind, s.email, s.is_test, s.status, sub.public_id
    FROM newsletter_email_sends s
    LEFT JOIN newsletter_subscriptions sub ON sub.id = s.subscription_id
    WHERE s.id = ${id}::bigint
  `) as Row[];
  const r = rows[0];
  if (!r) return null;
  return {
    id: String(r.id),
    kind: r.kind as NewsletterSendKind,
    email: String(r.email),
    isTest: Boolean(r.is_test),
    status: String(r.status),
    subscriptionPublicId: r.public_id ? String(r.public_id) : null,
  };
}

export type ClaimResult =
  | { claimed: true; attempt: number }
  | { claimed: false; status: string; reason: string };

/**
 * Re-checks eligibility immediately before a send, then claims it. In one
 * locked transaction: suppressed/unsubscribed → suppressed; overdue → skipped;
 * predecessor never sent → cancelled; otherwise claim only if due, under the
 * attempt cap, in order behind an accepted previous step that is at least 24h
 * old, with no other welcome step in the last 24h, and (for steps 2–3) no
 * retention email to the same address in the last 24h.
 */
export async function claimSend(input: {
  id: string;
  email: string;
  claimToken: string;
  templateVersion: string;
  now: Date;
}): Promise<ClaimResult> {
  const sql = getSql();
  const t = iso(input.now);
  const id = input.id;
  const e = input.email;
  const [suppressed, stale, orphaned, claimed, current] = await lockedForEmail(sql, e, [
    sql`
      UPDATE newsletter_email_sends s
      SET status = 'suppressed', status_reason = 'suppressed_or_unsubscribed', finished_at = ${t}::timestamptz, updated_at = ${t}::timestamptz
      WHERE s.id = ${id}::bigint AND s.status IN ('queued', 'failed')
        AND (EXISTS (SELECT 1 FROM marketing_suppressions WHERE email = s.email)
          OR EXISTS (SELECT 1 FROM customer_marketing_preferences WHERE email = s.email AND unsubscribed_at IS NOT NULL)
          OR EXISTS (SELECT 1 FROM newsletter_subscriptions WHERE email = s.email AND unsubscribed_at IS NOT NULL))
      RETURNING s.id
    `,
    sql`
      UPDATE newsletter_email_sends s
      SET status = 'skipped_stale', status_reason = 'overdue', finished_at = ${t}::timestamptz, updated_at = ${t}::timestamptz
      WHERE s.id = ${id}::bigint AND s.status IN ('queued', 'failed') AND s.kind <> 'confirmation'
        AND s.due_at < ${t}::timestamptz - make_interval(hours => CASE s.kind
          WHEN 'welcome_1' THEN ${STALE_AFTER_HOURS.welcome_1}::int
          WHEN 'welcome_2' THEN ${STALE_AFTER_HOURS.welcome_2}::int
          ELSE ${STALE_AFTER_HOURS.welcome_3}::int END)
      RETURNING s.id
    `,
    sql`
      UPDATE newsletter_email_sends s
      SET status = 'cancelled', status_reason = 'previous_step_not_sent', finished_at = ${t}::timestamptz, updated_at = ${t}::timestamptz
      WHERE s.id = ${id}::bigint AND s.status IN ('queued', 'failed') AND s.kind IN ('welcome_2', 'welcome_3')
        AND EXISTS (
          SELECT 1 FROM newsletter_email_sends p
          WHERE p.subscription_id = s.subscription_id
            AND p.kind = CASE s.kind WHEN 'welcome_2' THEN 'welcome_1' ELSE 'welcome_2' END
            AND (p.status IN ('rejected', 'suppressed', 'skipped_stale', 'cancelled')
              OR (p.status = 'failed' AND p.attempt_count >= ${SIGNUP_LIMITS.maxAttempts}))
        )
      RETURNING s.id
    `,
    sql`
      UPDATE newsletter_email_sends s
      SET status = 'attempting', attempt_count = s.attempt_count + 1, claim_token = ${input.claimToken},
          claimed_at = ${t}::timestamptz, template_version = ${input.templateVersion}, updated_at = ${t}::timestamptz
      WHERE s.id = ${id}::bigint
        AND s.status IN ('queued', 'failed')
        AND s.attempt_count < ${SIGNUP_LIMITS.maxAttempts}
        AND s.due_at <= ${t}::timestamptz
        AND NOT EXISTS (SELECT 1 FROM marketing_suppressions WHERE email = s.email)
        AND NOT EXISTS (SELECT 1 FROM customer_marketing_preferences WHERE email = s.email AND unsubscribed_at IS NOT NULL)
        AND NOT EXISTS (SELECT 1 FROM newsletter_subscriptions WHERE email = s.email AND unsubscribed_at IS NOT NULL)
        AND (s.kind <> 'confirmation' OR EXISTS (
          SELECT 1 FROM newsletter_consent_requests r
          WHERE r.id = s.request_id AND r.confirmed_at IS NULL AND r.invalidated_at IS NULL AND r.expires_at > ${t}::timestamptz
        ))
        AND (s.kind = 'confirmation' OR EXISTS (
          SELECT 1 FROM newsletter_subscriptions sub
          WHERE sub.id = s.subscription_id AND sub.status IN ('confirmed', 'subscribed') AND sub.unsubscribed_at IS NULL
        ))
        AND (s.kind NOT IN ('welcome_2', 'welcome_3') OR EXISTS (
          SELECT 1 FROM newsletter_email_sends p
          WHERE p.subscription_id = s.subscription_id
            AND p.kind = CASE s.kind WHEN 'welcome_2' THEN 'welcome_1' ELSE 'welcome_2' END
            AND p.status IN ('accepted', 'simulated')
            AND COALESCE(p.accepted_at, p.simulated_at) <= ${t}::timestamptz - interval '24 hours'
        ))
        AND (s.kind = 'confirmation' OR NOT EXISTS (
          SELECT 1 FROM newsletter_email_sends o
          WHERE o.subscription_id = s.subscription_id AND o.id <> s.id
            AND (o.status = 'attempting' OR COALESCE(o.accepted_at, o.simulated_at) > ${t}::timestamptz - interval '24 hours')
        ))
        AND (s.kind NOT IN ('welcome_2', 'welcome_3') OR NOT EXISTS (
          SELECT 1 FROM retention_email_sends rs
          WHERE rs.email = s.email AND rs.status = 'sent' AND rs.sent_at > ${t}::timestamptz - interval '24 hours'
        ))
      RETURNING s.attempt_count
    `,
    sql`SELECT status, attempt_count, due_at FROM newsletter_email_sends WHERE id = ${id}::bigint`,
  ]);
  if (claimed.length === 1) return { claimed: true, attempt: Number(claimed[0].attempt_count) };
  const status = String(current[0]?.status ?? "missing");
  const reason = suppressed.length ? "suppressed" : stale.length ? "stale" : orphaned.length ? "previous_step_not_sent" : status === "queued" || status === "failed" ? "not_eligible_yet" : `status_${status}`;
  return { claimed: false, status, reason };
}

export async function recordSendOutcome(input: {
  id: string;
  claimToken: string;
  status: "accepted" | "simulated" | "failed" | "rejected" | "unknown";
  messageId: string;
  providerQueueId: string | null;
  providerResponse: string | null;
  errorCategory: string | null;
  at: Date;
}): Promise<boolean> {
  const sql = getSql();
  const t = iso(input.at);
  const rows = (await sql`
    UPDATE newsletter_email_sends
    SET status = ${input.status},
        accepted_at = CASE WHEN ${input.status} = 'accepted' THEN ${t}::timestamptz ELSE accepted_at END,
        simulated_at = CASE WHEN ${input.status} = 'simulated' THEN ${t}::timestamptz ELSE simulated_at END,
        finished_at = CASE WHEN ${input.status} = 'failed' THEN NULL ELSE ${t}::timestamptz END,
        message_id = ${input.messageId},
        provider_queue_id = ${input.providerQueueId},
        provider_response = ${input.providerResponse},
        error_category = ${input.errorCategory},
        claim_token = NULL,
        updated_at = ${t}::timestamptz
    WHERE id = ${input.id}::bigint AND claim_token = ${input.claimToken} AND status = 'attempting'
    RETURNING id
  `) as Row[];
  return rows.length === 1;
}

/** A crash between claim and outcome leaves the result unknowable: never resend it. */
export async function markInterruptedAttemptsUnknown(now: Date, olderThanMinutes = 30): Promise<number> {
  const sql = getSql();
  const t = iso(now);
  const rows = (await sql`
    UPDATE newsletter_email_sends
    SET status = 'unknown', error_category = 'interrupted', claim_token = NULL, finished_at = ${t}::timestamptz, updated_at = ${t}::timestamptz
    WHERE status = 'attempting' AND claimed_at < ${t}::timestamptz - make_interval(mins => ${olderThanMinutes}::int)
    RETURNING id
  `) as Row[];
  return rows.length;
}

export async function listDueWelcomeSends(
  now: Date,
  limit: number,
  filter: { kinds: NewsletterSendKind[]; testOnly: boolean }
): Promise<Array<{ id: string; kind: NewsletterSendKind; isTest: boolean }>> {
  const sql = getSql();
  const rows = (await sql`
    SELECT id::text AS id, kind, is_test FROM newsletter_email_sends
    WHERE kind = ANY(${filter.kinds}::text[]) AND kind <> 'confirmation'
      AND (${filter.testOnly}::boolean = false OR is_test = true)
      AND status IN ('queued', 'failed')
      AND attempt_count < ${SIGNUP_LIMITS.maxAttempts} AND due_at <= ${iso(now)}::timestamptz
    ORDER BY due_at ASC, id ASC
    LIMIT ${limit}
  `) as Row[];
  return rows.map((r) => ({ id: String(r.id), kind: r.kind as NewsletterSendKind, isTest: Boolean(r.is_test) }));
}

export async function pruneRateLimits(now: Date): Promise<number> {
  const sql = getSql();
  const rows = (await sql`
    DELETE FROM newsletter_rate_limits WHERE window_start < ${iso(now)}::timestamptz - interval '2 days' RETURNING bucket
  `) as Row[];
  return rows.length;
}

export async function startWelcomeRun(now: Date): Promise<string> {
  const sql = getSql();
  const rows = (await sql`
    INSERT INTO newsletter_welcome_runs (started_at) VALUES (${iso(now)}::timestamptz) RETURNING id::text AS id
  `) as Row[];
  return String(rows[0].id);
}

export async function finishWelcomeRun(id: string, input: { ok: boolean; summary: Record<string, unknown>; error: string | null; at: Date }): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE newsletter_welcome_runs
    SET finished_at = ${iso(input.at)}::timestamptz, ok = ${input.ok}, summary = ${JSON.stringify(input.summary)}::jsonb, error_summary = ${input.error}
    WHERE id = ${id}::bigint
  `;
}
