import Link from "next/link";

import { HomeSection } from "@/components/ui/home-section";
import { PillButton } from "@/components/ui/pill-button";
import type { ScienceArticleMeta } from "@/lib/content/types";

type ResearchResourcesProps = {
  articles: ScienceArticleMeta[];
};

export function ResearchResources({ articles }: ResearchResourcesProps) {
  const featured = articles.slice(0, 3);

  return (
    <HomeSection background="blush" size="editorial">
      <div className="mx-auto max-w-[1440px]">
        <div className="mb-16 flex flex-col gap-8 md:mb-20 md:flex-row md:items-end md:justify-between">
          <header className="max-w-2xl">
            <p className="mono mb-4 text-slate-muted">RESEARCH LIBRARY</p>
            <h2 className="font-display text-[clamp(2rem,4vw,3rem)] font-bold leading-[1.08] tracking-[-0.02em] text-near-black">
              Evidence-first resources.
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-slate-muted">
              Plain-language guides on testing, protocols, and the science behind
              each compound in the stack.
            </p>
          </header>
          <PillButton href="/science" variant="secondary" className="w-fit shrink-0">
            Browse all articles
          </PillButton>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3 md:gap-8">
          {featured.map((article) => (
            <Link
              key={article.slug}
              href={`/science/${article.slug}`}
              className="group flex flex-col gap-6 rounded-3xl border border-near-black/5 bg-[var(--color-lab-white)] p-8 transition-transform duration-200 ease-out hover:-translate-y-1 md:p-10"
            >
              <div className="flex flex-wrap items-center gap-3">
                <span className="mono text-slate-muted">
                  {article.category.toUpperCase()}
                </span>
                <span className="font-[family-name:var(--font-mono)] text-xs text-slate-muted">
                  {article.readTime}
                </span>
              </div>

              <h3 className="font-display text-xl font-bold leading-snug tracking-[-0.02em] text-near-black md:text-2xl">
                {article.title}
              </h3>

              <p className="flex-1 text-base leading-relaxed text-slate-muted">
                {article.description}
              </p>

              <span className="text-sm font-medium text-[var(--color-sage)] underline underline-offset-4 transition-opacity duration-200 ease-out group-hover:opacity-70">
                Read article →
              </span>
            </Link>
          ))}
        </div>
      </div>
    </HomeSection>
  );
}
