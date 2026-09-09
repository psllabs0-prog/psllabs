import { ChevronDown } from "lucide-react";
import type { SiteFaqItem } from "@/lib/content/site-faq";

type FaqAccordionProps = {
  items: SiteFaqItem[];
};

export function FaqAccordion({ items }: FaqAccordionProps) {
  return (
    <section className="section-surface-ice px-6 py-14 md:px-16 md:py-20 lg:px-24">
      <div className="mx-auto max-w-[840px]">
        <header className="mb-10 text-center md:mb-14">
          <p className="mono text-accent">FREQUENTLY ASKED QUESTIONS</p>
          <h1 className="mt-2 font-display text-display-lg font-bold text-ink">
            Frequently Asked Questions
          </h1>
          <p className="mt-3 text-base leading-relaxed text-ash md:text-lg">
            Answers regarding research compliance, third-party testing, batch documentation, shipping, and accepted payment methods.
          </p>
        </header>

        <div className="premium-card divide-y divide-linen p-6 md:p-8">
          {items.map((item) => (
            <details
              key={item.id}
              id={item.id}
              className="group py-5 first:pt-0 last:pb-0"
              open
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-display text-lg font-bold text-ink transition-colors hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent md:text-xl [&::-webkit-details-marker]:hidden">
                <span className="min-w-0 flex-1">{item.question}</span>
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-linen bg-surface text-ash transition-transform duration-200 group-open:rotate-180 group-hover:text-ink">
                  <ChevronDown className="size-4" aria-hidden />
                </span>
              </summary>
              <div className="mt-3.5 text-base leading-relaxed text-ash pr-8 md:text-[1.0625rem]">
                <p>{item.answer}</p>
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
