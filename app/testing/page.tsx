import type { Metadata } from "next";

import { ContentPageLayout } from "@/components/content/content-page-layout";
import { ContentSections } from "@/components/content/content-sections";
import { testingPageMeta, testingSections } from "@/lib/content/testing";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Testing & Quality",
  description: testingPageMeta.description,
  path: "/testing",
});

export default function TestingPage() {
  return (
    <ContentPageLayout meta={testingPageMeta}>
      <ContentSections sections={testingSections} />
    </ContentPageLayout>
  );
}
