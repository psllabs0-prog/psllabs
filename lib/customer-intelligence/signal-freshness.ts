import type { CustomerIntelSignalRow } from "./signals-store";

export type CustomerIntelSnapshotEvidence = {
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  snapshot: Record<string, unknown>;
};

/** Stored signals are historical: scans only upsert themes they actually observe. */
export function signalsForSnapshot(
  signals: CustomerIntelSignalRow[],
  latest: CustomerIntelSnapshotEvidence | null
): CustomerIntelSignalRow[] {
  if (!latest) return [];
  const generated = Date.parse(latest.generatedAt);
  if (!Number.isFinite(generated)) return [];
  const keys = latest.snapshot.signalKeys;
  const recommendations = Array.isArray(latest.snapshot.recommendations)
    ? latest.snapshot.recommendations
    : [];

  return signals.filter((signal) => {
    if (signal.currentCount <= 0) return false;
    const seen = Date.parse(signal.lastSeenAt);
    // A signal changed by a later/incomplete scan must not rewrite this snapshot.
    if (!Number.isFinite(seen) || seen > generated) return false;
    if (Array.isArray(keys)) {
      return (
        keys.includes(signal.signalKey) &&
        signal.evidenceJson.periodStart === latest.periodStart &&
        signal.evidenceJson.periodEnd === latest.periodEnd
      );
    }

    // Older snapshots lack exact keys. Only their recorded recommendations can
    // substantiate a customer signal; never reuse an unmentioned old theme.
    // Same-day freshness also excludes an old matching theme after a long gap.
    const scanDay = latest.generatedAt.slice(0, 10);
    if (new Date(seen).toISOString().slice(0, 10) !== scanDay) return false;
    return signal.evidenceClass === "customer" && recommendations.some((value) => {
      if (!value || typeof value !== "object") return false;
      const rec = value as Record<string, unknown>;
      return rec.evidenceClass === "customer" &&
        rec.theme === signal.theme &&
        rec.recommendation === signal.recommendation &&
        rec.sampleSize === signal.currentCount;
    });
  });
}

export function customerIntelWindowLabel(latest: CustomerIntelSnapshotEvidence): string {
  const start = Date.parse(`${latest.periodStart}T00:00:00Z`);
  const end = Date.parse(`${latest.periodEnd}T00:00:00Z`);
  const days = Math.round((end - start) / 86_400_000) + 1;
  return `${latest.periodStart}–${latest.periodEnd} (${days}-day UTC window)`;
}
