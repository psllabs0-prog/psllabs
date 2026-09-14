/**
 * Owner review counting — Luke vs specialist, Ops↔Decision dedupe.
 * Does not delete underlying records; only merges for headline counts.
 */

import type { OpsException } from "@/lib/ops/types";
import type { DecisionOwner, DecisionSignalRow } from "./types";

export function isLukeOwnerAttention(owner: DecisionOwner | string): boolean {
  return owner === "luke" || owner === "regulatory_counsel";
}

export function isSpecialistOwner(owner: DecisionOwner | string): boolean {
  return (
    owner === "content" ||
    owner === "research" ||
    owner === "growth_contractor"
  );
}

export function partitionDecisionSignals(active: DecisionSignalRow[]): {
  lukeDecisions: DecisionSignalRow[];
  specialistActions: DecisionSignalRow[];
  automationHandled: DecisionSignalRow[];
} {
  const lukeDecisions: DecisionSignalRow[] = [];
  const specialistActions: DecisionSignalRow[] = [];
  const automationHandled: DecisionSignalRow[] = [];
  for (const s of active) {
    if (isLukeOwnerAttention(s.recommendedOwner)) lukeDecisions.push(s);
    else if (isSpecialistOwner(s.recommendedOwner)) specialistActions.push(s);
    else automationHandled.push(s);
  }
  return { lukeDecisions, specialistActions, automationHandled };
}

/**
 * Deterministic subsumption: decision signal covers an ops exception.
 * Explicit rules only — no fuzzy unrelated matching.
 */
export function decisionSubsumesOpsException(
  decision: Pick<
    DecisionSignalRow,
    "signalKey" | "signalType" | "area" | "title" | "recommendation"
  >,
  ops: Pick<OpsException, "sourceType" | "sourceId" | "area" | "title">
): boolean {
  const st = ops.sourceType;
  const key = decision.signalKey;
  const typ = decision.signalType;
  const area = decision.area;

  // Finance data quality ↔ finance job / reconciliation / sheets
  if (
    (typ === "DATA_QUALITY" || typ === "SOURCE_UNAVAILABLE") &&
    (area === "data_quality" || area === "finance") &&
    (st === "finance_job_failure" ||
      st === "finance_reconciliation_warning" ||
      st === "finance_sheets_sync")
  ) {
    return key.includes("finance") || /finance/i.test(decision.title);
  }

  // Source stale ↔ matching connector/job ops
  if (typ === "SOURCE_STALE" || typ === "SOURCE_UNAVAILABLE") {
    if (key.includes("meta") && (st === "paid_sync_stale" || st === "paid_connector"))
      return true;
    if (
      key.includes("gsc") &&
      (st === "external_metric_stale" || st === "external_metric_sync")
    )
      return true;
    if (
      key.includes("inventory") &&
      st === "inventory_monitor_stale"
    )
      return true;
    if (key.includes("finance") && st.startsWith("finance_")) return true;
  }

  // Inventory risk ↔ matching SKU reorder review
  if (
    typ === "INVENTORY_DEMAND_RISK" ||
    typ === "TESTING_RELEASE_REVIEW"
  ) {
    if (st === "inventory_reorder_review" || st === "inventory_awaiting_testing") {
      // Match SKU fragment from signal key inventory:risk:SKU
      const sku = key.split(":").pop() ?? "";
      if (sku && (ops.sourceId.includes(sku) || ops.title.includes(sku))) {
        return true;
      }
      // Same area inventory without SKU specificity — only if single-SKU title overlap
      if (sku && ops.area === "inventory" && decision.title.includes(sku)) {
        return true;
      }
    }
  }

  // Fulfillment holds ↔ fulfillment blockers
  if (
    typ === "FULFILLMENT_HOLDS" ||
    typ === "FULFILLMENT_BACKLOG"
  ) {
    if (
      st === "fulfillment_blocked" ||
      st === "fulfillment_unshipped_review" ||
      st === "fulfillment_queue"
    ) {
      return true;
    }
  }

  // Attribution / measurement ↔ paid attribution ops
  if (
    typ === "ATTRIBUTION_MEASUREMENT" ||
    typ === "DATA_CONFLICT" ||
    typ === "PAID_INVENTORY_CONSTRAINT"
  ) {
    if (
      st === "paid_attribution_mismatch" ||
      st === "paid_sync_stale" ||
      st === "learning_budget"
    ) {
      return true;
    }
  }

  // System health multi-failure ↔ ceo brief email / multi system
  if (typ === "SYSTEM_HEALTH_RISK" && (st === "ceo_brief_email" || ops.area === "system")) {
    return true;
  }

  return false;
}

export type OwnerReviewMergeInput = {
  opsExceptions: OpsException[];
  /** Active decision signals that count toward Luke/owner attention only. */
  lukeDecisionSignals: DecisionSignalRow[];
};

export type OwnerReviewMergeResult = {
  opsActiveCount: number;
  decisionActiveCount: number;
  /** Distinct owner items after subsumption. */
  ownerReviewCount: number;
  /** Ops exceptions not subsumed by a Luke decision. */
  uncoveredOpsCount: number;
  subsumedOpsKeys: string[];
};

/**
 * Headline count: each Luke decision + each Ops exception not subsumed by one.
 * Specialist decisions are excluded from ownerReviewCount (shown separately).
 */
export function computeOwnerReviewCount(
  input: OwnerReviewMergeInput
): OwnerReviewMergeResult {
  const opsActive = input.opsExceptions.filter((e) => !e.acknowledged);
  const decisions = input.lukeDecisionSignals;
  const subsumedOpsKeys: string[] = [];

  for (const ops of opsActive) {
    const opsKey = `${ops.sourceType}:${ops.sourceId}`;
    const subsumed = decisions.some((d) =>
      decisionSubsumesOpsException(d, ops)
    );
    if (subsumed) subsumedOpsKeys.push(opsKey);
  }

  const uncoveredOpsCount = opsActive.length - subsumedOpsKeys.length;
  const ownerReviewCount = decisions.length + uncoveredOpsCount;

  return {
    opsActiveCount: opsActive.length,
    decisionActiveCount: decisions.length,
    ownerReviewCount,
    uncoveredOpsCount,
    subsumedOpsKeys,
  };
}
