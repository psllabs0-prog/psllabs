"use client";

import { useEffect } from "react";
import { AnimateIn } from "@/components/product/animate-in";
import { GuideBreadcrumbs } from "./guide-breadcrumbs";
import { GuideTableOfContents, type TocItem } from "./guide-table-of-contents";
import { RelatedGuides } from "./related-guides";
import { BatchDocumentationCTA } from "./batch-documentation-cta";
import { trackGuideView } from "@/lib/analytics/guide-events";
import type { GuideMeta } from "@/lib/content/guides-data";

type GuideLayoutProps = {
  guide: GuideMeta;
  tocItems?: TocItem[];
  relatedGuides?: GuideMeta[];
  children: React.ReactNode;
};

export function GuideLayout({
  guide,
  tocItems = [],
  relatedGuides,
  children,
}: GuideLayoutProps) {
  useEffect(() => {
    trackGuideView(guide.slug);
  }, [guide.slug]);

  return (
    <main className="min-h-screen bg-paper">
      <article className="mx-auto max-w-[760px] px-6 py-12 md:px-12 md:py-16 lg:py-20">
        {/* Breadcrumbs */}
        <AnimateIn>
          <GuideBreadcrumbs
            items={[{ label: guide.shortTitle }]}
            className="mb-8"
          />
        </AnimateIn>

        {/* Header */}
        <header className="mb-10 border-b border-linen pb-8 md:mb-12 md:pb-10">
          <AnimateIn delay={0.04}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="mono text-accent uppercase text-xs tracking-wider">
                {guide.categoryLabel}
              </span>
              <span className="mono text-stone">·</span>
              <span className="mono text-stone text-xs">
                ANALYTICAL REFERENCE GUIDE
              </span>
            </div>
          </AnimateIn>

          <AnimateIn delay={0.08}>
            <h1 className="mt-4 font-[family-name:var(--font-display)] text-[clamp(2rem,4vw,2.5rem)] leading-[1.15] tracking-[-0.02em] text-ink font-bold">
              {guide.title}
            </h1>
          </AnimateIn>

          <AnimateIn delay={0.12}>
            <p className="mt-5 text-base leading-relaxed text-ash md:text-[1.0625rem]">
              {guide.description}
            </p>
          </AnimateIn>

          {/* Metadata Row */}
          <AnimateIn delay={0.16}>
            <div className="mt-6 flex flex-wrap items-center gap-y-2 gap-x-4 border-t border-linen pt-4 text-xs font-mono text-stone">
              <span>Published by PSL Labs</span>
              <span>·</span>
              <time dateTime={guide.publishedDate}>
                Published: {guide.publishedDate}
              </time>
              <span>·</span>
              <span>{guide.readTime}</span>
              <span>·</span>
              <span className="text-accent font-medium">Research Use Only</span>
            </div>
          </AnimateIn>
        </header>

        {/* Table of Contents */}
        {tocItems.length > 0 && (
          <AnimateIn delay={0.18} className="mb-10 md:mb-12">
            <GuideTableOfContents items={tocItems} />
          </AnimateIn>
        )}

        {/* Article Body Content */}
        <div className="flex flex-col gap-10 text-base leading-relaxed text-ink md:gap-12 md:text-[1.0625rem]">
          {children}
        </div>

        {/* Institutional & RUO Notice */}
        <AnimateIn delay={0.2} className="mt-14 pt-8 border-t border-linen">
          <div className="rounded-xl border border-linen bg-surface p-5 sm:p-6 text-xs text-ash space-y-2">
            <p className="font-mono font-semibold text-stone uppercase tracking-wider">
              Research Use Compliance Notice
            </p>
            <p className="leading-relaxed">
              This guide is prepared for institutional researchers, analytical chemists, and laboratory personnel evaluating reference standards and chemical documentation. Materials discussed are intended strictly for in vitro laboratory research and analytical calibration. Not for human or veterinary administration, clinical therapy, or consumer use.
            </p>
          </div>
        </AnimateIn>

        {/* Batch Documentation CTA */}
        <AnimateIn delay={0.22} className="mt-10">
          <BatchDocumentationCTA guideSlug={guide.slug} />
        </AnimateIn>

        {/* Related Guides Cluster */}
        <AnimateIn delay={0.24} className="mt-12">
          <RelatedGuides
            currentSlug={guide.slug}
            customGuides={relatedGuides}
          />
        </AnimateIn>
      </article>
    </main>
  );
}
