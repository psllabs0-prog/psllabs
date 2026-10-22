/**
 * Truthful sitemap `lastmod` dates for pages without their own content dates.
 *
 * Google uses lastmod only while it stays consistently and verifiably accurate. So:
 * - Bump a page's date ONLY when that page's own main content, structured data or links change.
 *   Styling-only changes (text size, spacing, colour) do not count.
 * - Never derive dates from build or deploy time, and never bump dates to look fresh.
 * - Use the America/Phoenix calendar date the change went live in production.
 * - Pages not listed here get no lastmod. Guides and science articles carry their own dates.
 */

/**
 * Release date of the changes recorded below. If the merge to production happens on a later
 * date, change this to that America/Phoenix production date before merging.
 */
export const PSL_FIX_RELEASE_DATE = "2026-10-22";

/** Canonical path -> date of the last content, structured-data or link change on that page. */
export const PAGE_LAST_MODIFIED: Readonly<Record<string, string>> = {
  // Compact catalog cards (descriptions off), WebSite JSON-LD.
  "/": PSL_FIX_RELEASE_DATE,
  // Compact catalog cards (descriptions off).
  "/products": PSL_FIX_RELEASE_DATE,
  // Descriptive product-page links on each published report.
  "/coa": PSL_FIX_RELEASE_DATE,
  // Product pages: heading text, Offer shippingDetails; corrected images for Tesamorelin and
  // Reconstitution Solution.
  "/products/psl-rt-10mg": PSL_FIX_RELEASE_DATE,
  "/products/psl-ghkcu-50mg": PSL_FIX_RELEASE_DATE,
  "/products/psl-bpc157-10mg": PSL_FIX_RELEASE_DATE,
  "/products/psl-tesa-10mg": PSL_FIX_RELEASE_DATE,
  "/products/psl-rs-5ml": PSL_FIX_RELEASE_DATE,
  // New per-report pages (lib/batch-reports/report-pages.ts): first published with this release.
  "/coa/janoshik-199788": PSL_FIX_RELEASE_DATE,
  "/coa/janoshik-226454": PSL_FIX_RELEASE_DATE,
  "/coa/janoshik-226456": PSL_FIX_RELEASE_DATE,
  "/coa/janoshik-226457": PSL_FIX_RELEASE_DATE,
};

export function pageLastModified(path: string): string | undefined {
  return PAGE_LAST_MODIFIED[path === "" ? "/" : path];
}
