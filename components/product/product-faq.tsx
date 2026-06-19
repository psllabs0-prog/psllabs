"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import type { ProductFaq } from "@/lib/products";

export function ProductFaq({ faqs }: { faqs: ProductFaq[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div className="border-t border-[var(--color-sage)]">
      {faqs.map((faq, index) => {
        const isOpen = openIndex === index;

        return (
          <div
            key={faq.question}
            className="border-b border-[var(--color-sage)]"
          >
            <button
              type="button"
              onClick={() => setOpenIndex(isOpen ? null : index)}
              className="flex w-full items-start justify-between gap-4 py-5 text-left transition-opacity duration-200 ease-out hover:opacity-80"
              aria-expanded={isOpen}
            >
              <span className="font-[family-name:var(--font-display)] text-base text-[var(--color-ink)]">
                {faq.question}
              </span>
              <ChevronDown
                className={cn(
                  "size-5 shrink-0 text-[var(--color-stone)] transition-transform duration-200 ease-out",
                  isOpen && "rotate-180"
                )}
                aria-hidden
              />
            </button>
            <div
              className={cn(
                "grid transition-[grid-template-rows] duration-300 ease-out",
                isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
              )}
            >
              <div className="overflow-hidden">
                <p className="pb-6 text-base leading-relaxed text-[var(--color-stone)]">
                  {faq.answer}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
