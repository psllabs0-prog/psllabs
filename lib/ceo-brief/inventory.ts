import { computeInventoryMonitorMetrics } from "@/lib/inventory/monitor/run";
import { listPipelineLots } from "@/lib/inventory/monitor/pipeline";

import type { ActionCandidate } from "./period";
import type { CeoInventorySkuRow, CeoInventorySnapshot } from "./types";

export function inboundPipelineTotal(input: {
  orderedInbound: number;
  inTransit: number;
  awaitingTesting: number;
}): number {
  return (
    Math.max(0, input.orderedInbound) +
    Math.max(0, input.inTransit) +
    Math.max(0, input.awaitingTesting)
  );
}

/**
 * ABSOLUTE_LOW_STOCK is factual inventory info, but must not auto-become a
 * Luke top action when pipeline stock already covers the gap and demand is
 * unvalidated.
 */
export function shouldCreateInventoryRiskLukeAction(
  sku: Pick<
    CeoInventorySkuRow,
    | "sellableUnits"
    | "orderedInbound"
    | "inTransit"
    | "awaitingTesting"
    | "forecastConfidence"
    | "statusFlags"
  >
): boolean {
  const inbound = inboundPipelineTotal(sku);
  const low = sku.statusFlags.includes("ABSOLUTE_LOW_STOCK");
  const reorder = sku.statusFlags.includes("REORDER_REVIEW");
  const insufficient =
    sku.forecastConfidence === "INSUFFICIENT_SALES_DATA" ||
    sku.statusFlags.includes("INSUFFICIENT_SALES_DATA");

  // Inbound already ordered + unvalidated velocity → no "address low stock".
  if (inbound > 0 && insufficient) return false;

  // Need validated demand / reorder risk and no meaningful inbound.
  if (inbound > 0) return false;
  if (!low && !reorder) return false;
  if (insufficient) return false;
  return true;
}

export function buildInventoryLukeActionCandidates(
  inventory: CeoInventorySnapshot
): ActionCandidate[] {
  const candidates: ActionCandidate[] = [];

  const awaitingUnits = inventory.skus.reduce(
    (sum, s) => sum + s.awaitingTesting,
    0
  );
  if (inventory.awaitingTestingLots > 0 || awaitingUnits > 0) {
    candidates.push({
      priority: 3,
      action: "Advance lots awaiting testing toward release (or decide hold)",
      why: `${inventory.awaitingTestingLots} lot(s) / ${awaitingUnits} unit(s) await testing (~$250–$500/lot). Not sellable until released.`,
      urgency: "This week",
      section: "inventory",
    });
  }

  const riskSku = inventory.skus.find((s) =>
    shouldCreateInventoryRiskLukeAction(s)
  );
  if (riskSku) {
    const flags = riskSku.statusFlags.filter((f) =>
      ["ABSOLUTE_LOW_STOCK", "REORDER_REVIEW"].includes(f)
    );
    candidates.push({
      priority: 3,
      action: `Review inventory risk: ${riskSku.name} (${riskSku.sku})`,
      why: `Sellable ${riskSku.sellableUnits}, inbound pipeline ${riskSku.inboundPipelineTotal}, confidence ${riskSku.forecastConfidence}, flags ${flags.join(", ") || "n/a"}. Human review only — never auto-PO; MOQ alone is not an action.`,
      urgency: "This week",
      section: "inventory",
    });
  }

  return candidates;
}

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
    const inbound = inboundPipelineTotal({
      orderedInbound: m.orderedInbound,
      inTransit: m.inTransit,
      awaitingTesting: m.awaitingTesting,
    });
    inboundUnitsTotal += inbound;

    if (m.statusFlags.includes("ABSOLUTE_LOW_STOCK")) {
      lowStockAlerts.push(
        `${m.productName} (${m.sku}): ${m.sellableStock} sellable · inbound pipeline ${inbound}`
      );
    }
    if (m.statusFlags.includes("REORDER_REVIEW")) {
      reorderReviewSignals.push(
        `${m.productName} (${m.sku}): reorder review — sellable ${m.sellableStock}, inbound pipeline ${inbound}, awaiting testing ${m.awaitingTesting}`
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
      inboundPipelineTotal: inbound,
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
