import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, BookOpen, FileText } from "lucide-react";
import { StockStatusBadge } from "@/components/commerce/stock-status-badge";
import { ScrollReveal } from "@/components/motion/scroll-reveal";
import { formatPrice } from "@/lib/cart/format";
import { formatReportedPurity, getBatchReportsForProduct } from "@/lib/batch-reports";
import { homeProductCode } from "@/lib/home/product-display";
import type { ProductAvailability } from "@/lib/inventory/availability";
import type { CatalogProduct } from "@/lib/products/catalog";
import styles from "./research-home.module.css";

type AvailableMaterialsSectionProps = {
  products: CatalogProduct[];
  availabilityMap: Map<string, ProductAvailability>;
};

export function AvailableMaterialsSection({ products, availabilityMap }: AvailableMaterialsSectionProps) {
  return (
    <section id="materials" className={styles.section}>
      <div className={styles.container}>
        <ScrollReveal>
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.eyebrow}>THE CATALOG / LABORATORY USE ONLY</p>
              <h2 className={styles.sectionTitle}>Find your material.</h2>
              <p className={styles.sectionDescription}>The compound, vial size, and price are always in view. Open the report to check the tested sample.</p>
            </div>
            <Link href="/products" className={styles.textLink}>Full catalog <ArrowUpRight className="size-4" aria-hidden /></Link>
          </div>
        </ScrollReveal>
        <div className={styles.catalogGrid}>
          {products.map((product, index) => {
            const availability = availabilityMap.get(product.handle);
            const report = getBatchReportsForProduct(product.handle).find((candidate) => candidate.status === "report_available" && candidate.sku === product.sku && Boolean(candidate.reportUrl));
            const metric = report?.purityPercent !== undefined
              ? `${formatReportedPurity(report.purityPercent)} reported purity`
              : report?.reportedResult
                ? `${report.reportedResult.label}: ${report.reportedResult.value}`
                : null;
            return (
              <ScrollReveal key={product.handle} className="h-full" delayMs={(index % 3) * 70}>
                <article className={styles.productCard}>
                  <Link href={product.href} aria-label={`View ${product.name}, ${product.strength}`} className={`${styles.productStage} ${styles[`tone${index % 5}`]}`}>
                    <span className={styles.stageCode} aria-hidden>{homeProductCode(product.handle)}</span>
                    <span className={styles.stageSize}>{product.strength}</span>
                    <div className={styles.vialImage}>
                      <Image src={product.imageSrc} alt={product.imageAlt} fill sizes="(max-width: 639px) 85vw, (max-width: 1023px) 42vw, 380px" className="object-contain" />
                    </div>
                    <span className={styles.stageCaption}>Research use only <ArrowUpRight className="size-4" aria-hidden /></span>
                  </Link>
                  <div className={styles.productBody}>
                    <div className={styles.productHeading}>
                      <div><p className={styles.productCode}>{homeProductCode(product.handle)}</p><h3>{product.name}</h3></div>
                      <p className={styles.price}>{formatPrice(product.price)}<span>USD / {product.strength}</span></p>
                    </div>
                    <div className={styles.productStatus}>
                      {availability ? <StockStatusBadge status={availability.status} available={availability.available} /> : null}
                      <span>{report ? "Batch report available" : "Report pending"}</span>
                    </div>
                    <p className={styles.reportMetric}>{metric ?? "Check product details for documentation."}{report ? <small>Batch {report.batch} · tested sample</small> : null}</p>
                    <div className={styles.cardActions}>
                      <Link href={product.href} className={styles.cardPrimary}>View material <ArrowUpRight className="size-4" aria-hidden /></Link>
                      {report ? <a href={report.reportUrl} target="_blank" rel="noopener noreferrer" className={styles.cardSecondary} aria-label={`Open ${product.name} batch ${report.batch} lab report in a new tab`}><FileText className="size-4" aria-hidden /> Report</a> : <Link href="/coa" className={styles.cardSecondary}>Batch reports</Link>}
                    </div>
                  </div>
                </article>
              </ScrollReveal>
            );
          })}
          <ScrollReveal className="h-full" delayMs={140}>
            <article className={styles.catalogGuide}>
              <BookOpen className="size-9 text-accent" aria-hidden />
              <p className={styles.eyebrow}>BEFORE YOU ORDER</p>
              <h3>A percentage is only part of the report.</h3>
              <p>Purity, identity, and content answer different questions. Learn what each result tells you, and what it leaves out.</p>
              <Link href="/guides/peptide-identity-vs-purity-vs-content" className={styles.textLink}>Read the guide <ArrowUpRight className="size-4" aria-hidden /></Link>
            </article>
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
}
