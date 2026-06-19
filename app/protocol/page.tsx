import type { Metadata } from "next";

import { ContentPageLayout } from "@/components/content/content-page-layout";
import { ContentSections } from "@/components/content/content-sections";
import { protocolPageMeta, protocolSections } from "@/lib/content/protocol";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "The Protocol",
  description: protocolPageMeta.description,
  path: "/protocol",
});

export default function ProtocolPage() {
  return (
    <ContentPageLayout meta={protocolPageMeta}>
      <ContentSections sections={protocolSections} />
    </ContentPageLayout>
  );
}
