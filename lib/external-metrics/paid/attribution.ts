/**
 * Join helpers between paid_acquisition_daily and PSL order attribution.
 * Does not redesign attribution — maps common platform/UTM fields.
 */

export type PaidAttributionJoinKey = {
  platform: string;
  campaignId?: string | null;
  adsetId?: string | null;
  adId?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
};

export function normalizePaidPlatform(raw: string | null | undefined): string {
  const s = (raw ?? "").trim().toLowerCase();
  if (["meta", "facebook", "fb", "instagram", "ig"].includes(s)) return "meta";
  if (["tiktok", "tt"].includes(s)) return "tiktok";
  if (["google", "adwords", "youtube"].includes(s)) return "google";
  return s;
}

/**
 * Match score for joining a Neon order attribution blob to a paid daily row.
 * Prefer explicit campaign/ad ids; fall back to standardized UTM campaign.
 */
export function paidAttributionMatchScore(
  orderAttr: {
    utmSource?: string | null;
    utmMedium?: string | null;
    utmCampaign?: string | null;
    utmContent?: string | null;
  },
  paid: PaidAttributionJoinKey
): number {
  let score = 0;
  const src = normalizePaidPlatform(orderAttr.utmSource);
  if (src && src === normalizePaidPlatform(paid.platform)) score += 2;

  const camp = (orderAttr.utmCampaign ?? "").trim().toLowerCase();
  const paidCamp = (paid.utmCampaign ?? paid.campaignId ?? "")
    .trim()
    .toLowerCase();
  if (camp && paidCamp && (camp === paidCamp || camp.includes(paidCamp))) {
    score += 3;
  }

  const content = (orderAttr.utmContent ?? "").trim().toLowerCase();
  if (content && paid.adId && content === paid.adId.toLowerCase()) score += 4;
  if (content && paid.adsetId && content === paid.adsetId.toLowerCase())
    score += 2;

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
  // Never substitute platform conversion claim as PSL truth.
  return { revenueUsd: 0, source: "none" };
}
