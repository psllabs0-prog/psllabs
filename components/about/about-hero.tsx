import { AnimateIn } from "@/components/product/animate-in";
import type { AboutContent } from "@/lib/about";

type AboutHeroProps = {
  hero: AboutContent["hero"];
};

export function AboutHero({ hero }: AboutHeroProps) {
  return (
    <section className="border-b border-linen bg-gradient-to-br from-paper via-lab-white to-biotech-mist px-6 py-16 md:px-16 md:py-24 lg:px-24 lg:py-28">
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
