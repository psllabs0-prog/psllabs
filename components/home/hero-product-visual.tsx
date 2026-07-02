import { ProductVialImage } from "@/components/product/product-vial-image";
import { heroCopy } from "@/lib/home/homepage";

export function HeroProductVisual() {
  return (
    <div className="relative mx-auto w-full max-w-[560px] md:max-w-[620px] lg:max-w-[680px]">
      {/* Subtle COA accent */}
      <div
        aria-hidden
        className="absolute left-0 top-[8%] z-20 w-[40%] -rotate-6 rounded-lg border border-white/50 bg-white/70 p-3 opacity-70 shadow-[0_12px_32px_rgba(26,77,109,0.08)] backdrop-blur-sm md:left-[2%]"
      >
        <div className="mb-2 flex items-center justify-between">
          <div className="h-1.5 w-10 rounded-full bg-biotech-blue/25" />
          <span className="rounded border border-biotech-blue/20 bg-biotech-pale/80 px-1.5 py-0.5 font-[family-name:var(--font-mono)] text-[0.5rem] uppercase tracking-wider text-biotech-deep/70">
            COA
          </span>
        </div>
        <div className="space-y-1.5">
          <div className="h-1 w-full rounded-full bg-biotech-blue/10" />
          <div className="h-1 w-[75%] rounded-full bg-biotech-blue/10" />
        </div>
      </div>

      <ProductVialImage
        src={heroCopy.productImageSrc}
        alt={heroCopy.productImageAlt}
        context="hero"
        priority
        animate
        className="w-full"
      />
    </div>
  );
}
