import { getSql } from "@/lib/db/sql";

import { ensureAuthoritySchema } from "./schema";
import type { DetectedOpportunity } from "./detect";
import type { ContentBriefJson } from "./briefs";

export type AuthorityOpportunityRow = {
  id: number;
  type: string;
  status: string;
  primaryQuery: string;
  page: string;
  evidenceJson: Record<string, unknown>;
  priorityScore: number;
  intent: string;
  riskLevel: string;
  detectedAt: string;
  lastSeenAt: string;
  approvedAt: string | null;
  dismissedAt: string | null;
  opportunityKey: string;
};

export type ContentBriefRow = {
  id: number;
  opportunityId: number;
  title: string;
  slugOrTargetPage: string;
  briefJson: ContentBriefJson;
  riskLevel: string;
  claimsReviewRequired: boolean;
  generatedAt: string;
  approvedAt: string | null;
};

export async function upsertAuthorityOpportunities(
  detected: DetectedOpportunity[]
): Promise<{ inserted: number; refreshed: number }> {
  await ensureAuthoritySchema();
  const sql = getSql();
  let inserted = 0;
  let refreshed = 0;

  for (const d of detected) {
    const existing = (await sql`
      SELECT id, status FROM authority_opportunities
      WHERE opportunity_key = ${d.opportunityKey}
      LIMIT 1
    `) as Array<{ id: number; status: string }>;

    const evidence = {
      ...d.evidence,
      existingPagePath: d.existingPagePath,
      recommendAction: d.recommendAction,
    };

    if (existing.length > 0) {
      await sql`
        UPDATE authority_opportunities
        SET
          evidence_json = ${JSON.stringify(evidence)}::jsonb,
          priority_score = ${d.priorityScore},
          intent = ${d.intent},
          risk_level = ${d.riskLevel},
          primary_query = ${d.primaryQuery},
          page = ${d.page},
          last_seen_at = now(),
          updated_at = now()
        WHERE id = ${existing[0].id}
      `;
      refreshed += 1;
      continue;
    }

    await sql`
      INSERT INTO authority_opportunities (
        type, status, primary_query, page, evidence_json,
        priority_score, intent, risk_level, opportunity_key
      ) VALUES (
        ${d.type},
        'suggested',
        ${d.primaryQuery},
        ${d.page},
        ${JSON.stringify(evidence)}::jsonb,
        ${d.priorityScore},
        ${d.intent},
        ${d.riskLevel},
        ${d.opportunityKey}
      )
      ON CONFLICT (opportunity_key) DO NOTHING
    `;
    inserted += 1;
  }

  return { inserted, refreshed };
}

export async function listAuthorityOpportunities(options?: {
  statuses?: string[];
  limit?: number;
}): Promise<AuthorityOpportunityRow[]> {
  await ensureAuthoritySchema();
  const sql = getSql();
  const limit = Math.min(Math.max(options?.limit ?? 100, 1), 300);
  const statuses = options?.statuses;
  const rows = statuses?.length
    ? ((await sql`
        SELECT *
        FROM authority_opportunities
        WHERE status = ANY(${statuses})
        ORDER BY priority_score DESC, last_seen_at DESC
        LIMIT ${limit}
      `) as Array<Record<string, unknown>>)
    : ((await sql`
        SELECT *
        FROM authority_opportunities
        ORDER BY priority_score DESC, last_seen_at DESC
        LIMIT ${limit}
      `) as Array<Record<string, unknown>>);

  return rows.map(mapOpportunity);
}

