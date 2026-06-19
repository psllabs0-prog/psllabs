import type { Metadata } from "next";

import { ScienceArticleCard } from "@/components/content/science-article-card";
import { ContentPageLayout } from "@/components/content/content-page-layout";
import { AnimateIn } from "@/components/product/animate-in";
import { sciencePageMeta } from "@/lib/content/science-page";
import { getScienceArticles } from "@/lib/content/science";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Science",
  description: sciencePageMeta.description,
  path: "/science",
});

export default function SciencePage() {
  const articles = getScienceArticles();

  return (
    <ContentPageLayout meta={sciencePageMeta}>
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
