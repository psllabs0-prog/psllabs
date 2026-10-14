import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { ProductCatalogCard } from "@/components/products/product-catalog-card";
import { ProductPrice } from "@/components/commerce/product-price";
import type { ProductAvailability } from "@/lib/inventory/availability";
import type { CatalogProduct } from "@/lib/products/catalog";
import styles from "./research-home.module.css";

type AvailableMaterialsSectionProps = { products: CatalogProduct[]; availabilityMap: Map<string, ProductAvailability> };

export function AvailableMaterialsSection({ products, availabilityMap }: AvailableMaterialsSectionProps) {
  const selected = products.slice(0, 3);
  const remaining = products.slice(3);
  return (
    <section id="materials" className={styles.catalogSection}>
      <div className={styles.container}>
        <div className={styles.sectionHeader}>
          <div><p className={styles.eyebrow}>RESEARCH CATALOG</p><h2 className={styles.sectionTitle}>Explore the lineup.</h2></div>
          <Link href="/products" className={styles.textLink}>All products <ArrowUpRight aria-hidden /></Link>
        </div>
        <div className={styles.catalogGrid}>
          {selected.map((product) => <ProductCatalogCard key={product.handle} product={product} availability={availabilityMap.get(product.handle)} headingLevel={3} showDescription />)}
        </div>
        {remaining.length > 0 && <div className={styles.remainingMaterials}><p>Also in the catalog</p><div>{remaining.map((product) => <Link key={product.handle} href={product.href}>{product.name} <ProductPrice handle={product.handle} unitPrice={product.price} size="compact" /><ArrowUpRight aria-hidden /></Link>)}</div></div>}
      </div>
    </section>
  );
}
