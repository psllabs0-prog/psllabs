import { selectLukeActions, type ActionCandidate } from "./period";
import type {
  CeoAcquisitionSnapshot,
  CeoHealthSnapshot,
  CeoInventorySnapshot,
  CeoLukeAction,
  CeoSalesSnapshot,
  CeoSeoSnapshot,
  CeoSupportSnapshot,
  CeoWeeklyBrief,
} from "./types";

function buildExecutiveSummary(input: {
  sales: CeoSalesSnapshot;
  inventory: CeoInventorySnapshot;
  support: CeoSupportSnapshot;
  health: CeoHealthSnapshot;
  acquisition: CeoAcquisitionSnapshot;
}): string[] {
  const bullets: string[] = [];
  const { sales, inventory, support, health } = input;

  if (sales.legitimateOrders > 0 || sales.priorLegitimateOrders > 0) {
    const change = sales.revenueChangeNote
      ? ` (${sales.revenueChangeNote})`
      : "";
    bullets.push(
      `Sales: ${sales.legitimateOrders} legitimate orders, $${sales.grossRevenueUsd.toFixed(2)} gross${change}.`
    );
  } else {
    bullets.push("Sales: no legitimate orders in the completed week (or prior).");
  }

  if (sales.reconciliationWarnings.length > 0) {
    bullets.push(
      `Finance: ${sales.reconciliationWarnings.length} open reconciliation warning(s) need review.`
    );
  }

  if (inventory.lowStockAlerts.length > 0) {
    bullets.push(
      `Inventory: ${inventory.lowStockAlerts.length} absolute low-stock alert(s) on sellable stock.`
    );
  } else if (inventory.reorderReviewSignals.length > 0) {
    bullets.push(
      `Inventory: ${inventory.reorderReviewSignals.length} SKU(s) flagged for reorder review (not auto-PO).`
    );
  } else if (inventory.awaitingTestingLots > 0) {
    bullets.push(
      `Inventory: ${inventory.awaitingTestingLots} lot(s) awaiting testing (not sellable).`
    );
  }

  if (support.red > 0 || support.unresolvedEscalations > 0) {
    bullets.push(
      `Support: ${support.red} RED genuine message(s), ${support.unresolvedEscalations} unresolved escalation(s). Spam/vendor excluded from demand.`
    );
  } else if (support.genuineCustomerMessages > 0) {
    bullets.push(
      `Support: ${support.genuineCustomerMessages} genuine customer message(s) (${support.green}G / ${support.yellow}Y / ${support.red}R).`
    );
  }

  if (health.warnings.length > 0) {
    bullets.push(`System: ${health.warnings[0]}`);
  }

  if (input.acquisition.status === "unavailable" && bullets.length < 5) {
    // Only mention if room and nothing more urgent — usually skip vanity.
  }

  return bullets.slice(0, 5);
}

