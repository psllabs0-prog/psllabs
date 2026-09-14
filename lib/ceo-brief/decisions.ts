import {
  ensureDecisionEngineSchema,
  listDecisionSignals,
} from "@/lib/decision-engine";
import { sortByPriorityThenConfidence } from "@/lib/decision-engine/confidence";

import type { CeoDecisionSnapshot } from "./types";

export async function collectDecisionSnapshot(): Promise<CeoDecisionSnapshot> {
  try {
    await ensureDecisionEngineSchema();
    const active = await listDecisionSignals({
      statuses: ["active"],
      limit: 30,
    });
    const high = sortByPriorityThenConfidence(
      active.filter((s) => s.priority === "P0" || s.priority === "P1")
    );
    const lukeActions = sortByPriorityThenConfidence(active)
      .slice(0, 3)
      .map((s) => ({
        priority: s.priority,
        action: s.title,
        why: s.recommendation,
        signalKey: s.signalKey,
      }));

    if (high.length === 0 && active.length === 0) {
      return {
        status: "available",
        message: "No high-priority owner decisions this week.",
        lukeActions: [],
        highPriorityCount: 0,
      };
    }

    return {
      status: "available",
      message:
        high.length === 0
          ? "No high-priority owner decisions this week."
          : `${high.length} high-priority (P0/P1) decision signal(s) active.`,
      lukeActions,
      highPriorityCount: high.length,
    };
  } catch {
    return {
      status: "unavailable",
      message: "Decision engine snapshot unavailable.",
      lukeActions: [],
      highPriorityCount: 0,
    };
  }
}
