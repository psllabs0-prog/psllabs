import { listCustomerIntelSignals } from "@/lib/customer-intelligence/signals-store";
import { getLatestCustomerIntelSnapshot } from "@/lib/customer-intelligence/signals-store";
import { ensureCustomerIntelligenceSchema } from "@/lib/customer-intelligence/schema";
import { getCustomerIntelMinSignalCount } from "@/lib/customer-intelligence/thresholds";

import type { CeoCustomerIntelligenceSnapshot } from "./types";

export async function collectCustomerIntelligenceSnapshot(): Promise<CeoCustomerIntelligenceSnapshot> {
  try {
    await ensureCustomerIntelligenceSchema();
    const [signals, latest] = await Promise.all([
      listCustomerIntelSignals({ limit: 50 }),
      getLatestCustomerIntelSnapshot(),
    ]);

    const materialCustomer = signals.filter(
      (s) =>
        s.evidenceClass === "customer" &&
        s.status !== "dismissed" &&
        s.status !== "resolved" &&
        s.theme !== "restricted_human_use_request" &&
        s.currentCount >= getCustomerIntelMinSignalCount()
    );

    const community = signals.filter(
      (s) =>
        s.evidenceClass === "community" &&
        s.status !== "dismissed" &&
        s.currentCount >= getCustomerIntelMinSignalCount()
    );

    if (materialCustomer.length === 0 && community.length === 0) {
      return {
        status: "unavailable",
        message: "Insufficient customer intelligence evidence for a CEO note.",
        highlights: [],
        lukeAction: null,
      };
    }

    const highlights: string[] = [];
    for (const s of materialCustomer.slice(0, 2)) {
      highlights.push(
        String(
          s.evidenceJson.note ??
            `${s.currentCount} legitimate ${s.theme.replace(/_/g, " ")} observations; ${s.confidenceLevel}.`
        )
      );
    }
    for (const s of community.slice(0, 1)) {
      highlights.push(
        `${s.currentCount} community questions about ${s.theme.replace(/_/g, " ")} (community evidence, not customer sample).`
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
            why: String(top.evidenceJson.note ?? top.theme),
          }
        : null;

    return {
      status: "available",
      message: latest
        ? `Customer intelligence through ${latest.periodEnd}.`
        : "Customer intelligence signals present.",
      highlights,
      lukeAction,
    };
  } catch {
    return {
      status: "unavailable",
      message: "Insufficient customer intelligence evidence for a CEO note.",
      highlights: [],
      lukeAction: null,
    };
  }
}
