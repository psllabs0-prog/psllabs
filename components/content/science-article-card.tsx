import Link from "next/link";

import type { ScienceArticleMeta } from "@/lib/content/types";

export function ScienceArticleCard({ article }: { article: ScienceArticleMeta }) {
  return (
    <Link
      href={`/science/${article.slug}`}
      className="group flex flex-col gap-4 border border-[var(--color-sage)] bg-[var(--color-lab-white)] p-6 transition-transform duration-200 ease-out hover:-translate-y-1 md:p-8"
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="mono text-[var(--color-stone)]">
          {article.category.toUpperCase()}
        </span>
        <span className="font-[family-name:var(--font-mono)] text-xs text-[var(--color-stone)]">
          {article.readTime}
        </span>
      </div>

      <h2 className="font-[family-name:var(--font-display)] text-xl leading-tight tracking-[-0.02em] text-[var(--color-ink)] md:text-2xl">
        {article.title}
      </h2>

      <p className="flex-1 text-sm leading-relaxed text-[var(--color-stone)] md:text-base">
        {article.description}
      </p>

      <span className="text-sm text-[var(--color-sage)] underline underline-offset-4 transition-opacity duration-200 ease-out group-hover:opacity-70">
        Read article →
      </span>
    </Link>
  );
}
