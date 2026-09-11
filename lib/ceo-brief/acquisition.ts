import type { CeoAcquisitionSnapshot } from "./types";

/**
 * Paid acquisition spend connectors are not wired.
 * Attribute-only UTM data must not invent CAC/ROAS.
 */
export function collectAcquisitionSnapshot(): CeoAcquisitionSnapshot {
  return {
    status: "unavailable",
    message: "Paid acquisition spend data not yet available.",
    spendUsd: null,
    sessionsOrClicks: null,
    attributedOrders: null,
    attributedRevenueUsd: null,
    cacUsd: null,
    roas: null,
    winners: [],
    losers: [],
  };
}
