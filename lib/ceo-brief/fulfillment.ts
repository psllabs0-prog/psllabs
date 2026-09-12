import { collectFulfillmentBoard } from "@/lib/fulfillment/store";

import type { ActionCandidate } from "./period";
import type { CeoFulfillmentSnapshot } from "./types";

export async function collectFulfillmentSnapshot(): Promise<CeoFulfillmentSnapshot> {
  try {
    const board = await collectFulfillmentBoard();
    const notes: string[] = [];
    if (board.hold.length > 0) {
      notes.push(
        `${board.hold.length} payment-confirmed order(s) blocked by payment reconciliation or hold.`
      );
    }
    if (board.summary.readyOrders >= 5) {
      notes.push(
        `${board.summary.readyOrders} legitimate orders awaiting fulfillment.`
      );
    } else if (
      board.summary.readyOrders > 0 &&
      board.hold.length === 0 &&
      board.summary.readyOrders < 5
    ) {
      // Small normal queue — omit from CEO notes (no busywork).
    }
    return {
      readyOrders: board.summary.readyOrders,
      holds: board.summary.holds,
      packedWaitingTracking: board.summary.packedWaitingTracking,
      notes,
    };
  } catch {
    return {
      readyOrders: 0,
      holds: 0,
      packedWaitingTracking: 0,
      notes: [],
    };
  }
}

/** Luke actions only for real blockers — not normal pack queue. */
export function buildFulfillmentLukeActionCandidates(
  fulfillment: CeoFulfillmentSnapshot
): ActionCandidate[] {
  if (fulfillment.holds <= 0) return [];
  return [
    {
      priority: 2,
      action: "Clear fulfillment hold(s) on payment-confirmed order(s)",
      why: `${fulfillment.holds} order(s) blocked from packing by reconciliation/hold.`,
      urgency: "This week",
      section: "fulfillment",
    },
  ];
}
