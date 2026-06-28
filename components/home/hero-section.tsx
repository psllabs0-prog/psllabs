import { PillButton } from "@/components/ui/pill-button";
import { HomeSection } from "@/components/ui/home-section";
import { heroCopy } from "@/lib/home/homepage";

export function HeroSection() {
  return (
    <HomeSection background="pale-yellow" size="editorial" className="overflow-hidden">
      <div className="mx-auto grid max-w-[1440px] grid-cols-1 items-center gap-16 lg:grid-cols-2 lg:gap-20">
        <div className="flex flex-col gap-10 lg:gap-12">
          <div className="flex flex-col gap-6 md:gap-8">
            <h1 className="font-display text-[clamp(2.75rem,6vw,4.25rem)] font-bold leading-[1.05] tracking-[-0.03em] text-near-black">
              {heroCopy.headline}
            </h1>
            <p className="max-w-lg text-lg leading-relaxed text-slate-muted md:text-xl">
              {heroCopy.subhead}
            </p>
          </div>

          <PillButton href={heroCopy.ctaHref} className="w-fit">
            {heroCopy.ctaLabel}
          </PillButton>
        </div>

        <div
          className="relative mx-auto aspect-[4/5] w-full max-w-[560px] overflow-hidden rounded-3xl bg-gradient-to-br from-[var(--color-lab-white)] via-[var(--color-pale-yellow)] to-[var(--color-mint)] lg:aspect-square lg:max-w-none"
          role="img"
          aria-label={heroCopy.productImageAlt}
        >
          {/* Drop next/image GLP-3 RT product shot here — src="/glp-3-rt.png" */}
          <div className="absolute inset-0 flex items-center justify-center p-10">
            <div
              aria-hidden
              className="h-[72%] w-[42%] rounded-2xl border border-near-black/8 bg-[var(--color-lab-white)]/80 shadow-soft-card"
            />
          </div>
        </div>
      </div>
    </HomeSection>
  );
}
