import { PillButton } from "@/components/ui/pill-button";
import { HomeSection } from "@/components/ui/home-section";
import type { FeaturedProductData } from "@/lib/home/homepage";

type FeaturedProductSectionProps = {
  product: FeaturedProductData;
};

export function FeaturedProductSection({ product }: FeaturedProductSectionProps) {
  return (
    <HomeSection
      id="shop"
      background="mint"
      size="editorial"
      className="scroll-mt-20"
    >
      <div className="mx-auto grid max-w-[1440px] grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-20">
        <div
          className="relative aspect-square w-full max-w-[520px] overflow-hidden rounded-3xl bg-gradient-to-br from-[var(--color-lab-white)] to-[var(--color-mint)] lg:max-w-none"
          role="img"
          aria-label={product.imageAlt}
        >
          {/* Drop next/image GLP-3 RT product shot here — src="/glp-3-rt.png" */}
          <div className="absolute inset-0 flex items-center justify-center p-12">
            <div
              aria-hidden
              className="h-[75%] w-[45%] rounded-2xl border border-near-black/8 bg-[var(--color-lab-white)]/80"
            />
          </div>
        </div>

        <div className="flex flex-col gap-8 lg:py-8">
          <div className="flex flex-col gap-5">
            <p className="mono text-slate-muted">{product.tag}</p>
            <h2 className="font-display text-[clamp(2.25rem,4vw,3.25rem)] font-bold leading-[1.05] tracking-[-0.02em] text-near-black">
              {product.name}
            </h2>
            <p className="max-w-lg text-lg leading-relaxed text-slate-muted">
              {product.description}
            </p>
          </div>

          <p className="font-display text-3xl font-bold text-near-black">
            ${product.price}
          </p>

          <PillButton href={product.href} className="w-fit">
            View
          </PillButton>
        </div>
      </div>
    </HomeSection>
  );
}
