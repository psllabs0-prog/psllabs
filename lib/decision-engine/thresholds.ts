/**
 * Day-0 / evidence thresholds for the Decision Engine.
 * Conservative defaults — strong conclusions need enough evidence.
 */

export function getDecisionMinOrdersForTrend(): number {
  const raw = process.env.DECISION_MIN_ORDERS_FOR_TREND?.trim();
  if (!raw) return 5;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 5;
}

export function getDecisionMinDaysForBaseline(): number {
  const raw = process.env.DECISION_MIN_DAYS_FOR_BASELINE?.trim();
  if (!raw) return 7;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 7;
}

export function getDecisionMinSupportCount(): number {
  const raw = process.env.DECISION_MIN_SUPPORT_COUNT?.trim();
  if (!raw) return 3;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 3;
}

export function getDecisionMinPaidSpendUsd(): number {
  const raw = process.env.DECISION_MIN_PAID_SPEND_USD?.trim();
  if (!raw) return 50;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 50;
}

export function getDecisionMinPaidClicks(): number {
  const raw = process.env.DECISION_MIN_PAID_CLICKS?.trim();
  if (!raw) return 40;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 40;
}

export function getDecisionFulfillmentBacklogMaterial(): number {
  const raw = process.env.DECISION_FULFILLMENT_BACKLOG_MATERIAL?.trim();
  if (!raw) return 8;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 8;
}

export function getDecisionMinSeoNonBrandImpressions(): number {
  const raw = process.env.DECISION_MIN_SEO_NONBRAND_IMPRESSIONS?.trim();
  if (!raw) return 80;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 80;
}

export function isDecisionDailyDigestEnabled(): boolean {
  return process.env.DECISION_DAILY_DIGEST_ENABLED?.trim() === "true";
}

/** Prefer existing CEO/internal recipient; never invent an address. */
export function getDecisionDigestRecipient(): string | null {
  const dedicated = process.env.DECISION_DIGEST_EMAIL?.trim();
  if (dedicated) return dedicated;
  const order = process.env.ORDER_NOTIFICATION_EMAIL?.trim();
  if (order) return order;
  return null;
}
