import { AnimateIn } from "@/components/product/animate-in";
import type { AboutContent } from "@/lib/about";
import { cn } from "@/lib/utils";

const cardClass = "premium-card p-6 md:p-7";

type AboutMissionProps = {
  mission: AboutContent["mission"];
  valueCards: AboutContent["valueCards"];
};

export function AboutMission({ mission, valueCards }: AboutMissionProps) {
  return (
    <section className="section-surface-soft px-6 py-12 md:px-16 md:py-16 lg:px-24 lg:py-20">
      <div className="mx-auto flex max-w-[960px] flex-col gap-12 md:gap-16">
        <AnimateIn>
          <article className={cn(cardClass, "flex flex-col gap-4")}>
            <h2 className="font-display text-display-md font-bold text-ink">
              {mission.title}
            </h2>
            <p className="text-base leading-relaxed text-ash md:text-body-lg">
              {mission.body}
            </p>
          </article>
        </AnimateIn>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3 md:gap-8">
          {valueCards.map((card, index) => (
            <AnimateIn key={card.title} delay={0.06 + index * 0.05}>
              <article className={cn(cardClass, "flex h-full flex-col gap-3")}>
                <h3 className="font-display text-lg font-bold text-ink">
                  {card.title}
                </h3>
                <p className="text-sm leading-relaxed text-ash md:text-base">
                  {card.body}
                </p>
              </article>
            </AnimateIn>
          ))}
        </div>
      </div>
    </section>
  );
}
