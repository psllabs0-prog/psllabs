"use client";

import { AnimateIn } from "@/components/product/animate-in";
import { ContentAccordion } from "@/components/content/content-accordion";
import type { ContentSection } from "@/lib/content/types";

export function ContentSections({ sections }: { sections: ContentSection[] }) {
  const accordionItems = sections.map((section) => ({
    question: section.title,
    answer: section.paragraphs.join("\n\n"),
  }));

  return (
    <AnimateIn>
      <ContentAccordion items={accordionItems} multiple />
    </AnimateIn>
  );
}
