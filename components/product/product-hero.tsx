import Link from "next/link";
import { ArrowDown, ArrowLeft, FileText } from "lucide-react";
import type { Product } from "@/lib/products";
import type { ProductAvailability } from "@/lib/inventory/availability";
import { hasAvailableReport } from "@/lib/batch-reports";

import { AnimateIn } from "./animate-in";
import { ProductGallery } from "./product-gallery";
import { ProductPurchase } from "./product-purchase";

export function ProductHero({
  product,
  availability,
}: {
  product: Product;
  availability: ProductAvailability;
}) {
  return (
    <section className="section-surface-ice mx-auto max-w-[1440px] px-6 pb-10 pt-6 md:px-12 md:pb-16 lg:px-24 lg:pb-20">
        <Link href="/products" className="mb-7 inline-flex items-center gap-2 text-sm text-ash underline-offset-4 hover:text-ink hover:underline">
          <ArrowLeft className="size-3.5" aria-hidden /> All products
        </Link>
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:gap-16">
          <AnimateIn y={16}>
            <div className="overflow-hidden rounded-2xl border border-border-strong shadow-[0_18px_60px_-30px_rgba(0,0,0,0.7)]">
              <ProductGallery
                productName={product.name}
                imageSrc={product.imageSrc}
                imageAlt={product.imageAlt}
              />
            </div>
          </AnimateIn>

          <div className="flex flex-col gap-5 lg:pt-2">
            <AnimateIn delay={0.08}>
              <p className="mono text-accent">{product.tag}</p>
            </AnimateIn>

            <AnimateIn delay={0.16}>
              <h1 className="font-[family-name:var(--font-display)] text-[clamp(2rem,4vw,3rem)] leading-[1.1] tracking-[-0.02em] text-ink">
                {product.name}
              </h1>
            </AnimateIn>

            <AnimateIn delay={0.24} className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="badge-verified">Research use only</span>
              </div>
            </AnimateIn>

            <AnimateIn delay={0.32}>
              <p className="max-w-md text-base leading-relaxed text-ash md:text-[1.0625rem]">
                {product.shortDescription}
              </p>
              {hasAvailableReport(product.handle) && (
                <a href="#batch-testing" className="mt-4 inline-flex items-center gap-2 text-sm text-accent underline-offset-4 hover:underline">
                  <FileText className="size-4" aria-hidden /> Read this product’s batch report <ArrowDown className="size-3.5" aria-hidden />
                </a>
              )}
            </AnimateIn>

            <ProductPurchase
              productHandle={product.handle}
              stockStatus={product.stockStatus}
              availability={availability}
            />

            <AnimateIn delay={0.48}>
              <ul className="flex flex-col gap-2.5 border-t border-linen pt-6">
                {product.bullets.map((bullet) => (
                  <li
                    key={bullet}
                    className="flex gap-3 text-sm text-ink"
                  >
                    <span
                      className="mt-0.5 font-[family-name:var(--font-mono)] text-xs text-primary-blue"
                      aria-hidden
                    >
                      •
                    </span>
                    {bullet}
                  </li>
                ))}
              </ul>
            </AnimateIn>
          </div>
        </div>
      </section>
  );
}
