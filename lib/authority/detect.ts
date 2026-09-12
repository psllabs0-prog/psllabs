import {
  classifyIntent,
  classifyRisk,
  looksLikeGenericCompoundPage,
  shouldSuppressAsNormalPublishable,
  type AuthorityIntent,
  type AuthorityRiskLevel,
} from "./guardrails";
import { findMatchingKnownPage } from "./pages";
import { getAuthorityThresholds } from "./thresholds";

export type AuthorityOpportunityType =
  | "NEAR_PAGE_ONE"
  | "RISING_VISIBILITY"
  | "CTR_OPPORTUNITY"
  | "CONTENT_GAP_SIGNAL"
  | "INTERNAL_LINK_OPPORTUNITY"
  | "DECAY_REVIEW";

export type DetectedOpportunity = {
  type: AuthorityOpportunityType;
  opportunityKey: string;
  primaryQuery: string;
  page: string;
  intent: AuthorityIntent;
  riskLevel: AuthorityRiskLevel;
  priorityScore: number;
  evidence: Record<string, unknown>;
  /** If true, do not auto-prioritize as a create-new-page opportunity. */
  existingPagePath: string | null;
  recommendAction: "optimize_existing" | "consider_new" | "internal_link" | "suppress";
};

export type QueryPeriodStats = {
  query: string;
  page: string;
  isBrand: boolean;
  impressions: number;
  clicks: number;
  ctr: number;
  position: number;
  priorImpressions?: number;
  priorClicks?: number;
};

function opportunityKey(
  type: AuthorityOpportunityType,
  query: string,
  page: string
): string {
  return `${type}|${query.trim().toLowerCase()}|${page.trim().toLowerCase()}`;
}

function priorityScore(input: {
  type: AuthorityOpportunityType;
  impressions: number;
  intent: AuthorityIntent;
  risk: AuthorityRiskLevel;
  existingPage: boolean;
  query?: string;
}): number {
  let score = Math.min(100, input.impressions / 2);
  if (input.intent === "verification_trust") score += 20;
  if (input.intent === "analytical_educational") score += 18;
  if (input.intent === "commercial_support") score += 8;
  if (input.existingPage) score += 10;
  if (input.type === "NEAR_PAGE_ONE") score += 12;
  if (input.type === "CONTENT_GAP_SIGNAL") score += 5;
  if (input.risk === "CLAIMS_REVIEW") score -= 15;
  if (input.risk === "COUNSEL_REVIEW") score -= 40;
  if (input.query && looksLikeGenericCompoundPage(input.query)) score -= 25;
  return Math.round(score * 100) / 100;
}

/**
 * Pure detector — no DB writes. Safe for unit tests with synthetic rows.
 * Does not invent opportunities from trivial 1→2 impression noise.
 */
