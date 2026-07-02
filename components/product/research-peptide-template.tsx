import type { Product } from "@/lib/products";

import { AnimateIn } from "./animate-in";
import { MobileStickyCart } from "./mobile-sticky-cart";
import { ProductDisclaimer } from "./product-disclaimer";
import { ProductFaqSection } from "./product-faq-section";
import { ProductGallery } from "./product-gallery";
import { ProductPurchase } from "./product-purchase";
import { ProductTesting } from "./product-testing";
import { SectionShell } from "./section-shell";

type ResearchPeptideTemplateProps = {
  product: Product;
  otherProducts: Product[];
};

export function ResearchPeptideTemplate({
  product,
  otherProducts,
}: ResearchPeptideTemplateProps) {
  return (
    <main className="bg-[var(--color-paper)] pb-28 lg:pb-0">
      <section className="mx-auto max-w-[1440px] px-6 py-12 md:px-12 md:py-20 lg:px-24 lg:py-28">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:gap-20">
          <AnimateIn y={16}>
            <ProductGallery productName={product.name} />
          </AnimateIn>

          <div className="flex flex-col gap-8">
            <AnimateIn delay={0.08}>
              <p className="mono text-[var(--color-stone)]">{product.tag}</p>
            </AnimateIn>

            <AnimateIn delay={0.16}>
              <h1 className="font-display text-[clamp(2rem,4vw,3rem)] font-bold leading-[1.1] tracking-[-0.02em] text-near-black">
                {product.name}
              </h1>
            </AnimateIn>

            <AnimateIn delay={0.24}>
              <p className="text-base leading-relaxed text-slate-muted md:text-lg">
                {product.shortDescription}
              </p>
            </AnimateIn>

            <AnimateIn delay={0.32}>
              <ProductPurchase
                productHandle={product.handle}
                price={product.price}
                subscribePrice={product.subscribePrice}
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
        <p className="text-base leading-relaxed text-slate-muted md:text-[1.0625rem]">
          {product.whyThisExists}
        </p>
      </SectionShell>

      <SectionShell
        label="DOSAGE INFORMATION"
        title="Research specifications."
        width="prose"
      >
        <div className="flex flex-col gap-4">
          {product.dosage?.map((line) => (
            <p
              key={line}
              className={
                line.startsWith("[PLACEHOLDER:")
                  ? "rounded-lg border border-dashed border-[var(--color-sage)] bg-[var(--color-lab-white)] px-4 py-3 font-[family-name:var(--font-mono)] text-sm leading-relaxed text-[var(--color-stone)]"
                  : "text-base leading-relaxed text-slate-muted"
              }
            >
              {line}
            </p>
          ))}
        </div>
      </SectionShell>

      <ProductTesting product={product} />

      <ProductFaqSection product={product} />

      {otherProducts.length > 0 && (
        <SectionShell
          label="RELATED"
          title="You may also consider."
          width="content"
        >
          <p className="text-sm text-slate-muted">
            Related products will appear here.
          </p>
        </SectionShell>
      )}

      <ProductDisclaimer />
      <MobileStickyCart
        productHandle={product.handle}
        price={product.price}
        productName={product.name}
        stockStatus={product.stockStatus}
      />
    </main>
  );
}
