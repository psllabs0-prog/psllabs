import { PillButton } from "@/components/ui/pill-button";
import { HeroProductVisual } from "@/components/home/hero-product-visual";
import { heroCopy } from "@/lib/home/homepage";

export function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-paper via-lab-white to-biotech-mist px-6 py-28 md:px-16 md:py-36 lg:px-24 lg:py-44">
      {/* Background atmosphere */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_70%_40%,rgba(61,107,140,0.14),transparent)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 top-0 h-96 w-96 rounded-full bg-biotech-light/60 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-16 bottom-0 h-72 w-72 rounded-full bg-biotech-pale/50 blur-3xl"
      />

      <div className="relative mx-auto grid max-w-[1440px] grid-cols-1 items-center gap-16 lg:grid-cols-2 lg:gap-12 xl:gap-20">
        <div className="flex flex-col gap-10 lg:max-w-xl lg:gap-12">
          <div className="flex flex-col gap-6">
            <p className="mono text-biotech-deep/80">PSL LABS · RESEARCH GRADE</p>
            <h1 className="font-display text-display-xl font-bold text-ink">
              {heroCopy.headlineLines.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </h1>
            <p className="max-w-md text-body-lg text-ash">
              Third-party verified research peptides with batch-matched
              documentation.
            </p>
          </div>

          <PillButton href={heroCopy.ctaHref} className="w-fit">
            {heroCopy.ctaLabel}
          </PillButton>
        </div>

        <HeroProductVisual />
      </div>
    </section>
  );
}
