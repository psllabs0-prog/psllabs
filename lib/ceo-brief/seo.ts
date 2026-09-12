import type { BriefPeriod } from "./period";
import type { CeoSeoSnapshot } from "./types";

const PENDING: CeoSeoSnapshot = {
  status: "pending",
  message: "External SEO data pending sync.",
  clicks: null,
  impressions: null,
  nonBrandImpressions: null,
  nonBrandClicks: null,
  ctr: null,
  averagePosition: null,
  priorClicks: null,
  priorImpressions: null,
  clicksChangeNote: null,
  impressionsChangeNote: null,
  pagesGaining: [],
  queryChanges: [],
  materialOpportunity: false,
};

/** Async collector used by weekly brief generation. */
export async function collectSeoSnapshot(
  period?: BriefPeriod,
  prior?: BriefPeriod
): Promise<CeoSeoSnapshot> {
  if (!period || !prior) return { ...PENDING };
  try {
    const { collectSeoSnapshotFromStore } = await import(
      "@/lib/external-metrics/seo-brief"
    );
    return await collectSeoSnapshotFromStore(period, prior);
  } catch {
    return { ...PENDING };
  }
}
