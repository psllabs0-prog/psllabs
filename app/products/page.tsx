import type { Metadata } from "next";
import { ProductCatalogCard } from "@/components/products/product-catalog-card";
import { getAvailabilityForCatalogHandles } from "@/lib/inventory/availability";
import { getActiveCatalogProducts, getComingSoonCatalogProducts } from "@/lib/products/catalog";
import { createPageMetadata } from "@/lib/seo";
import styles from "@/components/home/research-home.module.css";

export const metadata: Metadata = createPageMetadata({
  title: "Research Peptides and Laboratory Materials",
  description: "Browse PSL Labs research peptides and laboratory materials. Compare vial sizes, current prices and published Janoshik batch reports. Laboratory research only.",
  path: "/products",
});

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const active = getActiveCatalogProducts();
  const comingSoon = getComingSoonCatalogProducts();
  const availabilityMap = await getAvailabilityForCatalogHandles(
    active.map((product) => product.handle),
  ).catch(() => new Map());

  return (
    <main className={styles.catalogPage}>
      <section className={styles.catalogHeader}>
        <div className={styles.container}>
          <p className={styles.eyebrow}>PRODUCT CATALOG</p>
          <h1 className={styles.catalogTitle}>Research peptides<br /><span>with published lab reports.</span></h1>
          <p className={styles.catalogIntro}>Browse materials for laboratory research. Each active product lists specs and a batch report when published. Research use only.</p>
        </div>
      </section>
      <section className={styles.catalogPageSection}>
        <div className={styles.container}>
          <div data-product-catalog className={styles.catalogGrid}>
            {active.map((product) => (
              <ProductCatalogCard key={product.handle} product={product} availability={availabilityMap.get(product.handle)} showDescription />
            ))}
          </div>
          {comingSoon.length > 0 && (
            <section id="coming-soon" className={styles.pipeline}>
              <div className={styles.pipelineHeader}>
                <p className={styles.eyebrow}>PIPELINE</p>
                <h2>Coming soon</h2>
                <p>Additional research compounds in preparation. Join the newsletter to hear when batch documentation and inventory are available.</p>
              </div>
              <div className={styles.catalogGrid}>
                {comingSoon.map((product) => <ProductCatalogCard key={product.handle} product={product} headingLevel={3} />)}
              </div>
            </section>
          )}
        </div>
      </section>
      <section className={styles.catalogDisclaimer}>
        <div className={styles.container}>
          <p>All products are for laboratory and research use only. Not for human or animal consumption. These statements have not been evaluated by the FDA.</p>
        </div>
      </section>
    </main>
  );
}
