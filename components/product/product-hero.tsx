import type { Product } from "@/lib/products";

import { AnimateIn } from "./animate-in";
import { ProductGallery } from "./product-gallery";
import { ProductPurchase } from "./product-purchase";
import { StarRating } from "./star-rating";

export function ProductHero({ product }: { product: Product }) {
  return (
    <section className="section-surface-ice mx-auto max-w-[1440px] px-6 py-10 md:px-12 md:py-16 lg:px-24 lg:py-20">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:gap-16">
          <AnimateIn y={16}>
            <div className="overflow-hidden rounded-2xl border border-linen shadow-[0_12px_40px_rgba(37,99,235,0.1)]">
              <ProductGallery
                productName={product.name}
                imageSrc={product.imageSrc}
                imageAlt={product.imageAlt}
                showThumbnails
              />
            </div>
          </AnimateIn>

          <div className="flex flex-col gap-6">
            <AnimateIn delay={0.08}>
              <p className="mono text-ash">{product.tag}</p>
            </AnimateIn>

            <AnimateIn delay={0.16}>
              <h1 className="font-[family-name:var(--font-display)] text-[clamp(2rem,4vw,3rem)] leading-[1.1] tracking-[-0.02em] text-ink">
                {product.name}
              </h1>
            </AnimateIn>

            <AnimateIn delay={0.24} className="flex flex-col gap-3">
              <StarRating />
              <div className="flex flex-wrap items-center gap-2">
                <span className="badge-verified">Research use only</span>
                <p className="font-[family-name:var(--font-mono)] text-xs text-ash">
                  {product.stackRole}
                </p>
              </div>
            </AnimateIn>

            <AnimateIn delay={0.32}>
              <p className="max-w-md text-base leading-relaxed text-ash md:text-[1.0625rem]">
                {product.shortDescription}
              </p>
            </AnimateIn>

            <AnimateIn delay={0.4}>
              <ProductPurchase
                productHandle={product.handle}
                stockStatus={product.stockStatus}
              />
            </AnimateIn>

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
                      —
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
