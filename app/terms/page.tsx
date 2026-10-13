import type { Metadata } from "next";

import { ContentPageLayout } from "@/components/content/content-page-layout";
import { ContentSections } from "@/components/content/content-sections";
import { termsPageMeta, termsSections } from "@/lib/content/terms";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Terms of Service for Laboratory Orders",
  description: "Read PSL Labs terms for research-only orders, eligibility, payment, batch documentation, shipping, order issues and use of this website.",
  path: "/terms",
});

export default function TermsPage() {
  return (
    <ContentPageLayout meta={termsPageMeta} breadcrumbs={[{ name: "Home", path: "/" }, { name: "Terms of service", path: "/terms" }]}>
      <ContentSections sections={termsSections} />
    </ContentPageLayout>
  );
}
