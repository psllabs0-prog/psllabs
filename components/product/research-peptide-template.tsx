import type { Product } from "@/lib/products";
import type { ProductAvailability } from "@/lib/inventory/availability";
import { getCatalogProductByHandle } from "@/lib/products/catalog";
import { hasAvailableReport } from "@/lib/batch-reports";
import { TestingScopeExplainer } from "@/components/testing/testing-scope-explainer";

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
  availability: ProductAvailability;
};

export function ResearchPeptideTemplate({
  product,
  availability,
}: ResearchPeptideTemplateProps) {
  const catalog = getCatalogProductByHandle(product.handle);
  const hasReport = hasAvailableReport(product.handle);

  return (
    <ProductQuantityProvider unitPrice={product.price}>
      <main className="bg-paper pb-28 lg:pb-0">
        {/* Above the Fold: Product Hero with Name, RUO Classification, Nominal Quantity, Price, Stock, Add to Cart, Compact COA Status */}
        <section className="section-surface-ice mx-auto max-w-[1440px] px-6 py-12 md:px-16 md:py-16 lg:px-24 lg:py-20">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:gap-16 xl:gap-20">
            <AnimateIn y={16}>
              <div className="mx-auto w-full max-w-[520px] overflow-hidden rounded-md border border-linen lg:max-w-none">
                <ProductGallery
                  productName={product.name}
                  imageSrc={product.imageSrc}
                  imageAlt={product.imageAlt}
                />
              </div>
            </AnimateIn>

            <div className="flex flex-col gap-6">
              <AnimateIn delay={0.08}>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="mono text-ash">{product.tag}</p>
                  <span className="mono text-ash">·</span>
                  <span className="mono text-accent">RUO</span>
                </div>
              </AnimateIn>

              <AnimateIn delay={0.12}>
                <div className="flex flex-wrap items-baseline gap-3">
                  <h1 className="font-display text-display-lg font-bold text-ink">
                    {product.name}
                  </h1>
                  {catalog?.strength && (
                    <span className="font-mono text-2xl font-normal text-ash">
                      {catalog.strength}
                    </span>
                  )}
                </div>
              </AnimateIn>

              <AnimateIn delay={0.16}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="badge-verified">Research use only</span>
                  <span className="badge-accent">Analytical reference standard</span>
                </div>
              </AnimateIn>

              {/* Compact third-party documentation status */}
              <AnimateIn delay={0.2}>
                <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-lg border border-verified-green/30 bg-verified-green/5 px-4 py-3 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="size-2 rounded-full bg-verified-green" aria-hidden />
                    <span className="font-mono font-medium text-ink">
                      {hasReport
                        ? "Third-party analytical report published (Janoshik)"
                        : "Third-party documentation pending release"}
                    </span>
                  </div>
                  {hasReport && (
                    <a
                      href="#batch-testing"
                      className="mono font-semibold text-accent underline underline-offset-2 hover:opacity-80"
                    >
                      View batch report ↓
                    </a>
                  )}
                </div>
              </AnimateIn>

              <AnimateIn delay={0.24}>
                <p className="text-body-lg text-ash">{product.shortDescription}</p>
              </AnimateIn>

              <AnimateIn delay={0.28}>
                <ProductPurchase
                  productHandle={product.handle}
                  stockStatus={product.stockStatus}
                  availability={availability}
                />
              </AnimateIn>
            </div>
          </div>
        </section>

        {/* Immediately Below: Batch / Lab / Task / Date / Result with "View Original Report" & "Verify Independently" */}
        <ProductTesting product={product} />

        {/* Decision Layer Support: Analytical Scope & Limitations */}
        <SectionShell
          label="TESTING LIMITATIONS"
          title="Analytical scope & boundaries."
          variant="ice"
          width="prose"
        >
          <TestingScopeExplainer showPolicy={false} />
        </SectionShell>

        {/* Deeper Specifications Table */}
        {product.specifications && product.specifications.length > 0 && (
          <SectionShell
            label="SPECIFICATIONS"
            title="Research specifications."
            variant="white"
            width="prose"
          >
            <ProductSpecificationsTable specifications={product.specifications} />
          </SectionShell>
        )}

        {/* Deeper Compound Overview */}
        <SectionShell
          label="DESCRIPTION"
          title="About this compound."
          variant="ice"
          width="prose"
        >
          <div className="premium-card flex flex-col gap-5 p-6 md:p-7">
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

        {/* Product FAQs */}
        <ProductFaqSection product={product} />

        {/* Research Disclaimer */}
        <ProductDisclaimer>
          {product.researchDisclaimer}
        </ProductDisclaimer>

        {/* Mobile Sticky Add-to-Cart */}
        <MobileStickyCart
          productHandle={product.handle}
          productName={product.name}
          stockStatus={availability.status}
          availability={availability}
        />
      </main>
    </ProductQuantityProvider>
  );
}
