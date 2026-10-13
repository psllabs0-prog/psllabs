import type { Metadata } from "next";
import Link from "next/link";

import { ScienceArticleCard } from "@/components/content/science-article-card";
import { ContentPageLayout } from "@/components/content/content-page-layout";
import { AnimateIn } from "@/components/product/animate-in";
import { sciencePageMeta } from "@/lib/content/science-page";
import { getScienceArticles } from "@/lib/content/science";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Laboratory Report Documentation Reference",
  description: sciencePageMeta.description,
  path: "/science",
});

export default function SciencePage() {
  const articles = getScienceArticles();

  return (
    <ContentPageLayout meta={sciencePageMeta} breadcrumbs={[{ name: "Home", path: "/" }, { name: "Documentation reference", path: "/science" }]}>
      <div className="mb-8 border-b border-linen pb-6 text-sm leading-relaxed text-ash">
        <p>Need a file or help with PSL’s lookup? Start below. For general measurement explanations, use the <Link href="/guides" className="text-accent underline underline-offset-4">peptide testing guides</Link>. To open a report directly, visit <Link href="/coa" className="text-accent underline underline-offset-4">Batch Reports</Link>.</p>
      </div>
      <div className="grid grid-cols-1 gap-6 md:gap-8">
        {articles.map((article, index) => (
          <AnimateIn key={article.slug} delay={index * 0.05}>
            <ScienceArticleCard article={article} />
          </AnimateIn>
        ))}
      </div>
    </ContentPageLayout>
  );
}
