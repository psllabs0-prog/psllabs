import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, FileText } from "lucide-react";
import { StockStatusBadge } from "@/components/commerce/stock-status-badge";
import { ProductPrice, SaleBadge } from "@/components/commerce/product-price";
import { formatReportedPurity, getBatchReportsForProduct } from "@/lib/batch-reports";
import type { ProductAvailability } from "@/lib/inventory/availability";
import type { CatalogProduct } from "@/lib/products/catalog";
import { getProductRender } from "@/lib/products/renders";
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
};

export function ProductCatalogCard({ product, availability, className, headingLevel = 2, showDescription = false, imagePriority = false }: ProductCatalogCardProps) {
  const comingSoon = product.status === "coming_soon";
  const Heading = headingLevel === 3 ? "h3" : "h2";
  const amount = product.strength.replace(/(\d)(mg|ml)$/i, "$1 $2");
  const render = getProductRender(product.handle);
  const report = comingSoon ? undefined : getBatchReportsForProduct(product.handle).find(
    (candidate) => candidate.status === "report_available" && candidate.sku === product.sku && Boolean(candidate.reportUrl),
  );
  const metric = report?.purityPercent !== undefined
    ? `${formatReportedPurity(report.purityPercent)} reported purity`
    : report?.reportedResult ? `${report.reportedResult.label}: ${report.reportedResult.value}` : null;

  return (
    <article data-catalog-product={product.handle} className={cn(styles.productCard, comingSoon && styles.comingSoonCard, className)}>
      {!comingSoon ? (
        <Link href={product.href} aria-label={`View ${product.name}, ${amount}`} className={cn(styles.productStage, render && styles.renderStage)}>
          <span className={styles.researchBadge}>Research use only</span>
          <SaleBadge handle={product.handle} className={styles.saleBadge} />
          <Image src={render?.src ?? product.imageSrc} alt={render?.alt ?? product.imageAlt} fill loading={imagePriority ? "eager" : "lazy"} fetchPriority={imagePriority ? "high" : "auto"} sizes="(max-width: 620px) calc(100vw - 42px), (max-width: 800px) calc(50vw - 32px), (max-width: 1000px) calc(50vw - 47px), (max-width: 1100px) calc(33.333vw - 40px), (max-width: 1376px) calc(33.333vw - 50px), 411px" />
        </Link>
      ) : <div className={styles.pipelineMarker}>Coming soon</div>}
      <div className={styles.productBody}>
        <div className={styles.productHeading}>
          <Heading>{comingSoon ? product.name : <Link href={product.href}>{product.name}</Link>}</Heading>
          {!comingSoon && <ProductPrice handle={product.handle} unitPrice={product.price} className={styles.price} />}
        </div>
        <p className={styles.productMeta}>{amount} <span>· {product.tag === "LABORATORY REAGENT" ? "Laboratory reagent" : "Research peptide"}</span></p>
        {(showDescription || comingSoon) && <p className={styles.productDescription}>{product.description}</p>}
        {!comingSoon && availability && <StockStatusBadge status={availability.status} available={availability.available} className={cn(styles.stockBadge, availability.status === "out_of_stock" && styles.stockOut)} />}
        {!comingSoon && <div className={styles.batchSummary}>
          <p className={styles.reportHeading}><FileText aria-hidden /> Published batch report</p>
          <p className={styles.reportMetric}>{metric ?? (report ? "Original report available" : "Report not yet published")}</p>
          {report && <p className={styles.batchLabel}>Batch {report.batch} · Task {report.taskNumber}</p>}
          {report && <p className={styles.testedSample}>Results apply only to the sample tested.</p>}
        </div>}
        <div className={styles.cardActions}>
          {comingSoon ? <Link href="/#newsletter" className={styles.buttonSecondary}>Notify me <ArrowUpRight aria-hidden /></Link> : <>
            <Link href={product.href} className={styles.buttonPrimary}>View product <ArrowUpRight aria-hidden /></Link>
            {report ? <a href={report.reportUrl} target="_blank" rel="noopener noreferrer" className={styles.buttonSecondary} aria-label={`Open ${product.name} batch ${report.batch} original report in a new tab`}><FileText aria-hidden /> Lab report</a> : <Link href="/coa" className={styles.buttonSecondary}>Batch reports</Link>}
          </>}
        </div>
      </div>
    </article>
  );
}
