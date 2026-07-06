import type { Metadata } from "next";

import { ContentPageLayout } from "@/components/content/content-page-layout";
import { AnimateIn } from "@/components/product/animate-in";
import {
  disclaimerPageMeta,
  disclaimerParagraphs,
} from "@/lib/content/disclaimer";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: disclaimerPageMeta.title,
  description: disclaimerPageMeta.description,
  path: "/disclaimer",
});

export default function DisclaimerPage() {
  return (
    <ContentPageLayout meta={disclaimerPageMeta}>
      <div className="premium-card flex flex-col gap-5 p-6 md:gap-6 md:p-7">
        {disclaimerParagraphs.map((paragraph) => (
          <AnimateIn key={paragraph.slice(0, 40)}>
            <p className="text-base leading-[1.7] text-ash md:text-body-lg">
              {paragraph}
            </p>
          </AnimateIn>
        ))}
      </div>
    </ContentPageLayout>
  );
}
