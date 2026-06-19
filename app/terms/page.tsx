import type { Metadata } from "next";

import { ContentPageLayout } from "@/components/content/content-page-layout";
import { ContentSections } from "@/components/content/content-sections";
import { termsPageMeta, termsSections } from "@/lib/content/terms";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Terms of Service",
  description: termsPageMeta.description,
  path: "/terms",
});

export default function TermsPage() {
  return (
    <ContentPageLayout meta={termsPageMeta}>
      <ContentSections sections={termsSections} />
    </ContentPageLayout>
  );
}
