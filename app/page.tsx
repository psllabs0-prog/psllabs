import type { Metadata } from "next";

import { FeaturedProductSection } from "@/components/home/featured-product-section";
import { HeroSection } from "@/components/home/hero-section";
import { NewsletterBand } from "@/components/home/newsletter-band";
import { TrustElementRow } from "@/components/home/trust-element-row";
import { WhyChooseSection } from "@/components/home/why-choose-section";
import {
  featuredProduct,
  newsletterCopy,
  trustElements,
  whyChooseCards,
} from "@/lib/home/homepage";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "PSL Labs - Research Peptides",
  description:
    "Research peptides with third-party testing and certificate of analysis.",
  path: "/",
});

export default function Home() {
  return (
    <main>
      <HeroSection />
      <TrustElementRow items={trustElements} />
      <WhyChooseSection cards={whyChooseCards} />
      <FeaturedProductSection product={featuredProduct} />
      <NewsletterBand copy={newsletterCopy} />
    </main>
  );
}
