import { getSql } from "@/lib/db/sql";

import { ensureRetentionSchema, RETENTION_CAMPAIGN_30D } from "./schema";
import { getRetentionDelayDays } from "./config";

export type MarketingPreference = {
  email: string;
  marketingEligible: boolean;
  source: string | null;
  consentedAt: string | null;
  unsubscribedAt: string | null;
};

export type RetentionSendRow = {
  id: number;
  campaign: string;
  orderId: string;
  email: string;
  status: string;
  claimedAt: string | null;
  sentAt: string | null;
  lastError: string | null;
};

function normEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function getMarketingPreference(
  email: string
): Promise<MarketingPreference | null> {
  await ensureRetentionSchema();
  const sql = getSql();
  const e = normEmail(email);
  const rows = (await sql`
    SELECT * FROM customer_marketing_preferences WHERE email = ${e} LIMIT 1
  `) as Record<string, unknown>[];
  if (!rows[0]) return null;
  const row = rows[0];
  return {
    email: String(row.email),
    marketingEligible: Boolean(row.marketing_eligible),
    source: row.source ? String(row.source) : null,
    consentedAt: row.consented_at
      ? new Date(String(row.consented_at)).toISOString()
      : null,
    unsubscribedAt: row.unsubscribed_at
      ? new Date(String(row.unsubscribed_at)).toISOString()
      : null,
  };
}

/**
 * Explicit admin/API action only — never inferred from checkout.
 * Does NOT clear an unsubscribe or remove unsubscribe suppression.
 * Re-consent would require a distinct future action.
 */
export async function setMarketingEligible(input: {
  email: string;
  eligible: boolean;
  source: string;
}): Promise<MarketingPreference & { blockedByUnsubscribe?: boolean }> {
  await ensureRetentionSchema();
  const sql = getSql();
  const email = normEmail(input.email);

  const existing = await getMarketingPreference(email);
  const unsubSuppressed = await hasUnsubscribeSuppression(email);

  if (input.eligible && (existing?.unsubscribedAt || unsubSuppressed)) {
    return {
      email,
      marketingEligible: false,
      source: existing?.source ?? "unsubscribe",
      consentedAt: existing?.consentedAt ?? null,
      unsubscribedAt: existing?.unsubscribedAt ?? null,
      blockedByUnsubscribe: true,
    };
  }

  const rows = (await sql`
    INSERT INTO customer_marketing_preferences (
      email, marketing_eligible, source, consented_at, unsubscribed_at, updated_at
    ) VALUES (
      ${email},
      ${input.eligible},
      ${input.source},
      ${input.eligible ? new Date().toISOString() : null}::timestamptz,
      NULL,
      now()
    )
    ON CONFLICT (email) DO UPDATE SET
      marketing_eligible = EXCLUDED.marketing_eligible,
      source = EXCLUDED.source,
      consented_at = CASE
        WHEN EXCLUDED.marketing_eligible THEN COALESCE(
          customer_marketing_preferences.consented_at,
          now()
        )
        ELSE customer_marketing_preferences.consented_at
      END,
      -- Never erase an existing unsubscribe timestamp via eligibility toggle.
      unsubscribed_at = customer_marketing_preferences.unsubscribed_at,
      updated_at = now()
    WHERE customer_marketing_preferences.unsubscribed_at IS NULL
    RETURNING *
  `) as Record<string, unknown>[];

  if (!rows[0]) {
    const again = await getMarketingPreference(email);
    return {
      email,
      marketingEligible: again?.marketingEligible ?? false,
      source: again?.source ?? null,
      consentedAt: again?.consentedAt ?? null,
      unsubscribedAt: again?.unsubscribedAt ?? null,
      blockedByUnsubscribe: Boolean(again?.unsubscribedAt),
    };
  }

  const row = rows[0];
  return {
    email: String(row.email),
    marketingEligible: Boolean(row.marketing_eligible),
    source: row.source ? String(row.source) : null,
    consentedAt: row.consented_at
      ? new Date(String(row.consented_at)).toISOString()
      : null,
    unsubscribedAt: row.unsubscribed_at
      ? new Date(String(row.unsubscribed_at)).toISOString()
      : null,
  };
}

