import { PillButton } from "@/components/ui/pill-button";
import { HeroProductVisual } from "@/components/home/hero-product-visual";
import { HeroTrustCards } from "@/components/home/hero-trust-cards";
import { heroCopy, heroTrustCards } from "@/lib/home/homepage";

export function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-paper via-lab-white to-biotech-mist/50 px-6 pb-12 pt-16 md:px-16 md:pb-16 md:pt-24 lg:px-24 lg:pb-20 lg:pt-28">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_90%_70%_at_50%_0%,rgba(123,175,212,0.18),transparent_55%)]"
      />

      <div className="relative mx-auto flex max-w-[1440px] flex-col gap-10 md:gap-12">
        <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-16 xl:gap-20">
          {/* Vial first on mobile */}
          <div className="order-1 flex justify-center lg:order-2 lg:justify-end">
            <HeroProductVisual />
          </div>

          <div className="order-2 flex flex-col gap-8 lg:order-1 lg:max-w-md lg:gap-10 xl:max-w-lg">
            <div className="flex flex-col gap-5">
              <p className="mono text-biotech-deep/80">{heroCopy.eyebrow}</p>
              <h1 className="font-display text-display-lg font-bold text-ink md:text-display-xl">
                {heroCopy.headline}
              </h1>
              <p className="text-base leading-relaxed text-ash md:text-body-lg">
                {heroCopy.subheadline}
              </p>
            </div>

            <PillButton href={heroCopy.ctaHref} className="w-full sm:w-fit">
              {heroCopy.ctaLabel}
            </PillButton>
          </div>
        </div>

        <HeroTrustCards cards={heroTrustCards} />
      </div>
    </section>
  );
}
