import Link from "next/link";
import { ArrowUpRight, FileText } from "lucide-react";
import { ProductCatalogCard } from "@/components/products/product-catalog-card";
import type { ProductAvailability } from "@/lib/inventory/availability";
import type { CatalogProduct } from "@/lib/products/catalog";
import styles from "./research-home.module.css";

type AvailableMaterialsSectionProps = {
  products: CatalogProduct[];
  availabilityMap: Map<string, ProductAvailability>;
};

export function AvailableMaterialsSection({ products, availabilityMap }: AvailableMaterialsSectionProps) {
  return (
    <section id="materials" className={styles.catalogSection}>
      <div className={styles.container}>
        <div className={styles.sectionHeader}>
          <div>
            <h2 className={styles.sectionTitle}>Find your material.</h2>
            <p className={styles.sectionDescription}>Materials for laboratory research, with batch documentation alongside each product.</p>
          </div>
          <Link href="/products" className={styles.textLink}>Full catalog <ArrowUpRight aria-hidden /></Link>
        </div>
        <div className={styles.catalogGrid}>
          {products.map((product) => (
            <ProductCatalogCard key={product.handle} product={product} availability={availabilityMap.get(product.handle)} headingLevel={3} />
          ))}
          <article className={styles.catalogGuide}>
            <FileText aria-hidden />
            <p className={styles.eyebrow}>BEFORE YOU ORDER</p>
            <h3>A percentage is only part of the report.</h3>
            <p>Purity, identity and content answer different questions. Check the original file and its testing scope.</p>
            <Link href="/guides/peptide-identity-vs-purity-vs-content" className={styles.textLink}>Read the guide <ArrowUpRight aria-hidden /></Link>
          </article>
        </div>
      </div>
    </section>
  );
}
