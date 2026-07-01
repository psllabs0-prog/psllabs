import { AnimateIn } from "@/components/product/animate-in";
import { LabPhotoPanel } from "@/components/about/lab-photo-panel";
import type { AboutContent } from "@/lib/about";

type AboutMissionProps = {
  mission: AboutContent["mission"];
  photos: AboutContent["labPhotos"];
};

export function AboutMission({ mission, photos }: AboutMissionProps) {
  const gridPhotos = photos.slice(1, 4);

  return (
    <section className="px-6 py-20 md:px-16 md:py-28 lg:px-24 lg:py-32">
      <div className="mx-auto max-w-[1440px]">
        <div className="grid grid-cols-1 gap-16 lg:grid-cols-2 lg:gap-20 xl:gap-28">
          <div className="flex flex-col gap-10">
            <AnimateIn>
              <div className="flex flex-col gap-5">
                <p className="mono text-biotech-deep/80">{mission.label}</p>
                <h2 className="font-display text-display-md font-bold text-ink">
                  {mission.title}
                </h2>
              </div>
            </AnimateIn>

            <AnimateIn delay={0.06} className="flex flex-col gap-5">
              {mission.paragraphs.map((paragraph) => (
                <p
                  key={paragraph.slice(0, 48)}
                  className="text-base leading-relaxed text-ash md:text-body-lg"
                >
                  {paragraph}
                </p>
              ))}
            </AnimateIn>

            <div className="flex flex-col gap-5">
              {mission.principles.map((principle, index) => (
                <AnimateIn key={principle.title} delay={0.1 + index * 0.05}>
                  <div className="rounded-xl border border-linen bg-lab-white p-6 shadow-[0_2px_12px_rgba(26,77,109,0.05)]">
                    <h3 className="font-display text-lg font-bold text-ink">
                      {principle.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-ash md:text-base">
                      {principle.description}
                    </p>
                  </div>
                </AnimateIn>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 md:gap-6">
            {gridPhotos.map((photo, index) => (
              <AnimateIn
                key={photo.id}
                delay={0.08 + index * 0.06}
                className={index === 1 ? "mt-8 md:mt-12" : undefined}
              >
                <LabPhotoPanel photo={photo} />
              </AnimateIn>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
