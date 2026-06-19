import type { Metadata } from "next";

import { ContentPageLayout } from "@/components/content/content-page-layout";
import { FaqCategories } from "@/components/content/faq-categories";
import { faqCategories, faqPageMeta } from "@/lib/content/faq";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "FAQ",
  description: faqPageMeta.description,
  path: "/faq",
});

export default function FaqPage() {
  return (
    <ContentPageLayout meta={faqPageMeta}>
      <FaqCategories categories={faqCategories} />
    </ContentPageLayout>
  );
}
