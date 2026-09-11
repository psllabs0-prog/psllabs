import { computeInventoryMonitorMetrics } from "@/lib/inventory/monitor/run";
import { listPipelineLots } from "@/lib/inventory/monitor/pipeline";

import type { CeoInventorySnapshot } from "./types";

export async function collectInventorySnapshot(
  asOf: Date = new Date()
): Promise<CeoInventorySnapshot> {
  const [metrics, lots] = await Promise.all([
    computeInventoryMonitorMetrics(asOf),
    listPipelineLots({ includeReleased: false, limit: 200 }),
  ]);

  const lowStockAlerts: string[] = [];
  const reorderReviewSignals: string[] = [];
  let sellableUnitsTotal = 0;
  let inboundUnitsTotal = 0;

  const skus = metrics.map((m) => {
    sellableUnitsTotal += m.sellableStock;
    const inbound = m.orderedInbound + m.inTransit + m.awaitingTesting;
    inboundUnitsTotal += inbound;

    if (m.statusFlags.includes("ABSOLUTE_LOW_STOCK")) {
      lowStockAlerts.push(
        `${m.productName} (${m.sku}): ${m.sellableStock} sellable`
      );
    }
    if (m.statusFlags.includes("REORDER_REVIEW")) {
      reorderReviewSignals.push(
        `${m.productName} (${m.sku}): reorder review — sellable ${m.sellableStock}, awaiting testing ${m.awaitingTesting}`
      );
    }

    const expectedReleaseDates = [
      ...m.planningReleaseEvents
        .filter((e) => !e.estimate && e.at)
        .map((e) => e.at.slice(0, 10)),
    ];

    return {
      handle: m.handle,
      sku: m.sku,
      name: m.productName,
      sellableUnits: m.sellableStock,
      orderedInbound: m.orderedInbound,
      inTransit: m.inTransit,
      awaitingTesting: m.awaitingTesting,
      forecastConfidence: m.forecastConfidence,
      statusFlags: m.statusFlags,
      expectedReleaseDates: [...new Set(expectedReleaseDates)],
    };
  });

  const awaitingTestingLots = lots.filter(
    (l) => l.status === "received_awaiting_testing"
  ).length;

  return {
    skus: skus.filter(
      (s) =>
        s.sellableUnits > 0 ||
        s.orderedInbound > 0 ||
        s.inTransit > 0 ||
        s.awaitingTesting > 0 ||
        s.statusFlags.some((f) => f !== "OK")
    ),
    lowStockAlerts,
    reorderReviewSignals,
    awaitingTestingLots,
    inboundUnitsTotal,
    sellableUnitsTotal,
    testingEconomicsNote:
      "Testing cost guidance: ~$250–$500 per received lot/batch. Do not recommend a PO from MOQ alone.",
  };
}

/** Pure helper for tests: inbound/testing must never be counted as sellable. */
export function sellableNeverIncludesInbound(input: {
  sellable: number;
  inbound: number;
  awaitingTesting: number;
}): number {
  return Math.max(0, input.sellable);
}
