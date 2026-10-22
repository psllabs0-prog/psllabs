import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, FileText } from "lucide-react";
import { StockStatusBadge } from "@/components/commerce/stock-status-badge";
import { ProductPrice, SaleBadge } from "@/components/commerce/product-price";
import { formatReportedPurity, getBatchReportsForProduct } from "@/lib/batch-reports";
import type { ProductAvailability } from "@/lib/inventory/availability";
import type { CatalogProduct } from "@/lib/products/catalog";
import { getProductCutout, getProductRender } from "@/lib/products/renders";
import { cn } from "@/lib/utils";
import styles from "./product-catalog-card.module.css";

type ProductCatalogCardProps = {
  product: CatalogProduct;
  availability?: ProductAvailability;
  className?: string;
  headingLevel?: 2 | 3;
  showDescription?: boolean;
  /** Only the first catalog image; homepage and later cards remain lazy. */
  imagePriority?: boolean;
  /**
   * Compact listing card (PSL-FIX-20261022): 4:3 image, the research-use badge moves from the
   * image into the card body (same words), "Published batch report" kept above the metric and
   * linked to the original report, stacked buttons, and a horizontal layout on phones.
   * The catalog description shows only when `showDescription` is passed. The /products and home
   * call sites currently leave it off (to restore it, pass showDescription there).
   */
  compact?: boolean;
  /** next/image `sizes` for the compact layout the card is placed in. */
  imageSizes?: string;
  /**
   * "cutout": the transparent render, fitted whole (no crop) on the card stage. Used in the
   * 5-column /products grid, where a cropped studio render clipped the vial cap and base.
   */
  imageVariant?: "studio" | "cutout";
};

const DEFAULT_IMAGE_SIZES = "(max-width: 620px) calc(100vw - 42px), (max-width: 800px) calc(50vw - 32px), (max-width: 1000px) calc(50vw - 47px), (max-width: 1100px) calc(33.333vw - 40px), (max-width: 1376px) calc(33.333vw - 50px), 411px";
const COMPACT_IMAGE_SIZES = "(max-width: 620px) 128px, (max-width: 1000px) calc(50vw - 40px), (max-width: 1376px) calc(33.333vw - 50px), 411px";

export function ProductCatalogCard({ product, availability, className, headingLevel = 2, showDescription = false, imagePriority = false, compact = false, imageSizes, imageVariant = "studio" }: ProductCatalogCardProps) {
  const comingSoon = product.status === "coming_soon";
  const Heading = headingLevel === 3 ? "h3" : "h2";
  const amount = product.strength.replace(/(\d)(mg|ml)$/i, "$1 $2");
  const render = getProductRender(product.handle);
  const cutout = imageVariant === "cutout" ? getProductCutout(product.handle) : undefined;
  const image = cutout ?? render;
  const report = comingSoon ? undefined : getBatchReportsForProduct(product.handle).find(
    (candidate) => candidate.status === "report_available" && candidate.sku === product.sku && Boolean(candidate.reportUrl),
  );
  const metric = report?.purityPercent !== undefined
    ? `${formatReportedPurity(report.purityPercent)} reported purity`
    : report?.reportedResult ? `${report.reportedResult.label}: ${report.reportedResult.value}` : null;

  const researchBadge = <span className={styles.researchBadge}>Research use only</span>;
  const stockBadge = !comingSoon && availability
    ? <StockStatusBadge status={availability.status} available={availability.available} className={cn(styles.stockBadge, availability.status === "out_of_stock" && styles.stockOut)} />
    : null;
  const actions = (
    <div className={styles.cardActions}>
      {comingSoon ? <Link href="/#newsletter" className={styles.buttonSecondary}>Notify me <ArrowUpRight aria-hidden /></Link> : <>
        <Link href={product.href} className={styles.buttonPrimary}>View product <ArrowUpRight aria-hidden /></Link>
        {report ? <a href={report.reportUrl} target="_blank" rel="noopener noreferrer" className={cn(styles.buttonSecondary, styles.labReportButton)} aria-label={`Open ${product.name} batch ${report.batch} original report in a new tab`}><FileText aria-hidden /> Lab report</a> : <Link href="/coa" className={styles.buttonSecondary}>Batch reports</Link>}
      </>}
    </div>
  );
  // Same words as the full card. On compact cards it links to the original report, so the
  // 5-column grid can drop the duplicate "Lab report" button without losing the report link.
  const reportHeading = compact && report
    ? <a href={report.reportUrl} target="_blank" rel="noopener noreferrer" className={cn(styles.reportHeading, styles.reportHeadingLink)} aria-label={`Published batch report for ${product.name} batch ${report.batch} (original report, opens in a new tab)`}><FileText aria-hidden /> Published batch report <ArrowUpRight aria-hidden className={styles.reportHeadingArrow} /></a>
    : <p className={styles.reportHeading}><FileText aria-hidden /> Published batch report</p>;

  return (
    <article data-catalog-product={product.handle} className={cn(styles.productCard, compact && styles.compact, comingSoon && styles.comingSoonCard, className)}>
      {!comingSoon ? (
        <Link href={product.href} aria-label={`View ${product.name}, ${amount}`} className={cn(styles.productStage, render && !cutout && styles.renderStage, cutout && styles.cutoutStage)}>
          {!compact && researchBadge}
          <SaleBadge handle={product.handle} className={styles.saleBadge} />
          <Image src={image?.src ?? product.imageSrc} alt={image?.alt ?? product.imageAlt} fill loading={imagePriority ? "eager" : "lazy"} fetchPriority={imagePriority ? "high" : "auto"} sizes={compact ? (imageSizes ?? COMPACT_IMAGE_SIZES) : DEFAULT_IMAGE_SIZES} />
        </Link>
      ) : <div className={styles.pipelineMarker}>Coming soon</div>}
      <div className={styles.productBody}>
        <div className={styles.productHeading}>
          <Heading>{comingSoon ? product.name : <Link href={product.href}>{product.name}</Link>}</Heading>
          {!comingSoon && <ProductPrice handle={product.handle} unitPrice={product.price} className={styles.price} />}
        </div>
        <p className={styles.productMeta}>{amount} <span>· {product.tag === "LABORATORY REAGENT" ? "Laboratory reagent" : "Research peptide"}</span></p>
        {(showDescription || comingSoon) && <p className={styles.productDescription}>{product.description}</p>}
        {compact && !comingSoon ? <div className={styles.badgeRow}>{researchBadge}{stockBadge}</div> : stockBadge}
        {!comingSoon && <div className={styles.batchSummary}>
          {reportHeading}
          <p className={styles.reportMetric}>{metric ?? (report ? "Original report available" : "Report not yet published")}</p>
          {report && <p className={styles.batchLabel}><span>Batch {report.batch}</span><span className={styles.batchSeparator}> · </span><span>Task {report.taskNumber}</span></p>}
          {report && <p className={styles.testedSample}>Results apply only to the sample tested.</p>}
        </div>}
        {!compact && actions}
      </div>
      {compact && actions}
    </article>
  );
}
