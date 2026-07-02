"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import type { FaqItem } from "@/lib/content/types";

type ContentAccordionProps = {
  items: (FaqItem & { id?: string })[];
  className?: string;
  /** Allow multiple panels open at once */
  multiple?: boolean;
};

export function ContentAccordion({
  items,
  className,
  multiple = false,
}: ContentAccordionProps) {
  return (
    <Accordion
      multiple={multiple}
      className={cn(
        "relative z-0 overflow-hidden rounded-2xl border border-linen bg-lab-white shadow-[0_2px_16px_rgba(26,77,109,0.06)]",
        className
      )}
    >
      {items.map((item, index) => (
        <AccordionItem
          key={item.id ?? item.question}
          value={item.id ?? `item-${index}`}
          className="border-b border-linen last:border-b-0"
        >
          <AccordionTrigger
            className={cn(
              "rounded-none px-6 py-5 text-base font-display font-bold tracking-[-0.02em] text-ink md:px-8 md:py-6 md:text-lg",
              "hover:no-underline"
            )}
          >
            {item.question}
          </AccordionTrigger>
          <AccordionContent className="px-6 pb-6 text-base leading-relaxed text-ash md:px-8 md:pb-8">
            {item.answer.split("\n\n").map((paragraph) => (
              <p
                key={paragraph.slice(0, 32)}
                className={cn(
                  "mb-4 last:mb-0",
                  paragraph.startsWith("[PLACEHOLDER:")
                    ? "rounded-lg border border-dashed border-linen bg-paper/80 px-4 py-3 font-[family-name:var(--font-mono)] text-sm leading-relaxed text-ash"
                    : undefined
                )}
              >
                {paragraph}
              </p>
            ))}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
