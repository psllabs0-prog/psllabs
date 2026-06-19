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
  items: FaqItem[];
  className?: string;
  /** Allow multiple panels open at once */
  multiple?: boolean;
};

export function ContentAccordion({
  items,
  className,
  multiple = true,
}: ContentAccordionProps) {
  return (
    <Accordion
      className={cn("border-t border-[var(--color-sage)]", className)}
      {...(multiple ? {} : {})}
    >
      {items.map((item, index) => (
        <AccordionItem
          key={item.question}
          value={`item-${index}`}
          className="border-b border-[var(--color-sage)]"
        >
          <AccordionTrigger
            className={cn(
              "rounded-none py-5 text-left text-base font-[family-name:var(--font-display)] font-normal text-[var(--color-ink)]",
              "hover:no-underline focus-visible:ring-[var(--color-sage)]/30"
            )}
          >
            {item.question}
          </AccordionTrigger>
          <AccordionContent className="pb-6 text-base leading-relaxed text-[var(--color-stone)]">
            {item.answer.split("\n\n").map((paragraph) => (
              <p key={paragraph.slice(0, 32)} className="mb-4 last:mb-0">
                {paragraph}
              </p>
            ))}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
