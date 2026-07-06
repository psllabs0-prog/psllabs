import { AnimateIn } from "@/components/product/animate-in";
import type { AboutContent } from "@/lib/about";

type AboutHeroProps = {
  hero: AboutContent["hero"];
};

export function AboutHero({ hero }: AboutHeroProps) {
  return (
    <section className="border-b border-linen bg-gradient-to-br from-ice-blue via-soft-blue/50 to-paper px-6 py-12 md:px-16 md:py-16 lg:px-24 lg:py-20">
      <div className="mx-auto flex max-w-[720px] flex-col gap-6 md:gap-8">
        <AnimateIn>
          <h1 className="font-display text-display-lg font-bold text-ink">
            {hero.headline}
          </h1>
        </AnimateIn>
        <AnimateIn delay={0.06}>
          <p className="text-body-lg leading-relaxed text-ash">
            {hero.subtitle}
          </p>
        </AnimateIn>
      </div>
    </section>
  );
}
