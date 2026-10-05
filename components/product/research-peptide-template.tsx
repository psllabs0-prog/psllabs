import Link from "next/link";
import { ArrowLeft, ArrowDown, FileText } from "lucide-react";
import type { Product } from "@/lib/products";
import type { ProductAvailability } from "@/lib/inventory/availability";
import { getCatalogProductByHandle } from "@/lib/products/catalog";
import { hasAvailableReport } from "@/lib/batch-reports";
import { TestingScopeExplainer } from "@/components/testing/testing-scope-explainer";

import { ScrollReveal } from "@/components/motion/scroll-reveal";
import { MobileStickyCart } from "./mobile-sticky-cart";
import { ProductDisclaimer } from "./product-disclaimer";
import { ProductFaqSection } from "./product-faq-section";
import { ProductShowcase } from "./product-showcase";
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
      <main className="public-page-surface pb-28 lg:pb-0">
        <section className="mx-auto max-w-[1440px] px-6 pb-12 pt-5 md:px-12 md:pb-16 lg:px-16 lg:pb-20 xl:px-20">
          <Link href="/products" className="mb-6 inline-flex items-center gap-2 text-sm text-ash underline-offset-4 hover:text-ink hover:underline">
            <ArrowLeft className="size-3.5" aria-hidden /> All products
          </Link>
          <div className="grid grid-cols-1 gap-y-5 lg:grid-cols-[1.1fr_1fr] lg:grid-rows-[auto_1fr] lg:gap-x-12 xl:gap-x-16">
            <ScrollReveal className="lg:col-start-2 lg:row-start-1">
              <p className="mb-4 font-mono text-[10px] uppercase tracking-[0.16em] text-ash">PSL Labs / Laboratory research</p>
              <div className="flex flex-wrap items-baseline gap-3">
                <h1 className="font-display text-[clamp(2.25rem,4.1vw,3.75rem)] font-semibold leading-[1.04] tracking-[-0.045em] text-ink">
                  {product.name}
                </h1>
                {catalog?.strength && (
                  <span className="rounded-full border border-border-strong px-3 py-1 font-mono text-sm font-normal text-[#aab0b9] md:text-base">
                    {catalog.strength}
                  </span>
                )}
              </div>
              <p className="mt-3 text-xs leading-relaxed text-ash">Not for human or veterinary use.</p>
            </ScrollReveal>

            <div className="lg:col-start-1 lg:row-span-2 lg:row-start-1">
              <div className="mx-auto w-full max-w-[600px] lg:sticky lg:top-24 lg:max-w-none">
                <ProductShowcase
                  src={product.imageSrc ?? fallbackImage.src}
                  alt={product.imageAlt ?? fallbackImage.alt}
                  name={product.name}
                  strength={catalog?.strength}
                />
              </div>
            </div>

            <div className="flex flex-col gap-5 lg:col-start-2 lg:row-start-2">
              <ScrollReveal>
                <p className="text-base leading-[1.7] text-[#aab0b9]">{product.shortDescription}</p>
              </ScrollReveal>

              <ScrollReveal delayMs={60}>
                <div className="flex flex-wrap items-center justify-between gap-2 border-y border-border-strong py-3 text-sm">
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
              </ScrollReveal>

              <ProductPurchase
                productHandle={product.handle}
                stockStatus={product.stockStatus}
                availability={availability}
              />
            </div>
          </div>
        </section>

        <nav aria-label="Product details" className="border-t border-linen bg-paper px-6 md:px-12 lg:px-16 xl:px-20">
          <div className="mx-auto flex max-w-[1280px] flex-wrap gap-x-7 gap-y-1 py-2 text-sm text-ash">
            <a href="#batch-testing" className="inline-flex min-h-11 items-center text-ink underline-offset-4 hover:underline">Batch report</a>
            {product.specifications && product.specifications.length > 0 && <a href="#product-specifications" className="inline-flex min-h-11 items-center underline-offset-4 hover:text-ink hover:underline">Specifications</a>}
            <Link href="/shipping" className="inline-flex min-h-11 items-center underline-offset-4 hover:text-ink hover:underline">Shipping</Link>
          </div>
        </nav>

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
            id="product-specifications"
            label="SPECIFICATIONS"
            title="Product specifications"
            variant="white"
            width="prose"
          >
            <ScrollReveal>
              <ProductSpecificationsTable specifications={product.specifications} />
            </ScrollReveal>
          </SectionShell>
        )}

        {/* Deeper Compound Overview */}
        <SectionShell
          label="DESCRIPTION"
          title={`About ${product.name}`}
          variant="ice"
          width="prose"
        >
          <ScrollReveal>
            <div className="public-section-card flex flex-col gap-5 p-6 md:p-8">
              {product.whyThisExists.split("\n\n").map((paragraph) => (
                <p
                  key={paragraph.slice(0, 40)}
                  className="text-base leading-[1.7] text-ash md:text-body-lg"
                >
                  {paragraph}
                </p>
              ))}
            </div>
          </ScrollReveal>
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