export async function hasUnsubscribeSuppression(email: string): Promise<boolean> {
  await ensureRetentionSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT 1 FROM marketing_suppressions
    WHERE email = ${normEmail(email)}
      AND reason = 'unsubscribed'
    LIMIT 1
  `) as Array<Record<string, unknown>>;
  return rows.length > 0;
}

export async function markMarketingUnsubscribed(email: string): Promise<void> {
  await ensureRetentionSchema();
  const sql = getSql();
  const e = normEmail(email);
  await sql`
    INSERT INTO customer_marketing_preferences (
      email, marketing_eligible, source, unsubscribed_at, updated_at
    ) VALUES (${e}, false, 'unsubscribe', now(), now())
    ON CONFLICT (email) DO UPDATE SET
      marketing_eligible = false,
      unsubscribed_at = COALESCE(
        customer_marketing_preferences.unsubscribed_at,
        now()
      ),
      updated_at = now()
  `;
  await addMarketingSuppression({
    email: e,
    reason: "unsubscribed",
    source: "unsubscribe",
  });
}

export async function addMarketingSuppression(input: {
  email: string;
  reason: string;
  source?: string;
}): Promise<void> {
  await ensureRetentionSchema();
  const sql = getSql();
  await sql`
    INSERT INTO marketing_suppressions (email, reason, source)
    VALUES (${normEmail(input.email)}, ${input.reason}, ${input.source ?? null})
    ON CONFLICT (email, reason) DO NOTHING
  `;
}

export async function isMarketingSuppressed(email: string): Promise<boolean> {
  await ensureRetentionSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT 1 FROM marketing_suppressions
    WHERE email = ${normEmail(email)}
    LIMIT 1
  `) as Array<{ "?column?": number }>;
  return rows.length > 0;
}

export type RetentionCandidate = {
  orderId: string;
  email: string;
  paidAt: string;
};

/**
 * Eligible paid orders due for 30d retention.
 * Requires explicit marketing_eligible; excludes suppressions, QA finance rows, already-sent.
 */
export async function listRetentionCandidates(
  limit = 50
): Promise<RetentionCandidate[]> {
  await ensureRetentionSchema();
  const sql = getSql();
  const days = getRetentionDelayDays();
  const rows = (await sql`
    SELECT o.order_id, o.email, o.paid_at
    FROM orders o
    JOIN customer_marketing_preferences p
      ON lower(p.email) = lower(o.email)
    WHERE o.status IN ('paid', 'shipped')
      AND o.paid_at IS NOT NULL
      AND o.paid_at <= now() - (${days}::int * interval '1 day')
      AND p.marketing_eligible = true
      AND p.unsubscribed_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM marketing_suppressions s
        WHERE lower(s.email) = lower(o.email)
      )
      AND NOT EXISTS (
        SELECT 1 FROM finance_transactions ft
        WHERE ft.psl_order_id = o.order_id
          AND ft.reporting_excluded = true
      )
      AND NOT EXISTS (
        SELECT 1 FROM retention_email_sends r
        WHERE r.campaign = ${RETENTION_CAMPAIGN_30D}
          AND r.order_id = o.order_id
          AND r.sent_at IS NOT NULL
      )
    ORDER BY o.paid_at ASC
    LIMIT ${limit}
  `) as Array<{ order_id: string; email: string; paid_at: string }>;

  return rows.map((r) => ({
    orderId: r.order_id,
    email: r.email,
    paidAt: new Date(r.paid_at).toISOString(),
  }));
}

/** Claim or reuse a pending/failed send row — never claim a confirmed send. */
export async function claimRetentionSend(input: {
  orderId: string;
  email: string;
  campaign?: string;
}): Promise<{ id: number; claimed: boolean } | null> {
  await ensureRetentionSchema();
  const sql = getSql();
  const campaign = input.campaign ?? RETENTION_CAMPAIGN_30D;
  const email = normEmail(input.email);

  await sql`
    INSERT INTO retention_email_sends (campaign, order_id, email, status)
    VALUES (${campaign}, ${input.orderId}, ${email}, 'pending')
    ON CONFLICT (campaign, order_id) DO NOTHING
  `;

  const rows = (await sql`
    UPDATE retention_email_sends
    SET
      claimed_at = now(),
      status = 'sending',
      last_error = NULL,
      updated_at = now()
    WHERE campaign = ${campaign}
      AND order_id = ${input.orderId}
      AND sent_at IS NULL
      AND (
        claimed_at IS NULL
        OR claimed_at < now() - interval '15 minutes'
        OR status IN ('pending', 'failed')
      )
    RETURNING id
  `) as Array<{ id: number }>;

  if (!rows[0]) {
    const existing = (await sql`
      SELECT id, sent_at FROM retention_email_sends
      WHERE campaign = ${campaign} AND order_id = ${input.orderId}
      LIMIT 1
    `) as Array<{ id: number; sent_at: string | null }>;
    if (existing[0]?.sent_at) return null;
    return existing[0] ? { id: Number(existing[0].id), claimed: false } : null;
  }
  return { id: Number(rows[0].id), claimed: true };
}

