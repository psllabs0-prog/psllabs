"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import type { ProductFaq } from "@/lib/products";

export function ProductFaq({ faqs }: { faqs: ProductFaq[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div className="public-section-card px-5 md:px-8">
      {faqs.map((faq, index) => {
        const isOpen = openIndex === index;

        return (
          <div
            key={faq.question}
            className="border-b border-linen last:border-b-0"
          >
            <button
              type="button"
              onClick={() => setOpenIndex(isOpen ? null : index)}
              className="flex min-h-14 w-full items-start justify-between gap-4 py-5 text-left transition-opacity duration-200 ease-out hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent motion-reduce:transition-none"
              aria-expanded={isOpen}
            >
              <span className="font-[family-name:var(--font-display)] text-base text-[var(--color-ink)]">
                {faq.question}
              </span>
              <ChevronDown
                className={cn(
                  "size-5 shrink-0 text-ash transition-transform duration-200 ease-out motion-reduce:transition-none",
                  isOpen && "rotate-180"
                )}
                aria-hidden
              />
            </button>
            <div
              className={cn(
                "grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none",
                isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
              )}
            >
              <div className="overflow-hidden">
                <p className="max-w-[65ch] pb-6 text-base leading-[1.7] text-ash">
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
