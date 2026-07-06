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
    <HomeSection background="ice" size="editorial">
      <div className="mx-auto max-w-[800px]">
        <header className="mb-10 text-center md:mb-12">
          <p className="mono text-ash">FAQ</p>
          <h1 className="font-display text-display-lg font-bold text-ink">
            Common questions.
          </h1>
        </header>

        <Accordion className="premium-card px-2 md:px-4">
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
