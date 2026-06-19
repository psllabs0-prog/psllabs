"use client";

import { AnimateIn } from "@/components/product/animate-in";
import { ContentAccordion } from "@/components/content/content-accordion";
import type { FaqCategory } from "@/lib/content/types";

export function FaqCategories({ categories }: { categories: FaqCategory[] }) {
  return (
    <>
      {categories.map((category, index) => (
        <AnimateIn key={category.id} delay={index * 0.06}>
          <section>
            <h2 className="mb-6 font-[family-name:var(--font-display)] text-xl text-[var(--color-ink)] md:text-2xl">
              {category.title}
            </h2>
            <ContentAccordion items={category.items} />
          </section>
        </AnimateIn>
      ))}
    </>
  );
}
