import type { Product } from "@/lib/products";

import { AnimateIn } from "./animate-in";
import { MobileStickyCart } from "./mobile-sticky-cart";
import { ProductDisclaimer } from "./product-disclaimer";
import { ProductFaqSection } from "./product-faq-section";
import { ProductGallery } from "./product-gallery";
import { ProductPurchase } from "./product-purchase";
import { ProductQuantityProvider } from "./product-quantity-provider";
import { ProductSpecificationsTable } from "./product-specifications-table";
import { ProductTesting } from "./product-testing";
import { SectionShell } from "./section-shell";

type ResearchPeptideTemplateProps = {
  product: Product;
};

export function ResearchPeptideTemplate({
  product,
}: ResearchPeptideTemplateProps) {
  return (
    <ProductQuantityProvider unitPrice={product.price}>
      <main className="bg-paper pb-28 lg:pb-0">
        <section className="mx-auto max-w-[1440px] px-6 py-20 md:px-16 md:py-28 lg:px-24 lg:py-32">
          <div className="grid grid-cols-1 gap-14 lg:grid-cols-2 lg:gap-24 xl:gap-28">
            <AnimateIn y={16}>
              <div className="mx-auto w-full max-w-[520px] lg:max-w-none">
                <ProductGallery
                  productName={product.name}
                  imageSrc={product.imageSrc}
                  imageAlt={product.imageAlt}
                />
              </div>
            </AnimateIn>

            <div className="flex flex-col gap-10">
              <AnimateIn delay={0.08}>
                <p className="mono text-ash">{product.tag}</p>
              </AnimateIn>

              <AnimateIn delay={0.16}>
                <h1 className="font-display text-display-lg font-bold text-ink">
                  {product.name}
                </h1>
              </AnimateIn>

              <AnimateIn delay={0.24}>
                <p className="text-body-lg text-ash">{product.shortDescription}</p>
              </AnimateIn>

              <AnimateIn delay={0.32}>
                <ProductPurchase
                  productHandle={product.handle}
                  stockStatus={product.stockStatus}
                />
              </AnimateIn>
            </div>
          </div>
        </section>

        <SectionShell
          label="DESCRIPTION"
          title="About this compound."
          variant="white"
          width="prose"
        >
          <div className="flex flex-col gap-5">
            {product.whyThisExists.split("\n\n").map((paragraph) => (
              <p
                key={paragraph.slice(0, 40)}
                className="text-base leading-[1.7] text-ash md:text-body-lg"
              >
                {paragraph}
              </p>
            ))}
          </div>
        </SectionShell>

        {product.specifications && product.specifications.length > 0 && (
          <SectionShell
            label="SPECIFICATIONS"
            title="Research specifications."
            width="prose"
          >
            <ProductSpecificationsTable specifications={product.specifications} />
          </SectionShell>
        )}

        <ProductTesting product={product} />

        <ProductFaqSection product={product} />

        <ProductDisclaimer>
          {product.researchDisclaimer}
        </ProductDisclaimer>

        <MobileStickyCart
          productHandle={product.handle}
          productName={product.name}
          stockStatus={product.stockStatus}
        />
      </main>
    </ProductQuantityProvider>
  );
}
