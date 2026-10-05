import type { Metadata } from "next";

import { ProductCatalogCard } from "@/components/products/product-catalog-card";
import { ScrollReveal } from "@/components/motion/scroll-reveal";
import { getAvailabilityForCatalogHandles } from "@/lib/inventory/availability";
import {
  getActiveCatalogProducts,
  getComingSoonCatalogProducts,
} from "@/lib/products/catalog";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Products",
  description:
    "Research peptides for laboratory use. Each active product lists specs and a published batch report when available.",
  path: "/products",
});

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const active = getActiveCatalogProducts();
  const comingSoon = getComingSoonCatalogProducts();
  const availabilityMap = await getAvailabilityForCatalogHandles(
    active.map((product) => product.handle)
  ).catch(() => new Map());

  return (
    <main className="public-page-surface">
      <section className="border-b border-linen px-6 py-14 md:px-12 md:py-20 lg:px-16 lg:py-24 xl:px-20">
        <div className="mx-auto max-w-[1440px]">
          <ScrollReveal>
            <div className="flex max-w-4xl flex-col gap-6">
              <p className="mono text-accent">PRODUCT CATALOG</p>
              <h1 className="max-w-[15ch] font-display text-[clamp(2.75rem,5.6vw,5.5rem)] font-semibold leading-[1.02] tracking-[-0.05em] text-ink">
                Research peptides <span className="text-accent">with published lab reports.</span>
              </h1>
              <p className="max-w-2xl text-base leading-[1.7] text-ash md:text-lg">
                Browse materials for laboratory research. Each active product lists specs and a batch report when published. Research use only.
              </p>
            </div>
          </ScrollReveal>
        </div>
      </section>

      <section className="px-6 py-12 md:px-12 md:py-20 lg:px-16 xl:px-20">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-12 md:gap-16">
          <div data-product-catalog className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 lg:gap-8">
            {active.map((product, index) => (
              <ScrollReveal key={product.handle} className="h-full" delayMs={(index % 3) * 70}>
                <ProductCatalogCard
                  product={product}
                  availability={availabilityMap.get(product.handle)}
                />
              </ScrollReveal>
            ))}
          </div>

          {comingSoon.length > 0 && (
            <div id="coming-soon" className="flex scroll-mt-24 flex-col gap-6">
              <ScrollReveal>
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
              </ScrollReveal>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 lg:gap-8">
                {comingSoon.map((product, index) => (
                  <ScrollReveal key={product.handle} className="h-full" delayMs={(index % 3) * 70}>
                    <ProductCatalogCard product={product} />
                  </ScrollReveal>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="border-t border-linen bg-paper px-6 py-10 md:px-16 lg:px-24">
        <ScrollReveal className="mx-auto max-w-[800px]">
          <p className="text-center text-sm leading-relaxed text-ash">
            All products are for laboratory and research use only.
            Not for human or animal consumption. These statements have not been
            evaluated by the FDA.
          </p>
        </ScrollReveal>
      </section>
    </main>
  );
}
