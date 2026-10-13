import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { getBatchReportsForProduct } from "@/lib/batch-reports";
import { formatPrice } from "@/lib/cart/format";
import { getActiveCatalogProducts } from "@/lib/products/catalog";
import styles from "./research-home.module.css";

export function HeroProductVisual() {
  const products = getActiveCatalogProducts();
  const product = products.find((candidate) => candidate.handle === "retatrutide") ?? products[0];
  if (!product) return null;
  const report = getBatchReportsForProduct(product.handle).find(
    (candidate) => candidate.status === "report_available" && candidate.sku === product.sku && Boolean(candidate.reportUrl),
  );
  const amount = product.strength.replace(/(\d)(mg|ml)$/i, "$1 $2");
  return (
    <div className={styles.featuredProduct}>
      <div className={styles.plateHeader}><span>{product.sku}</span><span>LABORATORY RESEARCH</span></div>
      <Link href={product.href} className={styles.featuredImage} aria-label={`View ${product.name}, ${amount}`}>
        <Image src={product.imageSrc} alt={product.imageAlt} width={390} height={340} sizes="(max-width: 800px) 165px, (max-width: 1100px) 285px, 390px" preload />
      </Link>
      <div className={styles.featuredDetails}>
        <p className={styles.plateLabel}>CATALOG MATERIAL</p>
        <h2><Link href={product.href}>{product.name}</Link></h2>
        <p className={styles.featuredMeta}>{amount} <span>nominal vial amount</span></p>
        <p className={styles.featuredPrice}>{formatPrice(product.price)} <span>/ vial</span></p>
        {report && <p className={styles.plateReport}>Batch {report.batch}<br /><span>Report task {report.taskNumber}</span></p>}
        {report ? (
          <a href={report.reportUrl} className={styles.textLink} target="_blank" rel="noopener noreferrer">Original report <ArrowUpRight aria-hidden /></a>
        ) : (
          <Link href={product.href} className={styles.textLink}>View material <ArrowUpRight aria-hidden /></Link>
        )}
      </div>
      <p className={styles.artworkCaption}>Product artwork · material and label shown</p>
    </div>
  );
}
