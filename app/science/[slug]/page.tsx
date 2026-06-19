import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AnimateIn } from "@/components/product/animate-in";
import {
  getScienceArticleMeta,
  getScienceArticleSource,
  getScienceSlugs,
} from "@/lib/content/science";
import { compileMdxContent } from "@/lib/mdx";
import { createPageMetadata } from "@/lib/seo";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return getScienceSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const article = getScienceArticleMeta(slug);
  if (!article) return { title: "Article not found" };

  return createPageMetadata({
    title: article.title,
    description: article.description,
    path: `/science/${slug}`,
    type: "article",
  });
}

export default async function ScienceArticlePage({ params }: PageProps) {
  const { slug } = await params;
  const meta = getScienceArticleMeta(slug);
  const source = getScienceArticleSource(slug);

  if (!meta || !source) {
    notFound();
  }

  const { content } = await compileMdxContent(source);

  return (
    <main className="bg-[var(--color-paper)]">
      <article className="mx-auto max-w-[720px] px-6 py-20 md:px-12 md:py-28 lg:px-24 lg:py-32">
        <header className="mb-12 border-b border-[var(--color-sage)] pb-12">
          <AnimateIn>
            <Link
              href="/science"
              className="text-sm text-[var(--color-sage)] underline underline-offset-4 transition-opacity duration-200 ease-out hover:opacity-70"
            >
              ← Science
            </Link>
          </AnimateIn>
          <AnimateIn delay={0.06}>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <span className="mono text-[var(--color-stone)]">
                {meta.category.toUpperCase()}
              </span>
              <span className="font-[family-name:var(--font-mono)] text-xs text-[var(--color-stone)]">
                {meta.readTime}
              </span>
            </div>
          </AnimateIn>
          <AnimateIn delay={0.1}>
            <h1 className="mt-6 font-[family-name:var(--font-display)] text-[clamp(2rem,4vw,2.5rem)] leading-[1.15] tracking-[-0.02em] text-[var(--color-ink)]">
              {meta.title}
            </h1>
          </AnimateIn>
          <AnimateIn delay={0.14}>
            <p className="mt-6 text-base leading-relaxed text-[var(--color-stone)]">
              {meta.description}
            </p>
          </AnimateIn>
        </header>

        <AnimateIn delay={0.18}>{content}</AnimateIn>
      </article>
    </main>
  );
}
