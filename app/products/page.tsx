import type { Metadata } from "next";
import { ProductCatalogCard } from "@/components/products/product-catalog-card";
import { JsonLd } from "@/components/seo/json-ld";
import { SiteBreadcrumbs } from "@/components/seo/site-breadcrumbs";
import { getAvailabilityForCatalogHandles } from "@/lib/inventory/availability";
import { getActiveCatalogProducts, getComingSoonCatalogProducts } from "@/lib/products/catalog";
import { createPageMetadata, SITE_URL } from "@/lib/seo";
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
      <JsonLd data={{
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        "@id": `${SITE_URL}/products#catalog`,
        name: "PSL Labs research materials catalog",
        url: `${SITE_URL}/products`,
        description: "Research peptides and laboratory materials with vial sizes, prices and original batch documentation. For laboratory research only.",
        mainEntity: {
          "@type": "ItemList",
          numberOfItems: active.length,
          itemListOrder: "https://schema.org/ItemListUnordered",
          itemListElement: active.map((product, index) => ({
            "@type": "ListItem",
            position: index + 1,
            name: `${product.name} ${product.strength}`,
            url: `${SITE_URL}${product.href}`,
          })),
        },
      }} />
      <section className={styles.catalogHeader}>
        <div className={styles.container}>
          <SiteBreadcrumbs items={[{ name: "Home", path: "/" }, { name: "Products", path: "/products" }]} />
          <p className={styles.eyebrow}>PRODUCT CATALOG</p>
          <h1 className={styles.catalogTitle}>Research peptides<br /><span>with published lab reports.</span></h1>
          <p className={styles.catalogIntro}>Browse materials for laboratory research. Each active product lists specs and a batch report when published. Research use only.</p>
        </div>
      </section>
      <section className={styles.catalogPageSection}>
        <div className={styles.container}>
          <div data-product-catalog className={styles.catalogGrid}>
            {active.map((product, index) => (
              <ProductCatalogCard key={product.handle} product={product} availability={availabilityMap.get(product.handle)} imagePriority={index === 0} showDescription />
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
