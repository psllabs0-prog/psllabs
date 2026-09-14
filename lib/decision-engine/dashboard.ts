import { sortByPriorityThenConfidence } from "./confidence";
import { getLatestDecisionRun, listDecisionSignals } from "./store";
import {
  getDecisionDigestRecipient,
  isDecisionDailyDigestEnabled,
} from "./thresholds";
import type { DecisionSignalRow } from "./types";
import { collectSystemReadinessMatrix } from "./readiness";
import { partitionDecisionSignals } from "./owner-count";

export function topDecisionSignals(
  signals: DecisionSignalRow[],
  max = 3
): DecisionSignalRow[] {
  const active = signals.filter((s) => s.status === "active");
  return sortByPriorityThenConfidence(active).slice(0, max);
}

export async function buildDecisionDashboard() {
  const [all, lastRun, readiness] = await Promise.all([
    listDecisionSignals({ limit: 100 }),
    getLatestDecisionRun(),
    collectSystemReadinessMatrix(),
  ]);

  const active = all.filter((s) => s.status === "active");
  const acknowledged = all.filter((s) => s.status === "acknowledged");
  const resolved = all.filter((s) => s.status === "resolved").slice(0, 20);
  const dataQuality = active.filter(
    (s) =>
      s.area === "data_quality" ||
      s.signalType.includes("STALE") ||
      s.signalType.includes("DATA_QUALITY") ||
      s.signalType.includes("UNAVAILABLE")
  );
  const { lukeDecisions, specialistActions, automationHandled } =
    partitionDecisionSignals(active);
  const top = topDecisionSignals(all, 3);
  const lukeCount = lukeDecisions.length;

  return {
    headline:
      lukeCount === 0
        ? specialistActions.length > 0
          ? "NO OWNER DECISIONS"
          : "ALL SYSTEMS NORMAL"
        : `LUKE HAS ${lukeCount} DECISION${lukeCount === 1 ? "" : "S"}`,
    lukeDecisionCount: lukeCount,
    lukeDecisions,
    specialistActions,
    automationHandled,
    topDecisions: top,
    active,
    acknowledged,
    recentlyResolved: resolved,
    dataQuality,
    lastRun,
    readiness,
    digest: {
      enabled: isDecisionDailyDigestEnabled(),
      recipientConfigured: Boolean(getDecisionDigestRecipient()),
    },
  };
}
