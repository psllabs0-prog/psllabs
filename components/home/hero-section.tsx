import { PillButton } from "@/components/ui/pill-button";
import { HomeSection } from "@/components/ui/home-section";

export function HeroSection() {
  return (
    <HomeSection background="pale-yellow" size="editorial" className="overflow-hidden">
      <div className="mx-auto grid max-w-[1440px] grid-cols-1 items-center gap-16 lg:grid-cols-12 lg:gap-8 xl:gap-16">
        <div className="flex flex-col gap-12 lg:col-span-5 lg:gap-14">
          <div className="flex flex-col gap-8">
            <p className="mono text-slate-muted">PSL LABS · LONGEVITY RESEARCH</p>
            <h1 className="font-display text-[clamp(2.75rem,6vw,4.5rem)] font-bold leading-[1.02] tracking-[-0.03em] text-near-black">
              Research peptides you can trust.
            </h1>
            <p className="max-w-md text-lg leading-relaxed text-slate-muted md:text-xl md:leading-relaxed">
              Clinical-grade longevity compounds. Third-party verified, every
              batch. Designed to compound.
            </p>
          </div>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <PillButton href="/#shop">Shop the Stack</PillButton>
            <PillButton href="/testing" variant="secondary">
              View testing standards
            </PillButton>
          </div>
        </div>

        <div className="relative lg:col-span-7 lg:pl-8">
          <div
            className="relative mx-auto aspect-[4/5] max-h-[720px] w-full max-w-[640px] overflow-hidden rounded-[2rem] bg-gradient-to-br from-[var(--color-lab-white)] via-[var(--color-pale-yellow)] to-[var(--color-mint)] lg:aspect-square lg:max-h-none"
            role="img"
            aria-label="Featured product render"
          >
            {/* Drop next/image hero product render here */}
            <div
              aria-hidden
              className="absolute inset-x-[18%] bottom-[8%] top-[12%] rounded-[2rem] border border-near-black/5 bg-white/50"
            />
            <div
              aria-hidden
              className="absolute left-[22%] top-[18%] h-[62%] w-[38%] -rotate-3 rounded-3xl border border-near-black/8 bg-[var(--color-lab-white)]/80"
            />
            <div
              aria-hidden
              className="absolute bottom-[20%] right-[16%] h-[48%] w-[28%] rotate-6 rounded-3xl border border-near-black/8 bg-[var(--color-lab-white)]/70"
            />
          </div>
        </div>
      </div>
    </HomeSection>
  );
}
