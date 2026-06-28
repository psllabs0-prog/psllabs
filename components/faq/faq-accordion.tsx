"use client";

import { Accordion } from "@/components/ui/accordion";
import { FaqItem } from "@/components/ui/faq-item";
import { HomeSection } from "@/components/ui/home-section";
import type { SiteFaqItem } from "@/lib/content/site-faq";

type FaqAccordionProps = {
  items: SiteFaqItem[];
};

export function FaqAccordion({ items }: FaqAccordionProps) {
  return (
    <HomeSection background="paper" size="editorial">
      <div className="mx-auto max-w-[800px]">
        <header className="mb-12 text-center md:mb-16">
          <p className="mono mb-4 text-slate-muted">FAQ</p>
          <h1 className="font-display text-[clamp(2rem,4vw,3rem)] font-bold leading-[1.08] tracking-[-0.02em] text-near-black">
            Common questions.
          </h1>
        </header>

        <Accordion className="rounded-3xl border border-near-black/5 bg-[var(--color-lab-white)] px-6 md:px-10">
          {items.map((item) => (
            <FaqItem
              key={item.id}
              id={item.id}
              question={item.question}
              answer={item.answer}
            />
          ))}
        </Accordion>
      </div>
    </HomeSection>
  );
}
