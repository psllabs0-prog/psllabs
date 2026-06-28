import type { Metadata } from "next";

import { FeaturedProductSection } from "@/components/home/featured-product-section";
import { HomeSection } from "@/components/ui/home-section";
import { featuredProduct } from "@/lib/home/homepage";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Products",
  description:
    "Research peptides with third-party testing and certificate of analysis.",
  path: "/products",
});

export default function ProductsPage() {
  return (
    <main className="bg-paper">
      <HomeSection background="paper" size="editorial">
        <header className="mx-auto max-w-[1440px] text-center">
          <p className="mono text-ash">PRODUCTS</p>
          <h1 className="mt-4 font-display text-display-lg font-bold text-ink">
            Research compounds.
          </h1>
          <p className="mx-auto mt-4 max-w-lg text-body-lg text-ash">
            Third-party tested peptides with batch-matched documentation.
          </p>
        </header>
      </HomeSection>
      <FeaturedProductSection product={featuredProduct} />
    </main>
  );
}
