import Link from "next/link";

import { LabIllustration } from "@/components/illustrations/lab-illustrations";
import { AnimateIn } from "@/components/product/animate-in";
import type { AboutContent } from "@/lib/about";

type AboutTestingStandardsProps = {
  testingStandards: AboutContent["testingStandards"];
};

export function AboutTestingStandards({
  testingStandards,
}: AboutTestingStandardsProps) {
  return (
    <section className="px-6 py-20 md:px-16 md:py-28 lg:px-24 lg:py-32">
      <div className="mx-auto max-w-[1440px]">
        <AnimateIn className="mb-14 flex max-w-2xl flex-col gap-5 md:mb-20">
          <p className="mono text-biotech-deep/80">{testingStandards.label}</p>
          <h2 className="font-display text-display-md font-bold text-ink">
            {testingStandards.title}
          </h2>
          <p className="text-body-lg leading-relaxed text-ash">
            {testingStandards.intro}
          </p>
        </AnimateIn>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 lg:gap-8">
          {testingStandards.standards.map((standard, index) => (
            <AnimateIn key={standard.title} delay={0.04 + index * 0.04}>
              <article className="flex h-full flex-col gap-5 rounded-2xl border border-linen bg-lab-white p-6 shadow-[0_2px_16px_rgba(26,77,109,0.06)] md:p-8">
                <div className="size-16 shrink-0 overflow-hidden rounded-xl">
                  <LabIllustration
                    id={standard.illustrationId}
                    className="size-full"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <h3 className="font-display text-lg font-bold text-ink">
                    {standard.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-ash md:text-base">
                    {standard.description}
                  </p>
                </div>
              </article>
            </AnimateIn>
          ))}
        </div>

        <AnimateIn delay={0.3} className="mt-12 text-center md:mt-16">
          <Link
            href="/testing"
            className="text-sm font-medium text-petrol underline underline-offset-4 transition-opacity duration-200 ease-out hover:opacity-70"
          >
            Read full testing &amp; quality standards →
          </Link>
        </AnimateIn>
      </div>
    </section>
  );
}
