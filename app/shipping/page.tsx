import type { Metadata } from "next";

import { ContentPageLayout } from "@/components/content/content-page-layout";
import { ContentSections } from "@/components/content/content-sections";
import { shippingPageMeta, shippingSections } from "@/lib/content/shipping";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Shipping",
  description: shippingPageMeta.description,
  path: "/shipping",
});

export default function ShippingPage() {
  return (
    <ContentPageLayout meta={shippingPageMeta}>
      <ContentSections sections={shippingSections} />
    </ContentPageLayout>
  );
}
