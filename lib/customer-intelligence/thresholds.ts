function envInt(key: string, fallback: number): number {
  const raw = process.env[key]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export function getCustomerIntelMinSignalCount(): number {
  return envInt("CUSTOMER_INTEL_MIN_SIGNAL_COUNT", 3);
}

export function getCustomerIntelMinTrendCount(): number {
  return envInt("CUSTOMER_INTEL_MIN_TREND_COUNT", 5);
}

import type { CiConfidence, CiSignalStatus } from "./taxonomy";

export function confidenceFromCounts(input: {
  currentCount: number;
  priorCount: number;
  sampleSize: number;
}): CiConfidence {
  const minSignal = getCustomerIntelMinSignalCount();
  const minTrend = getCustomerIntelMinTrendCount();
  const { currentCount, sampleSize } = input;

  if (currentCount < 1 || sampleSize < 1) return "insufficient";
  if (currentCount < minSignal) return "insufficient";
  if (currentCount < minTrend) return "early_signal";
  if (currentCount >= minTrend * 2 && sampleSize >= minTrend) return "strong";
  return "meaningful";
}

export function statusFromConfidence(
  confidence: CiConfidence,
  previousStatus?: CiSignalStatus | null
): CiSignalStatus {
  if (previousStatus === "resolved" || previousStatus === "dismissed") {
    return previousStatus;
  }
  if (previousStatus === "watch") return "watch";
  if (confidence === "insufficient") return "early";
  if (confidence === "early_signal") return "early";
  return "validated";
}

/** Format evidence without fake percentages from tiny denominators. */
export function formatEvidenceNote(input: {
  currentCount: number;
  priorCount: number | null;
  label: string;
  confidence: CiConfidence;
}): string {
  const prior =
    input.priorCount == null
      ? "prior period unavailable"
      : `${input.priorCount} prior`;
  const sampleNote =
    input.confidence === "insufficient" || input.confidence === "early_signal"
      ? "early signal, sample still small"
      : `${input.confidence} pattern`;
  return `${input.currentCount} ${input.label} this period vs ${prior}; ${sampleNote}.`;
}
