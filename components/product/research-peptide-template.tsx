import type { Product } from "@/lib/products";
import type { ProductAvailability } from "@/lib/inventory/availability";
import { getCatalogProductByHandle } from "@/lib/products/catalog";
import { hasAvailableReport } from "@/lib/batch-reports";
import { TestingScopeExplainer } from "@/components/testing/testing-scope-explainer";

import { AnimateIn } from "./animate-in";
import { MobileStickyCart } from "./mobile-sticky-cart";
import { ProductDisclaimer } from "./product-disclaimer";
import { ProductFaqSection } from "./product-faq-section";
import { ProductVialImage } from "./product-vial-image";
import { getProductImage } from "@/lib/products/images";
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
  const fallbackImage = getProductImage(product.handle);

  return (
    <ProductQuantityProvider unitPrice={product.price}>
      <main className="bg-paper pb-28 lg:pb-0">
        <section className="section-surface-ice mx-auto max-w-[1440px] px-6 pb-12 pt-5 md:px-16 md:pb-16 lg:px-24 lg:pb-20">
          <Link href="/products" className="mb-6 inline-flex items-center gap-2 text-sm text-ash underline-offset-4 hover:text-ink hover:underline">
            <ArrowLeft className="size-3.5" aria-hidden /> All products
          </Link>
          <div className="grid grid-cols-1 gap-y-6 lg:grid-cols-2 lg:grid-rows-[auto_1fr] lg:gap-x-16 xl:gap-x-20">
            <AnimateIn className="lg:col-start-2 lg:row-start-1">
              <p className="mono mb-3 text-accent">For laboratory research</p>
              <div className="flex flex-wrap items-baseline gap-3">
                <h1 className="font-display text-display-lg font-bold text-ink">
                  {product.name}
                </h1>
                {catalog?.strength && (
                  <span className="font-mono text-xl font-normal text-ash md:text-2xl">
                    {catalog.strength}
                  </span>
                )}
              </div>
              <p className="mt-3 text-xs leading-relaxed text-ash">Not for human or veterinary use.</p>
            </AnimateIn>

            <AnimateIn y={16} className="lg:col-start-1 lg:row-span-2 lg:row-start-1">
              <div className="mx-auto w-full max-w-[520px] overflow-hidden rounded-2xl border border-border-strong shadow-[0_18px_60px_-30px_rgba(0,0,0,0.7)] lg:sticky lg:top-24 lg:max-w-none">
                <ProductVialImage
                  src={product.imageSrc ?? fallbackImage.src}
                  alt={product.imageAlt ?? fallbackImage.alt}
                  context="product"
                  priority
                  bordered={false}
                  rounded="none"
                  className="aspect-[4/3] lg:aspect-[4/5]"
                />
              </div>
            </AnimateIn>

            <div className="flex flex-col gap-5 lg:col-start-2 lg:row-start-2">
              <AnimateIn delay={0.08}>
                <p className="text-base leading-relaxed text-ash md:text-body-lg">{product.shortDescription}</p>
              </AnimateIn>

              <AnimateIn delay={0.12}>
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border-strong bg-surface px-4 py-3 text-sm">
                  <div className="flex items-center gap-2">
                    <FileText className="size-4 shrink-0 text-accent" aria-hidden />
                    <span className="text-ink">
                      {hasReport
                        ? "Janoshik batch report available"
                        : "Batch report not yet published"}
                    </span>
                  </div>
                  {hasReport && (
                    <a
                      href="#batch-testing"
                      className="inline-flex items-center gap-1 text-accent underline underline-offset-4 hover:opacity-80"
                    >
                      Read the report <ArrowDown className="size-3.5" aria-hidden />
                    </a>
                  )}
                </div>
              </AnimateIn>

              <AnimateIn delay={0.16}>
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

        <ProductFaqSection product={product} />

        {/* Decision Layer Support: Analytical Scope & Limitations */}
        <SectionShell
          label="LAB REPORT"
          title="What the results mean"
          variant="ice"
          width="prose"
        >
          <TestingScopeExplainer showPolicy={false} />
        </SectionShell>

        {/* Deeper Specifications Table */}
        {product.specifications && product.specifications.length > 0 && (
          <SectionShell
            label="SPECIFICATIONS"
            title="Product specifications"
            variant="white"
            width="prose"
          >
            <ProductSpecificationsTable specifications={product.specifications} />
          </SectionShell>
        )}

        {/* Deeper Compound Overview */}
        <SectionShell
          label="DESCRIPTION"
          title={`About ${product.name}`}
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
import Link from "next/link";
import { ArrowLeft, ArrowDown, FileText } from "lucide-react";