export async function markRetentionSendSent(id: number): Promise<boolean> {
  await ensureRetentionSchema();
  const sql = getSql();
  const rows = (await sql`
    UPDATE retention_email_sends
    SET
      sent_at = now(),
      status = 'sent',
      claimed_at = NULL,
      last_error = NULL,
      updated_at = now()
    WHERE id = ${id}
      AND sent_at IS NULL
    RETURNING id
  `) as Array<{ id: number }>;
  return rows.length > 0;
}

export async function markRetentionSendFailed(
  id: number,
  error: string
): Promise<void> {
  await ensureRetentionSchema();
  const sql = getSql();
  await sql`
    UPDATE retention_email_sends
    SET
      status = 'failed',
      claimed_at = NULL,
      last_error = ${error.slice(0, 500)},
      updated_at = now()
    WHERE id = ${id}
      AND sent_at IS NULL
  `;
}

export async function countRetentionStats(): Promise<{
  eligibleContacts: number;
  sendsDue: number;
  sent: number;
  suppressed: number;
  failed: number;
}> {
  await ensureRetentionSchema();
  const sql = getSql();
  const [eligible, sent, suppressed, failed] = await Promise.all([
    sql`SELECT COUNT(*)::int AS n FROM customer_marketing_preferences
        WHERE marketing_eligible = true AND unsubscribed_at IS NULL` as Promise<
      Array<Record<string, unknown>>
    >,
    sql`SELECT COUNT(*)::int AS n FROM retention_email_sends WHERE sent_at IS NOT NULL` as Promise<
      Array<Record<string, unknown>>
    >,
    sql`SELECT COUNT(DISTINCT email)::int AS n FROM marketing_suppressions` as Promise<
      Array<Record<string, unknown>>
    >,
    sql`SELECT COUNT(*)::int AS n FROM retention_email_sends WHERE status = 'failed'` as Promise<
      Array<Record<string, unknown>>
    >,
  ]);
  const due = await listRetentionCandidates(500);
  return {
    eligibleContacts: Number(eligible[0]?.n ?? 0),
    sendsDue: due.length,
    sent: Number(sent[0]?.n ?? 0),
    suppressed: Number(suppressed[0]?.n ?? 0),
    failed: Number(failed[0]?.n ?? 0),
  };
}

export async function getLatestRetentionJobRun(): Promise<{
  finishedAt: string | null;
  ok: boolean | null;
  sent: number;
  failed: number;
  errorSummary: string | null;
} | null> {
  await ensureRetentionSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT * FROM retention_job_runs ORDER BY id DESC LIMIT 1
  `) as Record<string, unknown>[];
  if (!rows[0]) return null;
  const row = rows[0];
  return {
    finishedAt: row.finished_at
      ? new Date(String(row.finished_at)).toISOString()
      : null,
    ok: row.ok === null || row.ok === undefined ? null : Boolean(row.ok),
    sent: Number(row.sent ?? 0),
    failed: Number(row.failed ?? 0),
    errorSummary: row.error_summary ? String(row.error_summary) : null,
  };
}

export async function recordRetentionJobRun(summary: {
  ok: boolean;
  candidates: number;
  sent: number;
  skipped: number;
  failed: number;
  errorSummary?: string;
}): Promise<void> {
  await ensureRetentionSchema();
  const sql = getSql();
  await sql`
    INSERT INTO retention_job_runs (
      finished_at, ok, candidates, sent, skipped, failed, error_summary
    ) VALUES (
      now(),
      ${summary.ok},
      ${summary.candidates},
      ${summary.sent},
      ${summary.skipped},
      ${summary.failed},
      ${summary.errorSummary ?? null}
    )
  `;
}

/** Pure eligibility predicate for tests. */
export function isRetentionEligibleContact(input: {
  marketingEligible: boolean;
  unsubscribedAt: string | null;
  suppressed: boolean;
  reportingExcluded: boolean;
  alreadySent: boolean;
}): boolean {
  if (!input.marketingEligible) return false;
  if (input.unsubscribedAt) return false;
  if (input.suppressed) return false;
  if (input.reportingExcluded) return false;
  if (input.alreadySent) return false;
  return true;
}
