import { getSql } from "@/lib/db/sql";

import {
  CEO_BRIEF_EMAIL_CLAIM_STALE_MINUTES,
  ensureCeoBriefSchema,
} from "./schema";
import type { CeoBriefRow, CeoLukeAction, CeoWeeklyBrief } from "./types";

function mapRow(row: Record<string, unknown>): CeoBriefRow {
  const briefJson =
    typeof row.brief_json === "string"
      ? (JSON.parse(row.brief_json) as CeoWeeklyBrief)
      : (row.brief_json as CeoWeeklyBrief);
  const actionsJson =
    typeof row.actions_json === "string"
      ? (JSON.parse(row.actions_json) as CeoLukeAction[])
      : (row.actions_json as CeoLukeAction[]);

  return {
    id: Number(row.id),
    periodStart: new Date(String(row.period_start)).toISOString(),
    periodEnd: new Date(String(row.period_end)).toISOString(),
    generatedAt: new Date(String(row.generated_at)).toISOString(),
    briefJson,
    executiveSummary: String(row.executive_summary),
    actionsJson,
    emailSentAt: row.email_sent_at
      ? new Date(String(row.email_sent_at)).toISOString()
      : null,
    emailSendClaimedAt: row.email_send_claimed_at
      ? new Date(String(row.email_send_claimed_at)).toISOString()
      : null,
    emailSendLastError: row.email_send_last_error
      ? String(row.email_send_last_error)
      : null,
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}

/** Strip secrets from SMTP / transport error strings before storage. */
export function sanitizeCeoBriefEmailError(raw: string): string {
  let msg = raw.replace(/\s+/g, " ").trim().slice(0, 400);
  msg = msg.replace(
    /(pass(word)?|smtp[_-]?pass|api[_-]?key|secret|token|bearer)\s*[:=]\s*\S+/gi,
    "$1=[redacted]"
  );
  msg = msg.replace(/\b[A-Za-z0-9+/]{24,}={0,2}\b/g, "[redacted]");
  return msg || "email send failed";
}

export async function getCeoBriefById(id: number): Promise<CeoBriefRow | null> {
  await ensureCeoBriefSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT * FROM ceo_weekly_briefs WHERE id = ${id} LIMIT 1
  `) as Record<string, unknown>[];
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function getCeoBriefForPeriod(
  periodStart: Date,
  periodEnd: Date
): Promise<CeoBriefRow | null> {
  await ensureCeoBriefSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT *
    FROM ceo_weekly_briefs
    WHERE period_start = ${periodStart.toISOString()}::timestamptz
      AND period_end = ${periodEnd.toISOString()}::timestamptz
    LIMIT 1
  `) as Record<string, unknown>[];
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function getLatestCeoBrief(): Promise<CeoBriefRow | null> {
  await ensureCeoBriefSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT * FROM ceo_weekly_briefs
    ORDER BY period_end DESC, generated_at DESC
    LIMIT 1
  `) as Record<string, unknown>[];
  return rows[0] ? mapRow(rows[0]) : null;
}

/**
 * Upsert brief for a period. Regenerating updates JSON but never clears
 * email_sent_at / claim / last_error delivery state.
 */
export async function upsertCeoWeeklyBrief(input: {
  periodStart: Date;
  periodEnd: Date;
  brief: CeoWeeklyBrief;
}): Promise<CeoBriefRow> {
  await ensureCeoBriefSchema();
  const sql = getSql();
  const executiveSummary = input.brief.executiveSummary.join("\n");
  const briefJson = JSON.stringify(input.brief);
  const actionsJson = JSON.stringify(input.brief.actions);

  const rows = (await sql`
    INSERT INTO ceo_weekly_briefs (
      period_start,
      period_end,
      generated_at,
      brief_json,
      executive_summary,
      actions_json
    ) VALUES (
      ${input.periodStart.toISOString()}::timestamptz,
      ${input.periodEnd.toISOString()}::timestamptz,
      ${input.brief.generatedAt}::timestamptz,
      ${briefJson}::jsonb,
      ${executiveSummary},
      ${actionsJson}::jsonb
    )
    ON CONFLICT (period_start, period_end) DO UPDATE SET
      generated_at = EXCLUDED.generated_at,
      brief_json = EXCLUDED.brief_json,
      executive_summary = EXCLUDED.executive_summary,
      actions_json = EXCLUDED.actions_json
    RETURNING *
  `) as Record<string, unknown>[];

  return mapRow(rows[0]);
}

/**
 * Atomic send lease. Does NOT set email_sent_at.
 * Succeeds only when unsent and claim is free or stale.
 */
export async function claimCeoBriefEmailSend(
  id: number,
  options?: { staleMinutes?: number; allowResend?: boolean }
): Promise<boolean> {
  await ensureCeoBriefSchema();
  const sql = getSql();
  const staleMinutes =
    options?.staleMinutes ?? CEO_BRIEF_EMAIL_CLAIM_STALE_MINUTES;
  const allowResend = options?.allowResend === true;

  if (allowResend) {
    const rows = (await sql`
      UPDATE ceo_weekly_briefs
      SET
        email_send_claimed_at = now(),
        email_send_last_error = NULL
      WHERE id = ${id}
        AND (
          email_send_claimed_at IS NULL
          OR email_send_claimed_at < now() - (${staleMinutes}::int * interval '1 minute')
        )
      RETURNING id
    `) as Array<{ id: number }>;
    return rows.length > 0;
  }

  const rows = (await sql`
    UPDATE ceo_weekly_briefs
    SET
      email_send_claimed_at = now(),
      email_send_last_error = NULL
    WHERE id = ${id}
      AND email_sent_at IS NULL
      AND (
        email_send_claimed_at IS NULL
        OR email_send_claimed_at < now() - (${staleMinutes}::int * interval '1 minute')
      )
    RETURNING id
  `) as Array<{ id: number }>;
  return rows.length > 0;
}

/** Confirmed successful SMTP delivery only. */
export async function markCeoBriefEmailSent(id: number): Promise<void> {
  await ensureCeoBriefSchema();
  const sql = getSql();
  await sql`
    UPDATE ceo_weekly_briefs
    SET
      email_sent_at = now(),
      email_send_claimed_at = NULL,
      email_send_last_error = NULL
    WHERE id = ${id}
  `;
}

/** Release lease after failure/skip; keep email_sent_at NULL. */
export async function releaseCeoBriefEmailClaim(
  id: number,
  errorMessage: string
): Promise<void> {
  await ensureCeoBriefSchema();
  const sql = getSql();
  const safe = sanitizeCeoBriefEmailError(errorMessage);
  await sql`
    UPDATE ceo_weekly_briefs
    SET
      email_send_claimed_at = NULL,
      email_send_last_error = ${safe}
    WHERE id = ${id}
      AND email_sent_at IS NULL
  `;
}

/** Test helper: force a live claim timestamp (including stale backdating). */
export async function setCeoBriefEmailClaimForTests(
  id: number,
  claimedAt: Date | null
): Promise<void> {
  await ensureCeoBriefSchema();
  const sql = getSql();
  if (claimedAt === null) {
    await sql`
      UPDATE ceo_weekly_briefs
      SET email_send_claimed_at = NULL
      WHERE id = ${id}
    `;
    return;
  }
  await sql`
    UPDATE ceo_weekly_briefs
    SET email_send_claimed_at = ${claimedAt.toISOString()}::timestamptz
    WHERE id = ${id}
  `;
}