export function buildLukeActionCandidates(input: {
  sales: CeoSalesSnapshot;
  inventory: CeoInventorySnapshot;
  support: CeoSupportSnapshot;
  health: CeoHealthSnapshot;
  acquisition: CeoAcquisitionSnapshot;
  seo: CeoSeoSnapshot;
}): ActionCandidate[] {
  const candidates: ActionCandidate[] = [];

  // 1 legal/regulatory/security/payment
  for (const w of input.sales.reconciliationWarnings.slice(0, 3)) {
    const isPayment =
      /payment|provider|settled|mismatch|currency|duplicate/i.test(
        w.type + w.message
      );
    candidates.push({
      priority: isPayment ? 1 : 4,
      action: `Review finance warning: ${w.type}${w.orderId ? ` (${w.orderId})` : ""}`,
      why: w.message,
      urgency: "This week",
      section: "sales",
    });
  }

  // 2 customer-impacting
  if (input.support.red > 0) {
    candidates.push({
      priority: 2,
      action: "Resolve RED genuine customer support issue(s)",
      why: `${input.support.red} RED-classified customer message(s) in the period require human judgment.`,
      urgency: "Urgent",
      section: "support",
    });
  }
  if (input.support.unresolvedEscalations > 0) {
    candidates.push({
      priority: 2,
      action: "Clear unresolved support escalations",
      why: `${input.support.unresolvedEscalations} open escalation(s) remain in the support queue.`,
      urgency: "Urgent",
      section: "support",
    });
  }
  for (const f of input.support.systemFailures) {
    candidates.push({
      priority: 2,
      action: "Fix support inbox automation failure",
      why: f,
      urgency: "Urgent",
      section: "health",
    });
  }

  // 3 inventory / fulfillment
  if (input.inventory.lowStockAlerts.length > 0) {
    candidates.push({
      priority: 3,
      action: `Address low sellable stock: ${input.inventory.lowStockAlerts[0]}`,
      why: "Absolute low sellable stock risks stockouts. Inbound/testing is not sellable.",
      urgency: "This week",
      section: "inventory",
    });
  }
  if (input.inventory.awaitingTestingLots > 0) {
    candidates.push({
      priority: 3,
      action: "Advance lots awaiting testing toward release (or decide hold)",
      why: `${input.inventory.awaitingTestingLots} received lot(s) await testing (~$250–$500/lot). Do not treat as sellable.`,
      urgency: "This week",
      section: "inventory",
    });
  } else if (input.inventory.reorderReviewSignals.length > 0) {
    candidates.push({
      priority: 3,
      action: `Review reorder signal: ${input.inventory.reorderReviewSignals[0]}`,
      why: "Monitor flagged reorder review — human decision only; MOQ alone is not a PO.",
      urgency: "This week",
      section: "inventory",
    });
  }

  // 4 financial loss / system finance
  for (const w of input.health.warnings) {
    if (/finance|reconcil|sheets sync/i.test(w)) {
      candidates.push({
        priority: 4,
        action: "Investigate finance/system health warning",
        why: w,
        urgency: "This week",
        section: "health",
      });
    }
  }

  // 5 paid acquisition — only if real spend data
  if (
    input.acquisition.status === "available" &&
    input.acquisition.spendUsd != null &&
    input.acquisition.roas != null &&
    input.acquisition.roas < 1
  ) {
    candidates.push({
      priority: 5,
      action: "Review underperforming paid campaigns",
      why: `Observed ROAS ${input.acquisition.roas.toFixed(2)} with spend data present.`,
      urgency: "This week",
      section: "acquisition",
    });
  }

  // 6 conversion / customer intelligence
  for (const hint of input.support.recurringQuestionHints.slice(0, 2)) {
    candidates.push({
      priority: 6,
      action: `Improve site copy/FAQ: ${hint}`,
      why: "Recurring genuine customer questions suggest preventable support load.",
      urgency: null,
      section: "support",
    });
  }

  // 7 SEO — only if real data shows opportunity; never invent
  if (
    input.seo.status === "available" &&
    input.seo.pagesGaining.length > 0
  ) {
    candidates.push({
      priority: 7,
      action: `Review SEO page gaining visibility: ${input.seo.pagesGaining[0]}`,
      why: "Search Console data available for a page with rising visibility.",
      urgency: null,
      section: "seo",
    });
  }

  return candidates;
}

export function composeWeeklyBrief(input: {
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
  generatedAt: string;
  sales: CeoSalesSnapshot;
  acquisition: CeoAcquisitionSnapshot;
  inventory: CeoInventorySnapshot;
  support: CeoSupportSnapshot;
  seo: CeoSeoSnapshot;
  health: CeoHealthSnapshot;
}): CeoWeeklyBrief {
  const actions: CeoLukeAction[] = selectLukeActions(
    buildLukeActionCandidates(input)
  );

  return {
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    periodLabel: input.periodLabel,
    generatedAt: input.generatedAt,
    executiveSummary: buildExecutiveSummary(input),
    sales: input.sales,
    acquisition: input.acquisition,
    inventory: input.inventory,
    support: input.support,
    seo: input.seo,
    health: input.health,
    actions,
  };
}
