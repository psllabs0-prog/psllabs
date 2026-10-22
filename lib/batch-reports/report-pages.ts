import { getCatalogProductByHandle } from "@/lib/products/catalog";

import { getAvailableBatchReports } from "./index";
import type { BatchReport } from "./types";

/**
 * Per-report landing pages at /coa/<laboratory>-<task>, for example /coa/janoshik-226457.
 * Built only from the published report data in this folder (no new wording or claims).
 *
 * The Reconstitution Solution report is left out on purpose: its report is a benzyl-alcohol
 * test with little search value. Remove it from this set to give it a page.
 */
const EXCLUDED_PRODUCT_HANDLES: ReadonlySet<string> = new Set(["reconstitution-solution"]);

export function reportPageSlug(report: BatchReport): string {
  return `${report.laboratory.toLowerCase()}-${report.taskNumber}`;
}

/** Published reports that get their own page: active catalog product, matching SKU, numeric task. */
export function getReportPageReports(): BatchReport[] {
  return getAvailableBatchReports().filter((report) => {
    const catalog = getCatalogProductByHandle(report.productHandle);
    return !EXCLUDED_PRODUCT_HANDLES.has(report.productHandle) &&
      catalog?.status === "active" && catalog.sku === report.sku &&
      /^[a-z]+$/.test(report.laboratory.toLowerCase()) && /^\d+$/.test(report.taskNumber);
  });
}

export function getReportPageReportBySlug(slug: string): BatchReport | undefined {
  return getReportPageReports().find((report) => reportPageSlug(report) === slug);
}

/** Canonical path of the report's own page, or undefined when it has none. */
export function reportPagePath(report: BatchReport): string | undefined {
  return getReportPageReports().some((candidate) => candidate.taskNumber === report.taskNumber && candidate.laboratory === report.laboratory)
    ? `/coa/${reportPageSlug(report)}`
    : undefined;
}

/** "10mg" -> "10 mg", matching the product pages. */
export function formatLabelAmount(nominalStrength: string): string {
  return nominalStrength.replace(/(\d)(mg|ml)$/i, "$1 $2");
}
