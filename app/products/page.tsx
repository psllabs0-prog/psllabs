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
    <main className="bg-gradient-to-b from-paper via-lab-white to-biotech-mist/30">
      {/* Catalog header */}
      <section className="border-b border-linen px-6 py-20 md:px-16 md:py-28 lg:px-24 lg:py-32">
        <div className="mx-auto max-w-[1440px]">
          <div className="flex max-w-3xl flex-col gap-6">
            <p className="mono text-biotech-deep/80">PRODUCT CATALOG</p>
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

      {/* Product grid */}
      <section className="px-6 py-16 md:px-16 md:py-24 lg:px-24 lg:py-32">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-16 lg:gap-24">
          {products.map((product) => (
            <ProductCatalogCard key={product.handle} product={product} />
          ))}
        </div>
      </section>

      {/* Footer note */}
      <section className="border-t border-linen px-6 py-12 md:px-16 lg:px-24">
        <p className="mx-auto max-w-[720px] text-center text-sm leading-relaxed text-ash">
          All products are sold strictly for laboratory and research use only.
          Not for human or animal consumption. These statements have not been
          evaluated by the FDA.
        </p>
      </section>
    </main>
  );
}
