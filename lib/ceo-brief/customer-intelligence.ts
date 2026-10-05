import { listCustomerIntelSignals } from "@/lib/customer-intelligence/signals-store";
import { getLatestCustomerIntelSnapshot } from "@/lib/customer-intelligence/signals-store";
import { ensureCustomerIntelligenceSchema } from "@/lib/customer-intelligence/schema";
import { getCustomerIntelMinSignalCount } from "@/lib/customer-intelligence/thresholds";
import {
  customerIntelWindowLabel,
  signalsForSnapshot,
  type CustomerIntelSnapshotEvidence,
} from "@/lib/customer-intelligence/signal-freshness";
import type { CustomerIntelSignalRow } from "@/lib/customer-intelligence/signals-store";

import type { CeoCustomerIntelligenceSnapshot } from "./types";

export async function collectCustomerIntelligenceSnapshot(): Promise<CeoCustomerIntelligenceSnapshot> {
  try {
    await ensureCustomerIntelligenceSchema();
    const [signals, latest] = await Promise.all([
      listCustomerIntelSignals({ limit: 50 }),
      getLatestCustomerIntelSnapshot(),
    ]);

    return summarizeCustomerIntelligence(signals, latest);
  } catch {
    return {
      status: "unavailable",
      message: "Insufficient customer intelligence evidence for a CEO note.",
      highlights: [],
      lukeAction: null,
    };
  }
}

/** Current scan evidence, never the all-time set of stored signal rows. */
export function summarizeCustomerIntelligence(
  signals: CustomerIntelSignalRow[],
  latest: CustomerIntelSnapshotEvidence | null
): CeoCustomerIntelligenceSnapshot {
  if (!latest) {
    return { status: "unavailable", message: "Customer intelligence scan unavailable.", highlights: [], lukeAction: null };
  }
  const window = customerIntelWindowLabel(latest);
  const currentSignals = signalsForSnapshot(signals, latest);
  const materialCustomer = currentSignals.filter(
    (s) =>
      s.evidenceClass === "customer" &&
      s.status !== "dismissed" &&
      s.status !== "resolved" &&
      s.theme !== "restricted_human_use_request" &&
      s.currentCount >= getCustomerIntelMinSignalCount()
  );

  const community = currentSignals.filter(
    (s) =>
      s.evidenceClass === "community" &&
      s.status !== "dismissed" &&
      s.status !== "resolved" &&
      s.currentCount >= getCustomerIntelMinSignalCount()
  );

  if (materialCustomer.length === 0 && community.length === 0) {
    const health = latest.snapshot.evidenceHealth as Record<string, unknown> | undefined;
    if (health?.supportCurrent === 0 && health?.feedbackCurrent === 0) {
      const message = `No qualifying customer support or post-order feedback observations recorded in ${window}.`;
      return { status: "available", message, highlights: [message], lukeAction: null };
    }
    return {
      status: "unavailable",
      message: `Insufficient current customer intelligence evidence in ${window}.`,
      highlights: [],
      lukeAction: null,
    };
  }

  const highlights: string[] = [];
  const evidenceNote = (s: CustomerIntelSignalRow) => {
    const countLabel = s.sourceChannel === "support" ? "support messages" : "customer observations";
    const confidence = s.confidenceLevel === "early_signal" ? "early signal, sample still small" : `${s.confidenceLevel} pattern`;
    return `${s.currentCount} ${countLabel} classified as ${s.theme.replace(/_/g, " ")} during ${window}; ${s.priorCount} in the prior scan window; ${confidence}.`;
  };
  for (const s of materialCustomer.slice(0, 2)) {
    highlights.push(evidenceNote(s));
  }
  for (const s of community.slice(0, 1)) {
    highlights.push(
      `${s.currentCount} community questions about ${s.theme.replace(/_/g, " ")} during ${window} (community evidence, not customer sample).`
    );
  }

  const top = materialCustomer[0];
  const lukeAction =
    top &&
    (top.confidenceLevel === "meaningful" ||
      top.confidenceLevel === "strong" ||
      top.confidenceLevel === "early_signal") &&
    top.recommendation
      ? {
          action: `Review customer intelligence: ${top.recommendation}`,
          why: evidenceNote(top),
        }
      : null;

  return {
    status: "available",
    message: `Customer intelligence covers ${window}.`,
    highlights,
    lukeAction,
  };
}
