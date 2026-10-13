import type { Metadata } from "next";

import { ContentPageLayout } from "@/components/content/content-page-layout";
import { AnimateIn } from "@/components/product/animate-in";
import {
  disclaimerPageMeta,
  disclaimerParagraphs,
  productImageDisclaimer,
  productLabelDisclosures,
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
      <section id="product-label-information" className="premium-card mt-6 scroll-mt-40 p-6 md:p-7" aria-labelledby="product-label-heading">
        <h2 id="product-label-heading" className="font-display text-2xl font-medium text-ink md:text-3xl">Product images and label information</h2>
        <p className="mt-4 text-base leading-[1.7] text-ash md:text-body-lg">{productImageDisclaimer}</p>
        <div className="mt-6 flex flex-col gap-6">
          {productLabelDisclosures.map((disclosure) => (
            <div key={disclosure.name} className="border-t border-linen pt-6">
              <h3 className="font-display text-xl font-medium text-ink">{disclosure.name}</h3>
              <p className="mt-3 text-base leading-[1.7] text-ash">{disclosure.description}</p>
              <a href={disclosure.reportUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex min-h-11 items-center text-sm text-accent underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">
                View original report {disclosure.taskNumber}
              </a>
            </div>
          ))}
        </div>
      </section>
    </ContentPageLayout>
  );
}
