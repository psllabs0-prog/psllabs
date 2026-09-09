import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen, FileCheck, Search, ShieldCheck } from "lucide-react";

import { AnimateIn } from "@/components/product/animate-in";
import { JsonLd } from "@/components/seo/json-ld";
import { ANALYTICAL_GUIDES, type GuideCategory } from "@/lib/content/guides-data";
import { LEGAL_ENTITY_NAME } from "@/lib/content/testing-scope";
import { createPageMetadata, SITE_URL } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Guides",
  description:
    "Simple guides to help you read lab reports, check batch information, and understand the testing shown on our site.",
  path: "/guides",
});

const guidesCollectionLd = {
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  name: "PSL Labs Guides",
  description:
    "Simple guides for reading peptide lab reports, checking batch information, and understanding testing shown on the site.",
  url: `${SITE_URL}/guides`,
  publisher: {
    "@type": "Organization",
    name: LEGAL_ENTITY_NAME,
  },
  hasPart: ANALYTICAL_GUIDES.map((g) => ({
    "@type": "Article",
    headline: g.title,
    url: `${SITE_URL}/guides/${g.slug}`,
  })),
};

const breadcrumbLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
    { "@type": "ListItem", position: 2, name: "Guides", item: `${SITE_URL}/guides` },
  ],
};

const CATEGORIES: {
  id: GuideCategory;
  title: string;
  description: string;
}[] = [
  {
    id: "analytical-foundations",
    title: "1. Understanding Lab Results",
    description:
      "What identity, purity, and content mean, and what a lab report can and cannot tell you.",
  },
  {
    id: "verification-traceability",
    title: "2. Checking Your Reports",
    description:
      "How to match batch numbers, confirm the testing lab, and verify reports on the lab's own site.",
  },
  {
    id: "handling-stability",
    title: "3. Storage & Stability",
    description:
      "How to store freeze dried peptides and keep them in good condition.",
  },
];

export default function GuidesHubPage() {
  return (
    <>
      <JsonLd data={guidesCollectionLd} />
      <JsonLd data={breadcrumbLd} />

      <main className="min-h-screen bg-paper">
        <div className="mx-auto max-w-[1100px] px-6 py-12 md:px-12 md:py-16 lg:py-20">
          {/* Header */}
          <header className="mb-12 border-b border-linen pb-10 md:mb-16 md:pb-12">
            <AnimateIn>
              <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-accent">
                <BookOpen className="size-4 shrink-0" aria-hidden />
                <span>GUIDES</span>
              </div>
            </AnimateIn>

            <AnimateIn delay={0.06}>
              <h1 className="mt-4 font-[family-name:var(--font-display)] text-[clamp(2rem,4.5vw,3rem)] leading-[1.12] tracking-[-0.02em] text-ink font-bold">
                Guides
              </h1>
            </AnimateIn>

            <AnimateIn delay={0.1}>
              <p className="mt-5 max-w-3xl text-base leading-relaxed text-ash md:text-lg">
                Simple guides to help you read lab reports, check batch information, and understand the testing shown on our site.
              </p>
            </AnimateIn>

            <AnimateIn delay={0.14}>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Link
                  href="/coa"
                  className="inline-flex items-center gap-2 rounded-pill bg-accent px-5 py-2.5 text-xs font-semibold text-page transition-opacity hover:opacity-90"
                >
                  <Search className="size-3.5" aria-hidden />
                  <span>View Batch Reports</span>
                </Link>
                <Link
                  href="/testing"
                  className="inline-flex items-center gap-2 rounded-pill border border-border-strong bg-surface px-5 py-2.5 text-xs font-semibold text-ink transition-colors hover:bg-paper"
                >
                  <FileCheck className="size-3.5" aria-hidden />
                  <span>See Testing Details</span>
                </Link>
              </div>
            </AnimateIn>
          </header>

          {/* Guide Sections by Category */}
          <div className="flex flex-col gap-14 md:gap-18">
            {CATEGORIES.map((cat, catIndex) => {
              const guides = ANALYTICAL_GUIDES.filter((g) => g.category === cat.id);
              if (guides.length === 0) return null;

              return (
                <section key={cat.id} className="flex flex-col gap-6">
                  <AnimateIn delay={0.05 * catIndex}>
                    <div className="flex flex-col gap-1.5 border-b border-linen pb-3">
                      <h2 className="font-display text-xl font-bold text-ink sm:text-2xl">
                        {cat.title}
                      </h2>
                      <p className="text-xs text-ash sm:text-sm">
                        {cat.description}
                      </p>
                    </div>
                  </AnimateIn>

                  <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                    {guides.map((guide, gIndex) => (
                      <AnimateIn
                        key={guide.slug}
                        delay={0.06 + gIndex * 0.04}
                      >
                        <Link
                          href={`/guides/${guide.slug}`}
                          className="group flex h-full flex-col justify-between rounded-xl border border-linen bg-surface p-6 transition-all duration-200 hover:border-linen-dark hover:bg-paper/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                        >
                          <div className="flex flex-col gap-3">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-mono text-[0.6875rem] uppercase tracking-wider text-stone">
                                {guide.readTime}
                              </span>
                              {guide.featured && (
                                <span className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 font-mono text-[0.6875rem] font-semibold text-accent">
                                  <ShieldCheck className="size-3" aria-hidden />
                                  Core guide
                                </span>
                              )}
                            </div>

                            <h3 className="font-display text-lg font-bold text-ink transition-colors group-hover:text-accent sm:text-xl">
                              {guide.title}
                            </h3>

                            <p className="text-sm leading-relaxed text-ash line-clamp-3">
                              {guide.description}
                            </p>
                          </div>

                          <div className="mt-6 flex items-center justify-between border-t border-linen pt-4 text-xs font-mono text-stone">
                            <span>Updated: {guide.publishedDate}</span>
                            <span className="flex items-center gap-1.5 font-medium text-accent transition-transform group-hover:translate-x-1">
                              Read Guide
                              <ArrowRight className="size-3.5" aria-hidden />
                            </span>
                          </div>
                        </Link>
                      </AnimateIn>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>

          {/* Institutional Compliance Notice */}
          <AnimateIn delay={0.2} className="mt-16 pt-8 border-t border-linen">
            <div className="rounded-xl border border-linen bg-surface p-6 sm:p-8 text-xs text-ash space-y-2">
              <p className="font-mono font-semibold text-stone uppercase tracking-wider">
                Note
              </p>
              <p className="leading-relaxed">
                These guides explain how to read lab paperwork. They are not medical advice. All products discussed are for research use only.
              </p>
            </div>
          </AnimateIn>
        </div>
      </main>
    </>
  );
}
