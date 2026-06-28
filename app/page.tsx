import type { Metadata } from "next";

import { FeaturedProductSection } from "@/components/home/featured-product-section";
import { HeroSection } from "@/components/home/hero-section";
import { HomeFaqSection } from "@/components/home/home-faq-section";
import { NewsletterBand } from "@/components/home/newsletter-band";
import { TrustBadgeRow } from "@/components/home/trust-badge-row";
import { WhyChooseSection } from "@/components/home/why-choose-section";
import {
  featuredProduct,
  homeFaqItems,
  newsletterCopy,
  trustBadges,
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
      <TrustBadgeRow badges={trustBadges} />
      <WhyChooseSection cards={whyChooseCards} />
      <FeaturedProductSection product={featuredProduct} />
      <HomeFaqSection items={homeFaqItems} />
      <NewsletterBand copy={newsletterCopy} />
    </main>
  );
}
