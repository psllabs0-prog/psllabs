import { AnimateIn } from "@/components/product/animate-in";
import { LabPhotoPanel } from "@/components/about/lab-photo-panel";
import type { AboutContent } from "@/lib/about";

type AboutHeroProps = {
  hero: AboutContent["hero"];
  featuredPhoto: AboutContent["labPhotos"][number];
};

export function AboutHero({ hero, featuredPhoto }: AboutHeroProps) {
  return (
    <section className="relative overflow-hidden border-b border-linen bg-gradient-to-br from-paper via-lab-white to-biotech-mist px-6 py-20 md:px-16 md:py-28 lg:px-24 lg:py-32">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-32 top-0 h-[480px] w-[480px] rounded-full bg-biotech-light/40 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 bottom-0 h-80 w-80 rounded-full bg-biotech-pale/60 blur-3xl"
      />

      <div className="relative mx-auto grid max-w-[1440px] grid-cols-1 items-center gap-14 lg:grid-cols-2 lg:gap-20 xl:gap-24">
        <div className="flex flex-col gap-8 lg:gap-10">
          <AnimateIn>
            <p className="mono text-biotech-deep/80">{hero.label}</p>
          </AnimateIn>
          <AnimateIn delay={0.06}>
            <h1 className="font-display text-display-lg font-bold text-ink">
              {hero.headline}
            </h1>
          </AnimateIn>
          <AnimateIn delay={0.1}>
            <p className="max-w-xl text-body-lg leading-relaxed text-ash">
              {hero.intro}
            </p>
          </AnimateIn>
        </div>

        <AnimateIn delay={0.14} className="mx-auto w-full max-w-md lg:max-w-none">
          <LabPhotoPanel photo={featuredPhoto} priority className="lg:ml-auto lg:max-w-[420px]" />
        </AnimateIn>
      </div>
    </section>
  );
}
