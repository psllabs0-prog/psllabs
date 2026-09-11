import type { CeoSeoSnapshot } from "./types";

/** Search Console / SEO metrics are not synced into Neon yet. */
export function collectSeoSnapshot(): CeoSeoSnapshot {
  return {
    status: "pending",
    message: "External SEO data pending sync.",
    clicks: null,
    impressions: null,
    nonBrandImpressions: null,
    pagesGaining: [],
    queryChanges: [],
  };
}
