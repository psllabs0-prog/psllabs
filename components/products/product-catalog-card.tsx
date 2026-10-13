import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, FileText } from "lucide-react";
import { StockStatusBadge } from "@/components/commerce/stock-status-badge";
import { ProductArtworkNotice } from "@/components/product/product-artwork-notice";
import { formatReportedPurity, getBatchReportsForProduct } from "@/lib/batch-reports";
import { formatPrice } from "@/lib/cart/format";
import type { ProductAvailability } from "@/lib/inventory/availability";
import type { CatalogProduct } from "@/lib/products/catalog";
import { cn } from "@/lib/utils";
import styles from "@/components/home/research-home.module.css";

type ProductCatalogCardProps = {
  product: CatalogProduct;
  availability?: ProductAvailability;
  className?: string;
  headingLevel?: 2 | 3;
  showDescription?: boolean;
};

export function ProductCatalogCard({ product, availability, className, headingLevel = 2, showDescription = false }: ProductCatalogCardProps) {
  const comingSoon = product.status === "coming_soon";
  const Heading = headingLevel === 3 ? "h3" : "h2";
  const amount = product.strength.replace(/(\d)(mg|ml)$/i, "$1 $2");
  const report = comingSoon ? undefined : getBatchReportsForProduct(product.handle).find(
    (candidate) => candidate.status === "report_available" && candidate.sku === product.sku && Boolean(candidate.reportUrl),
  );
  const metric = report?.purityPercent !== undefined
    ? `${formatReportedPurity(report.purityPercent)} reported purity`
    : report?.reportedResult
      ? `${report.reportedResult.label}: ${report.reportedResult.value}`
      : null;

  return (
    <article data-catalog-product={product.handle} className={cn(styles.productCard, comingSoon && styles.comingSoonCard, className)}>
      {!comingSoon && (
        <Link href={product.href} aria-label={`View ${product.name}, ${amount}`} className={styles.productStage}>
          <Image src={product.imageSrc} alt={product.imageAlt} width={160} height={190} sizes="(max-width: 800px) 145px, 160px" />
          <span className={styles.imageCaption}>Existing product artwork</span>
        </Link>
      )}
      <div className={styles.productBody}>
        <div className={styles.productHeading}>
          <div>
            {comingSoon && <p className={styles.eyebrow}>COMING SOON</p>}
            <Heading>{product.name}</Heading>
            <p className={styles.productMeta}>{amount} · {product.tag === "LABORATORY REAGENT" ? "Laboratory reagent" : "Laboratory research"}</p>
          </div>
          {!comingSoon && <p className={styles.price}>{formatPrice(product.price)}</p>}
        </div>
        {(showDescription || comingSoon) && <p className={styles.productDescription}>{product.description}</p>}
        {!comingSoon && availability && (
          <StockStatusBadge status={availability.status} available={availability.available} className={cn(styles.stockBadge, availability.status === "out_of_stock" && styles.stockOut, availability.status === "low_stock" && styles.stockLow)} />
        )}
        {!comingSoon && (
          <div className={styles.batchSummary}>
            <p className={styles.reportMetric}>{metric ?? (report ? "Original batch report available" : "Batch report not yet published")}</p>
            {report && <p className={styles.batchLabel}>Batch {report.batch}</p>}
            {report && <p className={styles.testedSample}>Results apply to the tested sample.</p>}
          </div>
        )}
        <ProductArtworkNotice handle={product.handle} className={styles.labelAlert} />
        {comingSoon ? (
          <Link href="/#newsletter" className={`${styles.button} ${styles.buttonSecondary} ${styles.notifyButton}`}>Notify me</Link>
        ) : (
          <div className={styles.cardActions}>
            <Link href={product.href} className={`${styles.button} ${styles.buttonSecondary}`}>View material</Link>
            {report ? (
              <a href={report.reportUrl} target="_blank" rel="noopener noreferrer" className={styles.textLink} aria-label={`Open ${product.name} batch ${report.batch} original report in a new tab`}><FileText aria-hidden /> Report</a>
            ) : (
              <Link href="/coa" className={styles.textLink}>Batch reports <ArrowUpRight aria-hidden /></Link>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
