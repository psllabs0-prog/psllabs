import { PillButton } from "@/components/ui/pill-button";
import { HomeSection } from "@/components/ui/home-section";
import { heroCopy } from "@/lib/home/homepage";

export function HeroSection() {
  return (
    <HomeSection background="hero" size="editorial" className="overflow-hidden">
      <div className="mx-auto grid max-w-[1440px] grid-cols-1 items-center gap-16 lg:grid-cols-2 lg:gap-20">
        <div className="flex flex-col gap-10 lg:gap-12">
          <div className="flex flex-col gap-6 md:gap-8">
            <h1 className="font-display text-display-xl font-bold text-ink">
              {heroCopy.headlineLines.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </h1>
          </div>

          <PillButton href={heroCopy.ctaHref} className="w-fit">
            {heroCopy.ctaLabel}
          </PillButton>
        </div>

        <div
          className="relative mx-auto aspect-[4/5] w-full max-w-[560px] overflow-hidden rounded-lg bg-gradient-to-br from-lab-white via-section-hero to-section-cool lg:aspect-square lg:max-w-none"
          role="img"
          aria-label={heroCopy.productImageAlt}
        >
          {/* Drop next/image GLP-3 RT product shot here — src="/glp-3-rt.png" */}
          <div className="absolute inset-0 flex items-center justify-center p-10">
            <div
              aria-hidden
              className="h-[72%] w-[42%] rounded-md border border-linen bg-lab-white/80"
            />
          </div>
        </div>
      </div>
    </HomeSection>
  );
}
