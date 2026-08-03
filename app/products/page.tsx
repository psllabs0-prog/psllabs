import type { Metadata } from "next";

import { ProductCatalogCard } from "@/components/products/product-catalog-card";
import {
  getActiveCatalogProducts,
  getComingSoonCatalogProducts,
} from "@/lib/products/catalog";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Products",
  description:
    "Research peptides with published batch documentation for selected lots. Laboratory reports available when published.",
  path: "/products",
});

export default function ProductsPage() {
  const active = getActiveCatalogProducts();
  const comingSoon = getComingSoonCatalogProducts();

  return (
    <main className="bg-paper">
      <section className="border-b border-linen px-6 py-14 md:px-16 md:py-20 lg:px-24 lg:py-24">
        <div className="mx-auto max-w-[1440px]">
          <div className="flex max-w-3xl flex-col gap-5">
            <p className="mono text-accent">PRODUCT CATALOG</p>
            <h1 className="font-display text-display-lg font-bold text-ink">
              Laboratory-grade research compounds.
            </h1>
            <p className="text-body-lg text-ash">
              Each product includes disclosed specifications and batch
              documentation when published—for research use only. Testing scope
              and results are shown on each original laboratory report.
            </p>
          </div>
        </div>
      </section>

      <section className="bg-paper px-6 py-12 md:px-16 md:py-20 lg:px-24 lg:py-20">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-12 md:gap-16">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 lg:gap-8">
            {active.map((product) => (
              <ProductCatalogCard key={product.handle} product={product} />
            ))}
          </div>

          {comingSoon.length > 0 && (
            <div id="coming-soon" className="flex scroll-mt-24 flex-col gap-6">
              <div className="border-t border-linen pt-10 md:pt-12">
                <p className="mono text-ash">PIPELINE</p>
                <h2 className="mt-2 font-display text-2xl font-bold text-ink md:text-3xl">
                  Coming Soon
                </h2>
                <p className="mt-2 max-w-2xl text-sm text-ash md:text-base">
                  Additional research compounds in preparation. Join the
                  newsletter to hear when batch documentation and inventory are
                  available.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 lg:gap-8">
                {comingSoon.map((product) => (
                  <ProductCatalogCard key={product.handle} product={product} />
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="border-t border-linen bg-paper px-6 py-10 md:px-16 lg:px-24">
        <p className="mx-auto max-w-[720px] text-center text-sm leading-relaxed text-ash">
          All products are sold strictly for laboratory and research use only.
          Not for human or animal consumption. These statements have not been
          evaluated by the FDA.
        </p>
      </section>
    </main>
  );
}
