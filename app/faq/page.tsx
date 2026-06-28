import type { Metadata } from "next";

import { FaqAccordion } from "@/components/faq/faq-accordion";
import { siteFaqItems } from "@/lib/content/site-faq";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "FAQ",
  description:
    "Answers about PSL Labs research peptides, purity, COAs, storage, shipping, and orders.",
  path: "/faq",
});

export default function FaqPage() {
  return (
    <main className="bg-[var(--color-paper)]">
      <FaqAccordion items={siteFaqItems} />
    </main>
  );
}
