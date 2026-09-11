import { getSql } from "@/lib/db/sql";

import { ensureCeoBriefSchema } from "./schema";
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
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
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
 * Upsert brief for a period. Regenerating updates JSON but does not clear
 * email_sent_at (prevents duplicate weekly emails unless forceEmail later).
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

export async function markCeoBriefEmailSent(id: number): Promise<void> {
  await ensureCeoBriefSchema();
  const sql = getSql();
  await sql`
    UPDATE ceo_weekly_briefs
    SET email_sent_at = now()
    WHERE id = ${id}
      AND email_sent_at IS NULL
  `;
}

/** Atomic claim: only one sender wins for a period. */
export async function claimCeoBriefEmailSend(
  id: number
): Promise<boolean> {
  await ensureCeoBriefSchema();
  const sql = getSql();
  const rows = (await sql`
    UPDATE ceo_weekly_briefs
    SET email_sent_at = now()
    WHERE id = ${id}
      AND email_sent_at IS NULL
    RETURNING id
  `) as Array<{ id: number }>;
  return rows.length > 0;
}
