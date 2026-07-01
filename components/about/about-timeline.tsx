import { AnimateIn } from "@/components/product/animate-in";
import type { AboutContent } from "@/lib/about";

type AboutTimelineProps = {
  timeline: AboutContent["timeline"];
};

export function AboutTimeline({ timeline }: AboutTimelineProps) {
  return (
    <section className="border-t border-linen bg-gradient-to-b from-lab-white to-biotech-mist/30 px-6 py-20 md:px-16 md:py-28 lg:px-24 lg:py-32">
      <div className="mx-auto max-w-[900px]">
        <AnimateIn className="mb-14 text-center md:mb-20">
          <p className="mono text-biotech-deep/80">{timeline.label}</p>
          <h2 className="mt-5 font-display text-display-md font-bold text-ink">
            {timeline.title}
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-body-lg leading-relaxed text-ash">
            {timeline.intro}
          </p>
        </AnimateIn>

        <div className="relative">
          <div
            aria-hidden
            className="absolute left-6 top-0 hidden h-full w-px bg-gradient-to-b from-biotech-blue/40 via-biotech-blue/20 to-transparent md:left-1/2 md:block md:-translate-x-px"
          />

          <ol className="flex flex-col gap-10 md:gap-0">
            {timeline.events.map((event, index) => {
              const isEven = index % 2 === 0;

              return (
                <AnimateIn key={event.phase} delay={0.05 + index * 0.06}>
                  <li className="relative md:grid md:grid-cols-2 md:gap-12 md:py-8">
                    <div
                      aria-hidden
                      className="absolute left-6 top-8 hidden size-3 -translate-x-1/2 rounded-full border-2 border-lab-white bg-biotech-blue shadow-[0_0_0_4px_rgba(61,107,140,0.12)] md:left-1/2 md:block"
                    />

                    <div
                      className={
                        isEven
                          ? "md:col-start-1 md:pr-16 md:text-right"
                          : "md:col-start-2 md:pl-16"
                      }
                    >
                      <div className="ml-14 rounded-2xl border border-linen bg-lab-white p-6 shadow-[0_2px_16px_rgba(26,77,109,0.06)] md:ml-0 md:p-8">
                        <span className="font-[family-name:var(--font-mono)] text-[0.7rem] uppercase tracking-[0.12em] text-biotech-deep/70">
                          Phase {event.phase}
                        </span>
                        <h3 className="mt-2 font-display text-xl font-bold text-ink md:text-2xl">
                          {event.title}
                        </h3>
                        <p className="mt-3 text-sm leading-relaxed text-ash md:text-base">
                          {event.description}
                        </p>
                      </div>
                    </div>

                    <div
                      aria-hidden
                      className={
                        isEven
                          ? "hidden md:col-start-2 md:block"
                          : "hidden md:col-start-1 md:row-start-1 md:block"
                      }
                    />
                  </li>
                </AnimateIn>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}
