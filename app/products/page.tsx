import type { Metadata } from "next";

import { ProductCatalogCard } from "@/components/products/product-catalog-card";
import { getCatalogProducts } from "@/lib/products/catalog";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Products",
  description:
    "Premium research peptides with third-party HPLC verification, batch-matched COAs, and full laboratory documentation.",
  path: "/products",
});

export default function ProductsPage() {
  const products = getCatalogProducts();

  return (
    <main className="section-surface-ice">
      <section className="border-b border-linen px-6 py-14 md:px-16 md:py-20 lg:px-24 lg:py-24">
        <div className="mx-auto max-w-[1440px]">
          <div className="flex max-w-3xl flex-col gap-5">
            <p className="mono text-biotech-deep/90">PRODUCT CATALOG</p>
            <h1 className="font-display text-display-lg font-bold text-ink">
              Laboratory-grade research compounds.
            </h1>
            <p className="text-body-lg text-ash">
              Each product is released with independent verification, published
              Certificates of Analysis, and complete batch traceability—for
              research use only.
            </p>
          </div>
        </div>
      </section>

      <section className="section-surface-soft px-6 py-12 md:px-16 md:py-20 lg:px-24 lg:py-20">
        <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 lg:gap-8">
          {products.map((product) => (
            <ProductCatalogCard key={product.handle} product={product} />
          ))}
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
