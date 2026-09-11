import {
  CANDIDATE_LOT_SIZES,
  DEPLETION_WATCH_PCT,
  ForecastConfidence,
  MIN_DAYS_FOR_FORECAST,
  MIN_UNITS_FOR_FORECAST,
  MonitorStatusFlag,
  PLANNING_LEAD_DAYS,
  REORDER_REVIEW_DAYS,
  RISK_LEAD_DAYS,
  TESTING_COST_HIGH_USD,
  TESTING_COST_LOW_USD,
  TESTING_TURNAROUND_DAYS,
} from "./constants";
import type { SkuDemandMetrics } from "./demand";
import type { PipelineLotRow } from "./pipeline";

export type TestingEconomicsRow = {
  quantity: number;
  costPerUnitLow: number;
  costPerUnitHigh: number;
};

export type SkuMonitorMetrics = {
  handle: string;
  sku: string;
  productName: string;
  sellableStock: number;
  orderedInbound: number;
  inTransit: number;
  awaitingTesting: number;
  sold7d: number;
  sold14d: number;
  sold28d: number;
  validOrders28d: number;
  lifetimeSold: number;
  firstValidSaleAt: string | null;
  observedSellingDays: number | null;
  shareOfValidUnits28d: number | null;
  avg7d: number | null;
  avg14d: number | null;
  avg28d: number | null;
  planningVelocity: number | null;
  forecastConfidence: ForecastConfidence;
  daysSupply: number | null;
  riskAdjustedDaysSupply: number | null;
  projectedStockoutAt: string | null;
  reorderReviewAt: string | null;
  baselineStock: number;
  depletionPct: number | null;
  monitorStatus: string;
  statusFlags: MonitorStatusFlag[];
  testingEconomics: TestingEconomicsRow[];
  minimumRiskWindowGap: number | null;
  planningReleaseEvents: Array<{ at: string; qty: number; estimate: boolean }>;
  riskReleaseEvents: Array<{ at: string; qty: number; estimate: boolean }>;
};

