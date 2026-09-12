/**
 * Centralized SEO opportunity volume/position thresholds.
 * Override via env for testing; defaults are conservative Day-0 safeguards.
 */

function envNum(key: string, fallback: number): number {
  const raw = process.env[key]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function getAuthorityThresholds() {
  return {
    minImpressionsForOpportunity: envNum(
      "AUTHORITY_MIN_IMPRESSIONS_FOR_OPPORTUNITY",
      40
    ),
    minClicksForCtrOpportunity: envNum(
      "AUTHORITY_MIN_CLICKS_FOR_CTR_OPPORTUNITY",
      5
    ),
    nearPageOnePositionMin: envNum("AUTHORITY_NEAR_PAGE_ONE_POS_MIN", 8),
    nearPageOnePositionMax: envNum("AUTHORITY_NEAR_PAGE_ONE_POS_MAX", 30),
    risingImpressionsDeltaMin: envNum(
      "AUTHORITY_RISING_IMPRESSIONS_DELTA_MIN",
      30
    ),
    risingImpressionsPctMin: envNum("AUTHORITY_RISING_IMPRESSIONS_PCT_MIN", 40),
    decayImpressionsDeltaMin: envNum("AUTHORITY_DECAY_IMPRESSIONS_DELTA_MIN", 40),
    decayImpressionsPctMin: envNum("AUTHORITY_DECAY_IMPRESSIONS_PCT_MIN", 35),
    contentGapDistinctQueriesMin: envNum(
      "AUTHORITY_CONTENT_GAP_QUERIES_MIN",
      3
    ),
    contentGapMinImpressionsEach: envNum(
      "AUTHORITY_CONTENT_GAP_MIN_IMPRESSIONS_EACH",
      15
    ),
  };
}
