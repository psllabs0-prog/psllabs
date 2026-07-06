import { ProductVialImage } from "@/components/product/product-vial-image";
import { heroCopy } from "@/lib/home/homepage";

export function HeroProductVisual() {
  return (
    <div className="relative mx-auto w-full max-w-[580px] md:max-w-[640px] lg:max-w-[700px]">
      <div
        aria-hidden
        className="absolute inset-[8%] -z-10 rounded-[2rem] bg-gradient-to-br from-primary-blue/15 via-cyan-accent/10 to-soft-blue blur-2xl"
      />

      <div
        aria-hidden
        className="absolute left-0 top-[8%] z-20 w-[40%] -rotate-6 rounded-xl border border-linen bg-lab-white/90 p-3 shadow-[0_12px_32px_rgba(37,99,235,0.12)] backdrop-blur-sm md:left-[2%]"
      >
        <div className="mb-2 flex items-center justify-between">
          <div className="h-1.5 w-10 rounded-full bg-primary-blue/25" />
          <span className="badge-accent py-0.5 text-[0.5rem] before:hidden">
            COA
          </span>
        </div>
        <div className="space-y-1.5">
          <div className="h-1 w-full rounded-full bg-primary-blue/10" />
          <div className="h-1 w-[75%] rounded-full bg-primary-blue/10" />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-linen shadow-[0_16px_48px_rgba(37,99,235,0.12)]">
        <ProductVialImage
          src={heroCopy.productImageSrc}
          alt={heroCopy.productImageAlt}
          context="hero"
          priority
          animate
          className="w-full border-0"
        />
      </div>
    </div>
  );
}
