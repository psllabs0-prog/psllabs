/**
 * Offline unit tests for inventory monitor pure logic.
 * Run: npx tsx scripts/test-inventory-monitor.ts
 */
import {
  DEPLETION_WATCH_PCT,
  MIN_DAYS_FOR_FORECAST,
  MIN_UNITS_FOR_FORECAST,
  REORDER_REVIEW_DAYS,
  TESTING_COST_HIGH_USD,
  TESTING_COST_LOW_USD,
} from "../lib/inventory/monitor/constants";
import {
  buildSkuMonitorMetrics,
  computeTestingEconomics,
  planningReleaseEstimate,
  simulateCoverageDays,
} from "../lib/inventory/monitor/metrics";
import type { PipelineLotRow } from "../lib/inventory/monitor/pipeline";
import type { SkuDemandMetrics } from "../lib/inventory/monitor/demand";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function baseDemand(
  overrides: Partial<SkuDemandMetrics> = {}
): SkuDemandMetrics {
  return {
    handle: "reta",
    sku: "PSL-RETA",
    sold7d: 0,
    sold14d: 0,
    sold28d: 0,
    validOrders28d: 0,
    lifetimeSold: 0,
    firstValidSaleAt: null,
    observedSellingDays: null,
    shareOfValidUnits28d: null,
    ...overrides,
  };
}

function baseLot(
  overrides: Partial<PipelineLotRow> = {}
): PipelineLotRow {
  const now = new Date("2026-09-01T00:00:00.000Z");
  return {
    id: 1,
    sku: "PSL-RETA",
    supplierLotReference: null,
    quantityOrdered: 50,
    quantityReceived: null,
    status: "ordered",
    orderedAt: now.toISOString(),
    expectedReleaseAt: null,
    receivedAt: null,
    testingStartedAt: null,
    testingCost: null,
    notes: null,
    releasedAt: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ...overrides,
  };
}

function testTestingEconomics() {
  const rows = computeTestingEconomics();
  assert(rows.length === 4, "four candidate sizes");
  const ten = rows.find((r) => r.quantity === 10)!;
  assert(
    ten.costPerUnitLow === TESTING_COST_LOW_USD / 10,
    "10-unit low allocation"
  );
  assert(
    ten.costPerUnitHigh === TESTING_COST_HIGH_USD / 10,
    "10-unit high allocation"
  );
  const hundred = rows.find((r) => r.quantity === 100)!;
  assert(hundred.costPerUnitLow === 2.5, "100-unit low");
  assert(hundred.costPerUnitHigh === 5, "100-unit high");
}

function testInsufficientData() {
  const m = buildSkuMonitorMetrics({
    productName: "Retatrutide",
    sellableStock: 100,
    pipeline: { ordered: 0, inTransit: 0, awaitingTesting: 0 },
    openLots: [],
    demand: baseDemand({
      lifetimeSold: 2,
      sold7d: 2,
      observedSellingDays: 3,
      firstValidSaleAt: "2026-09-08T00:00:00.000Z",
    }),
    baselineStock: 100,
    absoluteLowThreshold: 15,
    asOf: new Date("2026-09-10T00:00:00.000Z"),
  });
  assert(
    m.forecastConfidence === "INSUFFICIENT_SALES_DATA",
    "needs min units+days"
  );
  assert(m.planningVelocity === null, "no planning velocity early");
  assert(m.daysSupply === null, "no fake days supply");
  assert(!m.statusFlags.includes("REORDER_REVIEW"), "no reorder review early");
  assert(m.statusFlags.includes("INSUFFICIENT_SALES_DATA"), "flag present");
}

function testReliableReorderReview() {
  // Velocity 2/day → 35-day need = 70. Sellable 20 → risk coverage < 35.
  const m = buildSkuMonitorMetrics({
    productName: "Retatrutide",
    sellableStock: 20,
    pipeline: { ordered: 0, inTransit: 0, awaitingTesting: 0 },
    openLots: [],
    demand: baseDemand({
      lifetimeSold: 40,
      sold7d: 14,
      sold14d: 28,
      sold28d: 56,
      observedSellingDays: 30,
      firstValidSaleAt: "2026-08-01T00:00:00.000Z",
      validOrders28d: 20,
    }),
    baselineStock: 100,
    absoluteLowThreshold: 15,
    asOf: new Date("2026-09-10T00:00:00.000Z"),
  });
  assert(m.forecastConfidence === "RELIABLE", "reliable when enough history");
  assert(
    m.planningVelocity === Math.max(14 / 7, 28 / 14, 56 / 28),
    "planning = max of windows"
  );
  assert(
    m.riskAdjustedDaysSupply !== null &&
      m.riskAdjustedDaysSupply <= REORDER_REVIEW_DAYS,
    "coverage at/below 35d"
  );
  assert(m.statusFlags.includes("REORDER_REVIEW"), "reorder review");
  assert(m.minimumRiskWindowGap !== null && m.minimumRiskWindowGap > 0, "gap");
}

function testDepletionWatch() {
  const m = buildSkuMonitorMetrics({
    productName: "GHK-Cu",
    sellableStock: 70,
    pipeline: { ordered: 0, inTransit: 0, awaitingTesting: 0 },
    openLots: [],
    demand: baseDemand({
      handle: "ghk-cu",
      sku: "PSL-GHK",
      lifetimeSold: 1,
      sold7d: 1,
      observedSellingDays: 2,
    }),
    baselineStock: 100,
    absoluteLowThreshold: 15,
    asOf: new Date("2026-09-10T00:00:00.000Z"),
  });
  assert(
    m.depletionPct !== null && m.depletionPct >= DEPLETION_WATCH_PCT,
    "25% depleted"
  );
  assert(m.statusFlags.includes("DEPLETION_WATCH"), "depletion watch");
  assert(
    m.forecastConfidence === "INSUFFICIENT_SALES_DATA",
    "still insufficient"
  );
}

