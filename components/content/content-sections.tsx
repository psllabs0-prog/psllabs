import { ChevronDown } from "lucide-react";

import { AnimateIn } from "@/components/product/animate-in";
import type { ContentSection } from "@/lib/content/types";

/**
 * Server-rendered section accordion.
 * Answers stay in HTML for crawlers and assistive tech even when panels are closed.
 */
export function ContentSections({ sections }: { sections: ContentSection[] }) {
  return (
    <div className="flex flex-col gap-4">
      {sections.map((section, index) => (
        <AnimateIn key={section.id}>
          <details
            id={section.id}
            className="public-section-card group overflow-hidden"
            open={index === 0}
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-5 font-display text-base font-bold tracking-[-0.02em] text-ink transition-colors hover:bg-soft-blue/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent md:px-7 md:py-6 md:text-lg [&::-webkit-details-marker]:hidden">
              <span className="min-w-0 flex-1">{section.title}</span>
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-linen bg-surface text-ash transition-transform duration-200 group-open:rotate-180">
                <ChevronDown className="size-4" aria-hidden />
              </span>
            </summary>
            <div className="border-t border-linen/60 bg-ice-blue/40 px-5 py-6 text-base leading-[1.7] text-ash md:px-7 md:py-7 md:text-[1.0625rem]">
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph.slice(0, 40)} className="mb-4 last:mb-0">
                  {paragraph}
                </p>
              ))}
            </div>
          </details>
        </AnimateIn>
      ))}
    </div>
  );
}