export async function getAuthorityOpportunity(
  id: number
): Promise<AuthorityOpportunityRow | null> {
  await ensureAuthoritySchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT * FROM authority_opportunities WHERE id = ${id} LIMIT 1
  `) as Array<Record<string, unknown>>;
  return rows[0] ? mapOpportunity(rows[0]) : null;
}

export async function updateOpportunityStatus(input: {
  id: number;
  status:
    | "suggested"
    | "approved"
    | "in_progress"
    | "drafted"
    | "published"
    | "dismissed";
}): Promise<AuthorityOpportunityRow | null> {
  await ensureAuthoritySchema();
  const sql = getSql();
  // Publishing is a recording action only — never deploys content.
  const approvedAt =
    input.status === "approved" ? sql`now()` : sql`approved_at`;
  const dismissedAt =
    input.status === "dismissed" ? sql`now()` : sql`dismissed_at`;

  await sql`
    UPDATE authority_opportunities
    SET
      status = ${input.status},
      approved_at = CASE WHEN ${input.status} = 'approved' THEN now() ELSE approved_at END,
      dismissed_at = CASE WHEN ${input.status} = 'dismissed' THEN now() ELSE dismissed_at END,
      updated_at = now()
    WHERE id = ${input.id}
  `;
  void approvedAt;
  void dismissedAt;
  return getAuthorityOpportunity(input.id);
}

export async function insertContentBrief(input: {
  opportunityId: number;
  title: string;
  slugOrTargetPage: string;
  briefJson: ContentBriefJson;
  riskLevel: string;
  claimsReviewRequired: boolean;
}): Promise<ContentBriefRow> {
  await ensureAuthoritySchema();
  const sql = getSql();
  const rows = (await sql`
    INSERT INTO content_briefs (
      opportunity_id, title, slug_or_target_page, brief_json,
      risk_level, claims_review_required
    ) VALUES (
      ${input.opportunityId},
      ${input.title},
      ${input.slugOrTargetPage},
      ${JSON.stringify(input.briefJson)}::jsonb,
      ${input.riskLevel},
      ${input.claimsReviewRequired}
    )
    RETURNING *
  `) as Array<Record<string, unknown>>;
  return mapBrief(rows[0]);
}

export async function listBriefsForOpportunity(
  opportunityId: number
): Promise<ContentBriefRow[]> {
  await ensureAuthoritySchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT * FROM content_briefs
    WHERE opportunity_id = ${opportunityId}
    ORDER BY generated_at DESC
    LIMIT 20
  `) as Array<Record<string, unknown>>;
  return rows.map(mapBrief);
}

export async function getContentBrief(
  id: number
): Promise<ContentBriefRow | null> {
  await ensureAuthoritySchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT * FROM content_briefs WHERE id = ${id} LIMIT 1
  `) as Array<Record<string, unknown>>;
  return rows[0] ? mapBrief(rows[0]) : null;
}

export async function countApprovedBriefsWaitingDays(
  minDays: number
): Promise<number> {
  await ensureAuthoritySchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT COUNT(*)::int AS n
    FROM authority_opportunities
    WHERE status IN ('approved', 'in_progress')
      AND approved_at IS NOT NULL
      AND approved_at < now() - (${minDays} || ' days')::interval
  `) as Array<{ n: number }>;
  return Number(rows[0]?.n ?? 0);
}

function mapOpportunity(r: Record<string, unknown>): AuthorityOpportunityRow {
  return {
    id: Number(r.id),
    type: String(r.type),
    status: String(r.status),
    primaryQuery: String(r.primary_query ?? ""),
    page: String(r.page ?? ""),
    evidenceJson: (r.evidence_json ?? {}) as Record<string, unknown>,
    priorityScore: Number(r.priority_score ?? 0),
    intent: String(r.intent ?? ""),
    riskLevel: String(r.risk_level ?? "LOW"),
    detectedAt: String(r.detected_at ?? ""),
    lastSeenAt: String(r.last_seen_at ?? ""),
    approvedAt: r.approved_at ? String(r.approved_at) : null,
    dismissedAt: r.dismissed_at ? String(r.dismissed_at) : null,
    opportunityKey: String(r.opportunity_key ?? ""),
  };
}

function mapBrief(r: Record<string, unknown>): ContentBriefRow {
  return {
    id: Number(r.id),
    opportunityId: Number(r.opportunity_id),
    title: String(r.title ?? ""),
    slugOrTargetPage: String(r.slug_or_target_page ?? ""),
    briefJson: (r.brief_json ?? {}) as ContentBriefJson,
    riskLevel: String(r.risk_level ?? "LOW"),
    claimsReviewRequired: Boolean(r.claims_review_required),
    generatedAt: String(r.generated_at ?? ""),
    approvedAt: r.approved_at ? String(r.approved_at) : null,
  };
}