function testInboundDoesNotIncreaseSellable() {
  const lot = baseLot({ status: "in_transit", quantityOrdered: 170 });
  const m = buildSkuMonitorMetrics({
    productName: "Retatrutide",
    sellableStock: 10,
    pipeline: { ordered: 0, inTransit: 170, awaitingTesting: 0 },
    openLots: [lot],
    demand: baseDemand({
      lifetimeSold: 20,
      sold7d: 7,
      sold14d: 14,
      sold28d: 28,
      observedSellingDays: 20,
      firstValidSaleAt: "2026-08-20T00:00:00.000Z",
    }),
    baselineStock: 10,
    absoluteLowThreshold: 15,
    asOf: new Date("2026-09-10T00:00:00.000Z"),
  });
  assert(m.sellableStock === 10, "sellable unchanged by inbound");
  assert(m.inTransit === 170, "inbound tracked separately");
  assert(
    m.planningReleaseEvents.length === 1,
    "future release event for coverage"
  );
}

function testReleaseDateEstimates() {
  const ordered = baseLot({
    status: "ordered",
    orderedAt: "2026-09-01T00:00:00.000Z",
  });
  const est = planningReleaseEstimate(ordered);
  assert(est.estimate === true, "calculated estimate");
  assert(
    est.planningAt?.toISOString().slice(0, 10) === "2026-09-23",
    "ordered+22"
  );
  assert(est.riskAt?.toISOString().slice(0, 10) === "2026-10-06", "ordered+35");

  const testing = baseLot({
    status: "received_awaiting_testing",
    testingStartedAt: "2026-09-01T00:00:00.000Z",
  });
  const t = planningReleaseEstimate(testing);
  assert(t.planningAt?.toISOString().slice(0, 10) === "2026-09-15", "+14d");

  const explicit = baseLot({
    status: "ordered",
    expectedReleaseAt: "2026-10-01T00:00:00.000Z",
  });
  const e = planningReleaseEstimate(explicit);
  assert(e.estimate === false, "explicit date not estimate");
  assert(e.planningAt?.toISOString().slice(0, 10) === "2026-10-01", "explicit");
}

function testCoverageSimulationTiming() {
  const asOf = new Date("2026-09-01T00:00:00.000Z");
  // 10 sellable, release 20 on day 5, demand 2/day
  const days = simulateCoverageDays({
    sellable: 10,
    velocityPerDay: 2,
    releases: [{ at: new Date("2026-09-06T00:00:00.000Z"), qty: 20 }],
    asOf,
  });
  assert(days !== null && days > 5, "inbound only helps after release day");
  // Without release, 10/2 = 5 days
  const alone = simulateCoverageDays({
    sellable: 10,
    velocityPerDay: 2,
    releases: [],
    asOf,
  });
  assert(alone !== null && alone <= 5, "no inbound → earlier stockout");
}

function testEarlyDataThresholdConstants() {
  assert(MIN_UNITS_FOR_FORECAST === 3, "3 units");
  assert(MIN_DAYS_FOR_FORECAST === 7, "7 days");
}

function testAlertStateMachineLogic() {
  // Pure state transition rules (mirrored from alerts.ts behavior).
  type State = "open" | "resolved" | null;
  function shouldSend(prev: State, nowActive: boolean): {
    next: State;
    send: boolean;
  } {
    if (nowActive) {
      if (prev === "open") return { next: "open", send: false };
      return { next: "open", send: true };
    }
    if (prev === "open") return { next: "resolved", send: false };
    return { next: prev, send: false };
  }
  assert(shouldSend(null, true).send === true, "first enter sends");
  assert(shouldSend("open", true).send === false, "unchanged does not resend");
  assert(shouldSend("open", false).next === "resolved", "resolves");
  assert(
    shouldSend("resolved", true).send === true,
    "re-enter after resolve sends"
  );
}

function testQaExclusionPredicate() {
  // Mirrors demand.ts NOT EXISTS reporting_excluded = true rule.
  const qualifies = (orderStatus: string, reportingExcluded: boolean | null) =>
    (orderStatus === "paid" || orderStatus === "shipped") &&
    reportingExcluded !== true;

  assert(qualifies("paid", null), "finance absent ok");
  assert(qualifies("paid", false), "not excluded ok");
  assert(!qualifies("paid", true), "excluded blocked");
  assert(!qualifies("pending", false), "pending blocked");
  assert(!qualifies("failed", false), "failed blocked");
  assert(!qualifies("cancelled", false), "cancelled blocked");
  assert(qualifies("shipped", false), "shipped ok");
}

console.log("[test-inventory-monitor] running…");
testTestingEconomics();
testInsufficientData();
testReliableReorderReview();
testDepletionWatch();
testInboundDoesNotIncreaseSellable();
testReleaseDateEstimates();
testCoverageSimulationTiming();
testEarlyDataThresholdConstants();
testAlertStateMachineLogic();
testQaExclusionPredicate();
console.log("[test-inventory-monitor] all passed.");
