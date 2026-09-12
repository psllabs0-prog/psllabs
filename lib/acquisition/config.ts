export function getPaidLearningBudgetCeilingUsd(): number {
  const raw = process.env.PAID_LEARNING_BUDGET_CEILING_USD?.trim();
  const n = raw ? Number(raw) : 1000;
  if (!Number.isFinite(n) || n <= 0) return 1000;
  return n;
}

export function getAcquisitionReviewMinClicks(): number | null {
  const raw = process.env.ACQUISITION_REVIEW_MIN_CLICKS?.trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function getAcquisitionReviewMinSpendUsd(): number | null {
  const raw = process.env.ACQUISITION_REVIEW_MIN_SPEND_USD?.trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function getAcquisitionMinOrdersForComparison(): number | null {
  const raw = process.env.ACQUISITION_MIN_ORDERS_FOR_COMPARISON?.trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export type LearningBudgetStatus = {
  ceilingUsd: number;
  spentUsd: number;
  remainingUsd: number;
  pctOfCeiling: number;
  reviewState: "ok" | "approaching" | "reached" | "exceeded";
};

export function computeLearningBudget(spentUsd: number): LearningBudgetStatus {
  const ceilingUsd = getPaidLearningBudgetCeilingUsd();
  const spent = Math.max(0, spentUsd);
  const remainingUsd = Math.max(0, ceilingUsd - spent);
  const pct = ceilingUsd > 0 ? (spent / ceilingUsd) * 100 : 0;
  let reviewState: LearningBudgetStatus["reviewState"] = "ok";
  if (spent > ceilingUsd) reviewState = "exceeded";
  else if (spent >= ceilingUsd) reviewState = "reached";
  else if (pct >= 80) reviewState = "approaching";
  return {
    ceilingUsd,
    spentUsd: spent,
    remainingUsd,
    pctOfCeiling: pct,
    reviewState,
  };
}

/** Contribution economics unavailable until Finance COGS stack exists. */
export function contributionEconomicsLabel(): "insufficient data" {
  return "insufficient data";
}

export function hasEnoughEvidenceForPerformanceConclusion(input: {
  clicks: number;
  spendUsd: number;
  orders: number;
}): boolean {
  const minClicks = getAcquisitionReviewMinClicks();
  const minSpend = getAcquisitionReviewMinSpendUsd();
  const minOrders = getAcquisitionMinOrdersForComparison();
  if (minClicks == null && minSpend == null && minOrders == null) {
    return false; // unset thresholds → suppress strong conclusions
  }
  if (minClicks != null && input.clicks < minClicks) return false;
  if (minSpend != null && input.spendUsd < minSpend) return false;
  if (minOrders != null && input.orders < minOrders) return false;
  return true;
}