function addDays(date: Date, days: number): Date {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function computeTestingEconomics(): TestingEconomicsRow[] {
  return CANDIDATE_LOT_SIZES.map((quantity) => ({
    quantity,
    costPerUnitLow: TESTING_COST_LOW_USD / quantity,
    costPerUnitHigh: TESTING_COST_HIGH_USD / quantity,
  }));
}

export function planningReleaseEstimate(lot: PipelineLotRow): {
  planningAt: Date | null;
  riskAt: Date | null;
  estimate: boolean;
} {
  if (lot.expectedReleaseAt) {
    const at = new Date(lot.expectedReleaseAt);
    return { planningAt: at, riskAt: at, estimate: false };
  }

  if (lot.status === "received_awaiting_testing") {
    const start = lot.testingStartedAt
      ? new Date(lot.testingStartedAt)
      : lot.receivedAt
        ? new Date(lot.receivedAt)
        : null;
    if (!start) return { planningAt: null, riskAt: null, estimate: true };
    const at = addDays(start, TESTING_TURNAROUND_DAYS);
    return { planningAt: at, riskAt: at, estimate: true };
  }

  if (lot.status === "ordered" || lot.status === "in_transit") {
    const ordered = new Date(lot.orderedAt);
    return {
      planningAt: addDays(ordered, PLANNING_LEAD_DAYS),
      riskAt: addDays(ordered, RISK_LEAD_DAYS),
      estimate: true,
    };
  }

  return { planningAt: null, riskAt: null, estimate: true };
}

function avgPerDay(units: number, windowDays: number): number {
  return units / windowDays;
}

/**
 * Simulate days until stock would hit 0 under constant demand,
 * applying release events only on their estimated dates.
 */
export function simulateCoverageDays(input: {
  sellable: number;
  velocityPerDay: number;
  releases: Array<{ at: Date; qty: number }>;
  asOf: Date;
  maxDays?: number;
}): number | null {
  if (input.velocityPerDay <= 0) return null;
  const maxDays = input.maxDays ?? 3650;
  const releases = [...input.releases].sort(
    (a, b) => a.at.getTime() - b.at.getTime()
  );
  let stock = input.sellable;
  let releaseIdx = 0;

  for (let day = 0; day <= maxDays; day += 1) {
    const dayStart = addDays(input.asOf, day);
    while (
      releaseIdx < releases.length &&
      releases[releaseIdx].at.getTime() <= dayStart.getTime()
    ) {
      stock += releases[releaseIdx].qty;
      releaseIdx += 1;
    }
    if (day === 0) {
      // availability at start of day 0
    }
    if (stock <= 0) return Math.max(0, day);
    stock -= input.velocityPerDay;
    if (stock < -1e-9) return day;
  }
  return maxDays;
}

export function buildSkuMonitorMetrics(input: {
  productName: string;
  sellableStock: number;
  pipeline: {
    ordered: number;
    inTransit: number;
    awaitingTesting: number;
  };
  openLots: PipelineLotRow[];
  demand: SkuDemandMetrics;
  baselineStock: number;
  absoluteLowThreshold: number;
  asOf?: Date;
}): SkuMonitorMetrics {
  const asOf = input.asOf ?? new Date();
  const demand = input.demand;

  const avg7d = avgPerDay(demand.sold7d, 7);
  const avg14d = avgPerDay(demand.sold14d, 14);
  const avg28d = avgPerDay(demand.sold28d, 28);

  const hasEnoughUnits = demand.lifetimeSold >= MIN_UNITS_FOR_FORECAST;
  const hasEnoughDays =
    (demand.observedSellingDays ?? 0) >= MIN_DAYS_FOR_FORECAST;
  const forecastConfidence: ForecastConfidence =
    hasEnoughUnits && hasEnoughDays
      ? "RELIABLE"
      : "INSUFFICIENT_SALES_DATA";

  const planningVelocity =
    forecastConfidence === "RELIABLE"
      ? Math.max(avg7d, avg14d, avg28d)
      : null;

  const planningEvents: Array<{ at: string; qty: number; estimate: boolean }> =
    [];
  const riskEvents: Array<{ at: string; qty: number; estimate: boolean }> = [];

  for (const lot of input.openLots) {
    const qty = lot.quantityReceived ?? lot.quantityOrdered;
    const est = planningReleaseEstimate(lot);
    if (est.planningAt) {
      planningEvents.push({
        at: est.planningAt.toISOString(),
        qty,
        estimate: est.estimate,
      });
    }
    if (est.riskAt) {
      riskEvents.push({
        at: est.riskAt.toISOString(),
        qty,
        estimate: est.estimate,
      });
    }
  }

  let daysSupply: number | null = null;
  let riskAdjustedDaysSupply: number | null = null;
  let projectedStockoutAt: string | null = null;
  let reorderReviewAt: string | null = null;
  let minimumRiskWindowGap: number | null = null;

  if (planningVelocity && planningVelocity > 0) {
    daysSupply = input.sellableStock / planningVelocity;
    projectedStockoutAt = toDateOnly(
      addDays(asOf, Math.floor(daysSupply))
    );

    riskAdjustedDaysSupply = simulateCoverageDays({
      sellable: input.sellableStock,
      velocityPerDay: planningVelocity,
      releases: riskEvents.map((e) => ({ at: new Date(e.at), qty: e.qty })),
      asOf,
    });

    const riskNeed = planningVelocity * REORDER_REVIEW_DAYS;
    const inboundRiskQty = riskEvents
      .filter((e) => new Date(e.at).getTime() <= addDays(asOf, REORDER_REVIEW_DAYS).getTime())
      .reduce((sum, e) => sum + e.qty, 0);
    minimumRiskWindowGap = Math.max(
      0,
      Math.ceil(riskNeed - input.sellableStock - inboundRiskQty)
    );

    if (
      riskAdjustedDaysSupply !== null &&
      riskAdjustedDaysSupply > REORDER_REVIEW_DAYS
    ) {
      reorderReviewAt = toDateOnly(
        addDays(asOf, Math.floor(riskAdjustedDaysSupply - REORDER_REVIEW_DAYS))
      );
    } else if (riskAdjustedDaysSupply !== null) {
      reorderReviewAt = toDateOnly(asOf);
    }
  }

  const depletionPct =
    input.baselineStock > 0
      ? Math.max(
          0,
          (input.baselineStock - input.sellableStock) / input.baselineStock
        )
      : null;

  const statusFlags: MonitorStatusFlag[] = [];
  if (forecastConfidence === "INSUFFICIENT_SALES_DATA") {
    statusFlags.push("INSUFFICIENT_SALES_DATA");
  }
  if (depletionPct !== null && depletionPct >= DEPLETION_WATCH_PCT) {
    statusFlags.push("DEPLETION_WATCH");
  }
  if (
    forecastConfidence === "RELIABLE" &&
    riskAdjustedDaysSupply !== null &&
    riskAdjustedDaysSupply <= REORDER_REVIEW_DAYS
  ) {
    statusFlags.push("REORDER_REVIEW");
  }
  if (input.sellableStock < input.absoluteLowThreshold) {
    statusFlags.push("ABSOLUTE_LOW_STOCK");
  }
  if (statusFlags.length === 0) statusFlags.push("OK");

  const monitorStatus = statusFlags.join("; ");

  return {
    handle: demand.handle,
    sku: demand.sku,
    productName: input.productName,
    sellableStock: input.sellableStock,
    orderedInbound: input.pipeline.ordered,
    inTransit: input.pipeline.inTransit,
    awaitingTesting: input.pipeline.awaitingTesting,
    sold7d: demand.sold7d,
    sold14d: demand.sold14d,
    sold28d: demand.sold28d,
    validOrders28d: demand.validOrders28d,
    lifetimeSold: demand.lifetimeSold,
    firstValidSaleAt: demand.firstValidSaleAt,
    observedSellingDays: demand.observedSellingDays,
    shareOfValidUnits28d: demand.shareOfValidUnits28d,
    avg7d: forecastConfidence === "RELIABLE" ? avg7d : avg7d,
    avg14d: avg14d,
    avg28d: avg28d,
    planningVelocity,
    forecastConfidence,
    daysSupply:
      forecastConfidence === "RELIABLE" ? daysSupply : null,
    riskAdjustedDaysSupply:
      forecastConfidence === "RELIABLE" ? riskAdjustedDaysSupply : null,
    projectedStockoutAt:
      forecastConfidence === "RELIABLE" ? projectedStockoutAt : null,
    reorderReviewAt:
      forecastConfidence === "RELIABLE" ? reorderReviewAt : null,
    baselineStock: input.baselineStock,
    depletionPct,
    monitorStatus,
    statusFlags,
    testingEconomics: computeTestingEconomics(),
    minimumRiskWindowGap:
      forecastConfidence === "RELIABLE" ? minimumRiskWindowGap : null,
    planningReleaseEvents: planningEvents,
    riskReleaseEvents: riskEvents,
  };
}
