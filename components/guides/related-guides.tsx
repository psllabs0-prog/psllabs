"use client";

import Link from "next/link";
import { ArrowRight, BookOpen } from "lucide-react";

import { getRelatedGuides, type GuideMeta } from "@/lib/content/guides-data";
import { trackRelatedGuideClick } from "@/lib/analytics/guide-events";

type RelatedGuidesProps = {
  currentSlug: string;
  customGuides?: GuideMeta[];
  className?: string;
};

export function RelatedGuides({
  currentSlug,
  customGuides,
  className = "",
}: RelatedGuidesProps) {
  const guides = customGuides ?? getRelatedGuides(currentSlug, 3);

  if (guides.length === 0) return null;

  return (
    <section className={`flex flex-col gap-5 ${className}`}>
      <div className="flex items-center gap-2 border-b border-linen pb-3 text-xs font-mono uppercase tracking-wider text-accent">
        <BookOpen className="size-4 shrink-0" aria-hidden />
        <span>Related Analytical Guides</span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {guides.map((guide) => (
          <Link
            key={guide.slug}
            href={`/guides/${guide.slug}`}
            onClick={() => trackRelatedGuideClick(guide.slug, currentSlug)}
            className="group flex flex-col justify-between rounded-xl border border-linen bg-surface p-5 transition-all duration-200 hover:border-linen-dark hover:bg-paper/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            <div className="flex flex-col gap-2.5">
              <span className="font-mono text-[0.6875rem] uppercase tracking-wider text-stone">
                {guide.categoryLabel}
              </span>
              <h4 className="font-display text-base font-bold text-ink transition-colors group-hover:text-accent">
                {guide.title}
              </h4>
              <p className="line-clamp-3 text-xs leading-relaxed text-ash">
                {guide.description}
              </p>
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-linen pt-3 text-xs font-mono text-stone">
              <span>{guide.readTime}</span>
              <span className="flex items-center gap-1 font-medium text-accent transition-transform group-hover:translate-x-0.5">
                Read guide
                <ArrowRight className="size-3" aria-hidden />
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