export function detectAuthorityOpportunities(
  rows: QueryPeriodStats[]
): DetectedOpportunity[] {
  const t = getAuthorityThresholds();
  const out: DetectedOpportunity[] = [];

  for (const row of rows) {
    if (row.isBrand) continue;
    if (row.impressions < t.minImpressionsForOpportunity) continue;

    const intent = classifyIntent(row.query, row.page);
    const risk = classifyRisk(row.query, row.page);
    const known = findMatchingKnownPage(row.query, row.page);
    const suppressPublish = shouldSuppressAsNormalPublishable(row.query);

    if (
      row.position >= t.nearPageOnePositionMin &&
      row.position <= t.nearPageOnePositionMax
    ) {
      out.push({
        type: "NEAR_PAGE_ONE",
        opportunityKey: opportunityKey("NEAR_PAGE_ONE", row.query, row.page),
        primaryQuery: row.query,
        page: row.page,
        intent,
        riskLevel: risk,
        priorityScore: priorityScore({
          query: row.query,
          type: "NEAR_PAGE_ONE",
          impressions: row.impressions,
          intent,
          risk,
          existingPage: Boolean(known),
        }),
        evidence: {
          impressions: row.impressions,
          clicks: row.clicks,
          position: row.position,
          ctr: row.ctr,
          window: "current",
        },
        existingPagePath: known?.path ?? null,
        recommendAction: suppressPublish
          ? "suppress"
          : known
            ? "optimize_existing"
            : "consider_new",
      });
    }

    const priorImp = row.priorImpressions ?? 0;
    if (
      priorImp >= t.minImpressionsForOpportunity / 2 &&
      row.impressions - priorImp >= t.risingImpressionsDeltaMin
    ) {
      const pct =
        priorImp > 0
          ? ((row.impressions - priorImp) / priorImp) * 100
          : 100;
      if (pct >= t.risingImpressionsPctMin) {
        out.push({
          type: "RISING_VISIBILITY",
          opportunityKey: opportunityKey(
            "RISING_VISIBILITY",
            row.query,
            row.page
          ),
          primaryQuery: row.query,
          page: row.page,
          intent,
          riskLevel: risk,
          priorityScore: priorityScore({
            query: row.query,
            type: "RISING_VISIBILITY",
            impressions: row.impressions,
            intent,
            risk,
            existingPage: Boolean(known),
          }),
          evidence: {
            impressions: row.impressions,
            priorImpressions: priorImp,
            clicks: row.clicks,
            priorClicks: row.priorClicks ?? 0,
            pctChange: pct,
          },
          existingPagePath: known?.path ?? null,
          recommendAction: suppressPublish
            ? "suppress"
            : known
              ? "optimize_existing"
              : "consider_new",
        });
      }
    }

    if (
      priorImp >= t.minImpressionsForOpportunity / 2 &&
      priorImp - row.impressions >= t.decayImpressionsDeltaMin
    ) {
      const pct =
        priorImp > 0
          ? ((priorImp - row.impressions) / priorImp) * 100
          : 0;
      if (pct >= t.decayImpressionsPctMin) {
        out.push({
          type: "DECAY_REVIEW",
          opportunityKey: opportunityKey("DECAY_REVIEW", row.query, row.page),
          primaryQuery: row.query,
          page: row.page,
          intent,
          riskLevel: risk,
          priorityScore: priorityScore({
            query: row.query,
            type: "DECAY_REVIEW",
            impressions: priorImp,
            intent,
            risk,
            existingPage: Boolean(known),
          }),
          evidence: {
            impressions: row.impressions,
            priorImpressions: priorImp,
            pctDecline: pct,
          },
          existingPagePath: known?.path ?? null,
          recommendAction: known ? "optimize_existing" : "consider_new",
        });
      }
    }

    if (
      row.impressions >= t.minImpressionsForOpportunity &&
      row.clicks >= t.minClicksForCtrOpportunity &&
      row.position > 0 &&
      row.position <= 20
    ) {
      const expectedFloor = Math.max(0.01, 0.08 - (row.position - 1) * 0.003);
      if (row.ctr < expectedFloor * 0.6) {
        out.push({
          type: "CTR_OPPORTUNITY",
          opportunityKey: opportunityKey("CTR_OPPORTUNITY", row.query, row.page),
          primaryQuery: row.query,
          page: row.page,
          intent,
          riskLevel: risk,
          priorityScore: priorityScore({
            query: row.query,
            type: "CTR_OPPORTUNITY",
            impressions: row.impressions,
            intent,
            risk,
            existingPage: Boolean(known),
          }),
          evidence: {
            impressions: row.impressions,
            clicks: row.clicks,
            ctr: row.ctr,
            position: row.position,
            note: "CTR below conservative expected floor for position — title/meta review only",
          },
          existingPagePath: known?.path ?? null,
          recommendAction: known ? "optimize_existing" : "consider_new",
        });
      }
    }
  }

  // Content gap: multiple relevant queries without a strong matching page
  const unmatched = rows.filter((r) => {
    if (r.isBrand) return false;
    if (r.impressions < getAuthorityThresholds().contentGapMinImpressionsEach)
      return false;
    if (shouldSuppressAsNormalPublishable(r.query)) return false;
    if (looksLikeGenericCompoundPage(r.query)) return false;
    return !findMatchingKnownPage(r.query, r.page);
  });
  if (unmatched.length >= t.contentGapDistinctQueriesMin) {
    const sample = unmatched.slice(0, 8);
    const primary = sample[0];
    const intent = classifyIntent(primary.query, primary.page);
    const risk = classifyRisk(primary.query, primary.page);
    out.push({
      type: "CONTENT_GAP_SIGNAL",
      opportunityKey: opportunityKey(
        "CONTENT_GAP_SIGNAL",
        "cluster",
        sample.map((s) => s.query).sort().join("|").slice(0, 180)
      ),
      primaryQuery: sample.map((s) => s.query).join("; ").slice(0, 240),
      page: "",
      intent,
      riskLevel: risk,
      priorityScore: priorityScore({
        query: primary.query,
        type: "CONTENT_GAP_SIGNAL",
        impressions: sample.reduce((s, r) => s + r.impressions, 0),
        intent,
        risk,
        existingPage: false,
      }),
      evidence: {
        queries: sample.map((s) => ({
          query: s.query,
          impressions: s.impressions,
          clicks: s.clicks,
        })),
        note: "Multiple queries without strong matching PSL page",
      },
      existingPagePath: null,
      recommendAction: "consider_new",
    });
  }

  // Deprioritize generic compound "what is X" as automatic priority
  return out
    .map((o) => {
      if (looksLikeGenericCompoundPage(o.primaryQuery)) {
        return {
          ...o,
          priorityScore: Math.min(o.priorityScore, 15),
          recommendAction:
            o.recommendAction === "consider_new"
              ? ("suppress" as const)
              : o.recommendAction,
        };
      }
      return o;
    })
    .filter((o) => o.recommendAction !== "suppress" || o.riskLevel !== "LOW")
    .sort((a, b) => b.priorityScore - a.priorityScore);
}
