import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { HeroProductVisual } from "@/components/home/hero-product-visual";
import { PillButton } from "@/components/ui/pill-button";
import { heroCopy } from "@/lib/home/homepage";

export function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-paper px-6 pb-12 pt-9 md:px-12 md:pb-16 md:pt-12 lg:px-16 lg:py-16 xl:px-20">
      <div aria-hidden className="pointer-events-none absolute -left-64 top-0 size-[640px] rounded-full bg-[radial-gradient(circle,rgba(47,182,224,0.035),transparent_68%)]" />
      <div className="relative mx-auto grid max-w-[1440px] grid-cols-1 items-center gap-10 lg:grid-cols-[0.95fr_1.1fr] lg:gap-12 xl:gap-16">
        <div className="flex flex-col gap-7 lg:pb-14 lg:pt-5">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ash sm:text-xs">{heroCopy.eyebrow}</p>
            <h1 className="mt-6 max-w-[9ch] font-display text-[clamp(3.5rem,6.8vw,6.5rem)] font-semibold leading-[0.98] tracking-[-0.06em] text-ink sm:mt-7">
              Research<br /><span className="text-accent">peptides.</span>
            </h1>
            <p className="mt-6 max-w-[39ch] text-base leading-[1.7] text-[#aab0b9] lg:mt-8 lg:text-lg">{heroCopy.paragraph}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <PillButton href={heroCopy.primaryCtaHref} className="gap-3 px-6 text-sm sm:text-base">{heroCopy.primaryCtaLabel} <ArrowRight className="size-4" aria-hidden /></PillButton>
            <PillButton href={heroCopy.secondaryCtaHref} variant="secondary" className="px-5 text-sm sm:text-base">{heroCopy.secondaryCtaLabel}</PillButton>
          </div>
          <div className="mt-1 flex max-w-[420px] flex-col gap-4 border-t border-border-strong pt-5">
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm">
              <span className="text-[#aab0b9]">Ships to all 50 states.</span>
              <Link href="/shipping" className="inline-flex items-center gap-1.5 text-ink underline-offset-4 hover:underline">Shipping <ArrowUpRight className="size-3.5" aria-hidden /></Link>
            </div>
            <p className="max-w-[45ch] text-xs leading-relaxed text-ash">For laboratory research only. Not for human or veterinary use.</p>
          </div>
        </div>
        <HeroProductVisual />
      </div>
    </section>
  );
}
