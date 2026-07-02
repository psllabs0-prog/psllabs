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
        "relative z-0 rounded-2xl border border-linen bg-lab-white shadow-[0_2px_16px_rgba(26,77,109,0.06)]",
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
              "w-full rounded-none px-5 py-6 text-base font-display font-bold tracking-[-0.02em] text-ink md:px-8 md:py-7 md:text-lg",
              "hover:no-underline active:bg-biotech-mist/50"
            )}
          >
            {item.question}
          </AccordionTrigger>
          <AccordionContent className="px-5 pb-7 text-base leading-[1.7] text-ash md:px-8 md:pb-8 md:text-[1.0625rem]">
            {item.answer.split("\n\n").map((paragraph) => (
              <p
                key={paragraph.slice(0, 32)}
                className="mb-5 last:mb-0"
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
