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
      background="section-panel"
      size="editorial"
      className="scroll-mt-20"
    >
      <div className="mx-auto grid max-w-[1440px] grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-20">
        <div
          className="relative aspect-square w-full max-w-[520px] overflow-hidden rounded-lg bg-gradient-to-br from-lab-white to-section-cool lg:max-w-none"
          role="img"
          aria-label={product.imageAlt}
        >
          {/* Drop next/image GLP-3 RT product shot here — src="/glp-3-rt.png" */}
          <div className="absolute inset-0 flex items-center justify-center p-12">
            <div
              aria-hidden
              className="h-[75%] w-[45%] rounded-md border border-linen bg-lab-white/80"
            />
          </div>
        </div>

        <div className="flex flex-col gap-8 lg:py-8">
          <div className="flex flex-col gap-5">
            <p className="mono text-ash">{product.tag}</p>
            <h2 className="font-display text-display-md font-bold text-ink">
              {product.name}
            </h2>
            <p className="max-w-lg text-body-lg text-ash">
              {product.description}
            </p>
          </div>

          <p className="font-display text-3xl font-bold text-ink">
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
