import type { Metadata } from "next";

import { ContentPageLayout } from "@/components/content/content-page-layout";
import { ContentSections } from "@/components/content/content-sections";
import { privacyPageMeta, privacySections } from "@/lib/content/privacy";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Privacy, Cookies and Advertising Preferences",
  description: "Learn how PSL Labs handles order information, essential cookies, optional advertising consent, data sharing and withdrawal of cookie preferences.",
  path: "/privacy",
});

export default function PrivacyPage() {
  return (
    <ContentPageLayout meta={privacyPageMeta} breadcrumbs={[{ name: "Home", path: "/" }, { name: "Privacy policy", path: "/privacy" }]}>
      <ContentSections sections={privacySections} />
    </ContentPageLayout>
  );
}
