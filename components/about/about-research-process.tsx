import { AnimateIn } from "@/components/product/animate-in";
import type { AboutContent } from "@/lib/about";

type AboutResearchProcessProps = {
  researchProcess: AboutContent["researchProcess"];
};

export function AboutResearchProcess({ researchProcess }: AboutResearchProcessProps) {
  return (
    <section className="border-y border-linen bg-biotech-mist/40 px-6 py-20 md:px-16 md:py-28 lg:px-24 lg:py-32">
      <div className="mx-auto max-w-[1440px]">
        <AnimateIn className="mb-14 max-w-2xl md:mb-20">
          <p className="mono text-biotech-deep/80">{researchProcess.label}</p>
          <h2 className="mt-5 font-display text-display-md font-bold text-ink">
            {researchProcess.title}
          </h2>
          <p className="mt-5 text-body-lg leading-relaxed text-ash">
            {researchProcess.intro}
          </p>
        </AnimateIn>

        <ol className="relative flex flex-col gap-0">
          {researchProcess.steps.map((step, index) => (
            <AnimateIn key={step.step} delay={0.05 + index * 0.05}>
              <li className="relative grid grid-cols-1 gap-6 border-l border-biotech-blue/25 pb-12 pl-8 last:pb-0 md:grid-cols-[auto_1fr] md:gap-10 md:pl-12 md:pb-14">
                <div
                  aria-hidden
                  className="absolute -left-[5px] top-0 size-2.5 rounded-full border-2 border-lab-white bg-biotech-blue shadow-[0_0_0_4px_rgba(61,107,140,0.15)]"
                />
                <div className="flex items-start gap-4 md:flex-col md:gap-2 md:pt-1">
                  <span className="font-[family-name:var(--font-mono)] text-[0.7rem] uppercase tracking-[0.12em] text-biotech-deep/70">
                    Step
                  </span>
                  <span className="font-display text-3xl font-bold leading-none text-biotech-blue/40 md:text-4xl">
                    {String(step.step).padStart(2, "0")}
                  </span>
                </div>
                <div className="flex flex-col gap-3 rounded-2xl border border-linen bg-lab-white p-6 shadow-[0_2px_16px_rgba(26,77,109,0.06)] md:p-8">
                  <h3 className="font-display text-xl font-bold text-ink md:text-2xl">
                    {step.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-ash md:text-base">
                    {step.description}
                  </p>
                </div>
              </li>
            </AnimateIn>
          ))}
        </ol>
      </div>
    </section>
  );
}
