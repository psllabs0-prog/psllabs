import { selectLukeActions, type ActionCandidate } from "./period";
import { buildInventoryLukeActionCandidates } from "./inventory";
import { buildFulfillmentLukeActionCandidates } from "./fulfillment";
import type {
  CeoAcquisitionSnapshot,
  CeoFulfillmentSnapshot,
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
  seo?: CeoSeoSnapshot;
  fulfillment?: CeoFulfillmentSnapshot;
}): string[] {
  const bullets: string[] = [];
  const { sales, inventory, support, health, fulfillment, acquisition, seo } =
    input;

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
      `Inventory: ${inventory.lowStockAlerts.length} absolute low-stock alert(s) on sellable stock (inbound noted separately; not auto-actioned).`
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
      `Support: ${support.red} RED genuine message(s); ${support.unresolvedEscalationsLabel.toLowerCase()}: ${support.unresolvedEscalations}. Spam/vendor/TEST excluded.`
    );
  } else if (support.genuineCustomerMessages > 0) {
    bullets.push(
      `Support: ${support.genuineCustomerMessages} genuine customer message(s) (${support.green}G / ${support.yellow}Y / ${support.red}R).`
    );
  }

  for (const note of fulfillment?.notes ?? []) {
    bullets.push(`Fulfillment: ${note}`);
  }

  if (
    acquisition.status === "available" &&
    acquisition.spendUsd != null &&
    acquisition.spendUsd > 0
  ) {
    bullets.push(
      `Paid: $${acquisition.spendUsd.toFixed(2)} spend · ${acquisition.attributedOrders ?? 0} attributed orders · $${(acquisition.attributedRevenueUsd ?? 0).toFixed(2)} revenue · CAC ${acquisition.cacUsd == null ? "—" : `$${acquisition.cacUsd.toFixed(2)}`} · ROAS ${acquisition.roas == null ? "—" : acquisition.roas.toFixed(2)}.`
    );
  }

  if (
    seo?.status === "available" &&
    seo.materialOpportunity &&
    seo.pagesGaining.length > 0
  ) {
    bullets.push(`SEO: material traction on ${seo.pagesGaining[0]}.`);
  }

  if (health.warnings.length > 0) {
    bullets.push(`System: ${health.warnings[0]}`);
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
  fulfillment?: CeoFulfillmentSnapshot;
}): ActionCandidate[] {
  const candidates: ActionCandidate[] = [];

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
      action: "Clear current legitimate unresolved support escalations",
      why: `${input.support.unresolvedEscalationsLabel}: ${input.support.unresolvedEscalations}.`,
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

  if (input.fulfillment) {
    candidates.push(...buildFulfillmentLukeActionCandidates(input.fulfillment));
  }

  candidates.push(...buildInventoryLukeActionCandidates(input.inventory));

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

  if (
    input.acquisition.status === "available" &&
    input.acquisition.spendUsd != null &&
    input.acquisition.roas != null &&
    input.acquisition.roas < 1 &&
    (input.acquisition.attributedOrders ?? 0) > 0 &&
    // Never scale/pause from tiny samples; only review when thresholds configured elsewhere
    // and winners array already indicates meaningful sample.
    input.acquisition.winners.length > 0
  ) {
    candidates.push({
      priority: 5,
      action: "Review paid campaigns with weak ROAS (measurement-aware)",
      why: `Observed ROAS ${input.acquisition.roas.toFixed(2)} with enough comparative sample for a review signal — not an auto scale/pause.`,
      urgency: "This week",
      section: "acquisition",
    });
  } else if (
    (input.acquisition.measurementWarnings?.length ?? 0) > 0 &&
    input.acquisition.status === "available" &&
    (input.acquisition.spendUsd ?? 0) > 0
  ) {
    candidates.push({
      priority: 5,
      action: "Review paid measurement warnings",
      why: input.acquisition.measurementWarnings![0],
      urgency: null,
      section: "acquisition",
    });
  }

  for (const hint of input.support.recurringQuestionHints.slice(0, 2)) {
    candidates.push({
      priority: 6,
      action: `Improve site copy/FAQ: ${hint}`,
      why: "Recurring genuine customer questions suggest preventable support load.",
      urgency: null,
      section: "support",
    });
  }

  if (
    input.seo.status === "available" &&
    input.seo.materialOpportunity &&
    input.seo.pagesGaining.length > 0
  ) {
    candidates.push({
      priority: 7,
      action: `Review SEO page gaining visibility: ${input.seo.pagesGaining[0]}`,
      why: "Material non-brand Search Console gains cleared the minimum-volume bar.",
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
  fulfillment?: CeoFulfillmentSnapshot;
}): CeoWeeklyBrief {
  const actions: CeoLukeAction[] = selectLukeActions(
    buildLukeActionCandidates(input)
  );

  return {
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    periodLabel: input.periodLabel,
    generatedAt: input.generatedAt,
    executiveSummary: buildExecutiveSummary({
      ...input,
      seo: input.seo,
    }),
    sales: input.sales,
    acquisition: input.acquisition,
    inventory: input.inventory,
    support: input.support,
    seo: input.seo,
    health: input.health,
    fulfillment: input.fulfillment,
    actions,
  };
}
