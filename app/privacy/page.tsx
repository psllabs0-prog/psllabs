import type { Metadata } from "next";

import { ContentPageLayout } from "@/components/content/content-page-layout";
import { ContentSections } from "@/components/content/content-sections";
import { privacyPageMeta, privacySections } from "@/lib/content/privacy";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Privacy Policy",
  description: privacyPageMeta.description,
  path: "/privacy",
});

export default function PrivacyPage() {
  return (
    <ContentPageLayout meta={privacyPageMeta}>
      <ContentSections sections={privacySections} />
    </ContentPageLayout>
  );
}
