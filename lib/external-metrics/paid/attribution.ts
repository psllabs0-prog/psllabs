/**
 * Join helpers between paid_acquisition_daily and PSL order attribution.
 * Deterministic exact matching only — never substring / fuzzy campaign joins.
 */

export type PaidAttributionJoinKey = {
  platform: string;
  campaignId?: string | null;
  campaignName?: string | null;
  /** @deprecated Prefer campaignName; still accepted as campaign name alias. */
  utmCampaign?: string | null;
  adsetId?: string | null;
  adId?: string | null;
  adName?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmContent?: string | null;
};

export type OrderAttributionFields = {
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  /** Only used when actually present on the attribution record — never invented. */
  campaignId?: string | null;
  adId?: string | null;
};

export function normalizePaidPlatform(raw: string | null | undefined): string {
  const s = (raw ?? "").trim().toLowerCase();
  if (["meta", "facebook", "fb", "instagram", "ig"].includes(s)) return "meta";
  if (["tiktok", "tt"].includes(s)) return "tiktok";
  if (["google", "adwords", "youtube"].includes(s)) return "google";
  return s;
}

export function normalizeAttributionToken(
  raw: string | null | undefined
): string {
  return (raw ?? "").trim().toLowerCase();
}

function platformMatches(
  orderAttr: OrderAttributionFields,
  paid: PaidAttributionJoinKey
): boolean {
  const src = normalizePaidPlatform(orderAttr.utmSource);
  return Boolean(src && src === normalizePaidPlatform(paid.platform));
}

/**
 * Exact campaign match only.
 * A) stored campaign/ad identifiers when present on the order
 * B) utm_campaign === normalized platform campaign_name (or campaign_id exact)
 */
export function isExactCampaignMatch(
  orderAttr: OrderAttributionFields,
  paid: PaidAttributionJoinKey
): boolean {
  if (!platformMatches(orderAttr, paid)) return false;

  const paidCampId = normalizeAttributionToken(paid.campaignId);
  const paidCampName = normalizeAttributionToken(
    paid.campaignName ?? paid.utmCampaign
  );

  const orderCampId = normalizeAttributionToken(orderAttr.campaignId);
  if (orderCampId && paidCampId && orderCampId === paidCampId) return true;

  const utmCamp = normalizeAttributionToken(orderAttr.utmCampaign);
  if (!utmCamp) return false;

  // A: utm_campaign equals stable platform campaign_id when that is what was stored
  if (paidCampId && utmCamp === paidCampId) return true;

  // B: exact normalized equality to campaign name
  if (paidCampName && utmCamp === paidCampName) return true;

  return false;
}

export type CampaignAssignment<T> =
  | { status: "matched"; campaign: T }
  | { status: "unmatched" }
  | { status: "ambiguous"; candidates: T[] };

/**
 * Assign at most one campaign per order.
 * Multiple equally valid matches → ambiguous (assign none).
 */
export function assignOrderToUniqueCampaign<T extends PaidAttributionJoinKey>(
  orderAttr: OrderAttributionFields,
  campaigns: T[]
): CampaignAssignment<T> {
  const hits = campaigns.filter((c) => isExactCampaignMatch(orderAttr, c));
  if (hits.length === 0) return { status: "unmatched" };
  if (hits.length === 1) return { status: "matched", campaign: hits[0] };
  return { status: "ambiguous", candidates: hits };
}

/** Exact creative/content match: utm_content === ad_id or ad_name / content key. */
export function isExactCreativeMatch(
  orderAttr: OrderAttributionFields,
  creative: {
    platform: string;
    contentKey: string;
    adId?: string | null;
    adName?: string | null;
  }
): boolean {
  if (!platformMatches(orderAttr, { platform: creative.platform })) return false;
  const content = normalizeAttributionToken(orderAttr.utmContent);
  if (!content) return false;

  const orderAdId = normalizeAttributionToken(orderAttr.adId);
  const adId = normalizeAttributionToken(creative.adId);
  if (orderAdId && adId && orderAdId === adId) return true;

  const key = normalizeAttributionToken(creative.contentKey);
  const adName = normalizeAttributionToken(creative.adName);
  if (key && content === key) return true;
  if (adId && content === adId) return true;
  if (adName && content === adName) return true;
  return false;
}

export function assignOrderToUniqueCreative<
  T extends {
    platform: string;
    contentKey: string;
    adId?: string | null;
    adName?: string | null;
  },
>(
  orderAttr: OrderAttributionFields,
  creatives: T[]
): CampaignAssignment<T> {
  const hits = creatives.filter((c) => isExactCreativeMatch(orderAttr, c));
  if (hits.length === 0) return { status: "unmatched" };
  if (hits.length === 1) return { status: "matched", campaign: hits[0] };
  return { status: "ambiguous", candidates: hits };
}

/**
 * Compatibility score: positive only for exact campaign (+ optional exact content).
 * Never uses substring matching.
 */
export function paidAttributionMatchScore(
  orderAttr: OrderAttributionFields,
  paid: PaidAttributionJoinKey
): number {
  if (!isExactCampaignMatch(orderAttr, paid)) return 0;
  let score = 5; // platform + exact campaign
  const content = normalizeAttributionToken(orderAttr.utmContent);
  if (
    content &&
    ((paid.adId && content === normalizeAttributionToken(paid.adId)) ||
      (paid.adName && content === normalizeAttributionToken(paid.adName)) ||
      (paid.utmContent &&
        content === normalizeAttributionToken(paid.utmContent)))
  ) {
    score += 4;
  }
  return score;
}

/** Internal PSL revenue wins over platform-reported purchase value. */
export function chooseRevenueTruth(input: {
  pslAttributedRevenueUsd: number;
  platformPurchaseValueUsd: number | null | undefined;
}): { revenueUsd: number; source: "psl" | "none" } {
  if (input.pslAttributedRevenueUsd > 0) {
    return { revenueUsd: input.pslAttributedRevenueUsd, source: "psl" };
  }
  return { revenueUsd: 0, source: "none" };
}
