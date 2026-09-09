import { trackPlausibleClientEvent } from "@/lib/plausible/client";

/**
 * Custom analytics events for the PSL Labs analytical testing guide cluster.
 * Tracks user engagement and navigation into documentation and verification funnels.
 */
export function trackGuideView(guideSlug: string): void {
  trackPlausibleClientEvent("analytical_guide_view", {
    guide: guideSlug,
  });
}

export function trackGuideCtaClick(
  target: "coa" | "testing" | "catalog" | "original_report" | "batch_lookup",
  guideSlug: string,
  extraProps?: Record<string, string | number | boolean>
): void {
  const eventName =
    target === "coa"
      ? "guide_to_coa_click"
      : target === "testing"
        ? "guide_to_testing_click"
        : target === "catalog"
          ? "guide_to_product_click"
          : target === "original_report"
            ? "original_report_click"
            : "batch_lookup_click";

  trackPlausibleClientEvent(eventName, {
    guide: guideSlug,
    target,
    ...extraProps,
  });
}

export function trackRelatedGuideClick(
  targetSlug: string,
  sourceSlug: string
): void {
  trackPlausibleClientEvent("related_guide_click", {
    from: sourceSlug,
    to: targetSlug,
  });
}
