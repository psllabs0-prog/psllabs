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
        "premium-card overflow-hidden",
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
              "w-full rounded-none px-5 py-5 text-base font-display font-bold tracking-[-0.02em] text-ink md:px-7 md:py-6 md:text-lg",
              "hover:no-underline hover:bg-soft-blue/40 active:bg-soft-blue/60"
            )}
          >
            {item.question}
          </AccordionTrigger>
          <AccordionContent className="border-t border-linen/60 bg-ice-blue/40 px-5 pb-6 text-base leading-[1.7] text-ash md:px-7 md:pb-7 md:text-[1.0625rem]">
            {item.answer.split("\n\n").map((paragraph) => (
              <p
                key={paragraph.slice(0, 32)}
                className="mb-4 last:mb-0"
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
