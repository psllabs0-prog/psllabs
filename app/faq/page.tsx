import type { Metadata } from "next";

import { FaqAccordion } from "@/components/faq/faq-accordion";
import { JsonLd } from "@/components/seo/json-ld";
import { siteFaqItems } from "@/lib/content/site-faq";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "FAQ",
  description:
    "Answers about PSL Labs laboratory research peptides, analytical documentation, COAs, storage, shipping, and institutional orders.",
  path: "/faq",
});

const faqPageLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: siteFaqItems.map((item) => ({
    "@type": "Question",
    name: item.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: item.answer,
    },
  })),
};

export default function FaqPage() {
  return (
    <main className="bg-[var(--color-paper)]">
      {/* Validate FAQ rich results: https://search.google.com/test/rich-results */}
      <JsonLd data={faqPageLd} />
      <FaqAccordion items={siteFaqItems} />
    </main>
  );
}
