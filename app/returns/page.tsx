import type { Metadata } from "next";

import { ContentPageLayout } from "@/components/content/content-page-layout";
import { ContentSections } from "@/components/content/content-sections";
import { returnsPageMeta, returnsSections } from "@/lib/content/returns";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Returns & Guarantee",
  description: returnsPageMeta.description,
  path: "/returns",
});

export default function ReturnsPage() {
  return (
    <ContentPageLayout meta={returnsPageMeta}>
      <ContentSections sections={returnsSections} />
    </ContentPageLayout>
  );
}
