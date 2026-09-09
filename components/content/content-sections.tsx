import { ChevronDown } from "lucide-react";

import type { ContentSection } from "@/lib/content/types";

/**
 * Server-rendered section accordion.
 * Answers stay in HTML for crawlers and assistive tech even when panels are closed.
 */
export function ContentSections({ sections }: { sections: ContentSection[] }) {
  return (
    <div className="premium-card divide-y divide-linen overflow-hidden">
      {sections.map((section, index) => (
        <details
          key={section.id}
          id={section.id}
          className="group"
          open={index === 0}
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-5 font-display text-base font-bold tracking-[-0.02em] text-ink transition-colors hover:bg-soft-blue/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent md:px-7 md:py-6 md:text-lg [&::-webkit-details-marker]:hidden">
            <span className="min-w-0 flex-1">{section.title}</span>
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-linen bg-surface text-ash transition-transform duration-200 group-open:rotate-180">
              <ChevronDown className="size-4" aria-hidden />
            </span>
          </summary>
          <div className="border-t border-linen/60 bg-ice-blue/40 px-5 pb-6 text-base leading-[1.7] text-ash md:px-7 md:pb-7 md:text-[1.0625rem]">
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph.slice(0, 40)} className="mb-4 last:mb-0">
                {paragraph}
              </p>
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}
