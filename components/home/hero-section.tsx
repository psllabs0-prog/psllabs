import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { HeroProductVisual } from "@/components/home/hero-product-visual";
import { PillButton } from "@/components/ui/pill-button";
import { heroCopy } from "@/lib/home/homepage";

export function HeroSection() {
  return (
    <section className="relative bg-paper px-6 pb-12 pt-10 md:px-16 md:py-16 lg:px-24 lg:py-20">
      <div className="relative mx-auto max-w-[1440px]">
        <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-[1fr_1.05fr] lg:gap-12 xl:gap-20">
          <div className="flex flex-col justify-center gap-7 lg:max-w-xl lg:gap-8">
            <div className="flex flex-col gap-5">
              <p className="mono text-accent">{heroCopy.eyebrow}</p>
              <h1 className="max-w-[12ch] font-display text-[clamp(2.75rem,5.1vw,4.75rem)] font-bold leading-[1.04] tracking-[-0.04em] text-ink">
                {heroCopy.headline}
              </h1>
              <p className="max-w-[43ch] text-base leading-relaxed text-ash md:text-body-lg">
                {heroCopy.paragraph}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5">
              <PillButton
                href={heroCopy.primaryCtaHref}
                variant="primary"
                className="w-full sm:w-auto text-center"
              >
                {heroCopy.primaryCtaLabel}
              </PillButton>
              <PillButton
                href={heroCopy.secondaryCtaHref}
                variant="secondary"
                className="w-full sm:w-auto text-center"
              >
                {heroCopy.secondaryCtaLabel}
              </PillButton>
            </div>
            <p className="text-xs leading-relaxed text-ash">
              For laboratory research only. Not for human or veterinary use.
            </p>
            <div className="flex flex-wrap gap-x-6 gap-y-3 border-t border-linen pt-5 text-sm text-ash">
              <span>Ships from Arizona</span>
              <Link href="/shipping" className="inline-flex items-center gap-1.5 text-ink underline-offset-4 hover:underline">
                Shipping details <ArrowUpRight className="size-3.5" aria-hidden />
              </Link>
            </div>
          </div>
          <HeroProductVisual />
        </div>
      </div>
    </section>
  );
}
