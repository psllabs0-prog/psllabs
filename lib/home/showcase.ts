import { formatReportedPurity, getBatchReportsForProduct } from "@/lib/batch-reports";
import { getActiveCatalogProducts } from "@/lib/products/catalog";

export type HeroShowcaseProduct = {
  handle: string;
  name: string;
  shortLabel: string;
  strength: string;
  href: string;
  imageSrc: string;
  imageAlt: string;
  report: {
    batch: string;
    href: string;
    metric: { label: string; value: string } | null;
  } | null;
};

const shortLabels: Record<string, string> = {
  retatrutide: "Reta",
  "ghk-cu": "GHK-Cu",
  "bpc-157": "BPC-157",
  tesamorelin: "Tesa",
  "reconstitution-solution": "Solution",
};

/** Serialize only the public fields needed by the interactive hero. */
export function getHeroShowcaseProducts(): HeroShowcaseProduct[] {
  return getActiveCatalogProducts().map((product) => {
    const report = getBatchReportsForProduct(product.handle).find(
      (candidate) => candidate.status === "report_available" && candidate.sku === product.sku && Boolean(candidate.reportUrl),
    );
    const metric = report?.purityPercent !== undefined
      ? { label: "Reported purity", value: formatReportedPurity(report.purityPercent) }
      : report?.reportedResult
        ? { label: `Reported ${report.reportedResult.label.toLowerCase()}`, value: report.reportedResult.value }
        : null;

    return {
      handle: product.handle,
      name: product.name,
      shortLabel: shortLabels[product.handle] ?? product.name,
      strength: product.strength,
      href: product.href,
      imageSrc: product.imageSrc,
      imageAlt: product.imageAlt,
      report: report ? { batch: report.batch, href: report.reportUrl, metric } : null,
    };
  });
}
