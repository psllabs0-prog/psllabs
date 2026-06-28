import type { Metadata } from "next";

import { CommunitySection } from "@/components/home/community-section";
import { HeroSection } from "@/components/home/hero-section";
import { ProductCarousel } from "@/components/home/product-carousel";
import { QualityVerification } from "@/components/home/quality-verification";
import { ResearchResources } from "@/components/home/research-resources";
import { TrustGuarantees } from "@/components/home/trust-guarantees";
import { HomeSection } from "@/components/ui/home-section";
import {
  homeCarouselProducts,
  qualityTabs,
  trustGuarantees,
} from "@/lib/home/home-data";
import { getScienceArticles } from "@/lib/content/science";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "PSL Labs - Research Peptides",
  description:
    "Research peptides with third-party testing and certificate of analysis.",
  path: "/",
});

export default function Home() {
  const articles = getScienceArticles();

  return (
    <main>
      <HeroSection />
      <TrustGuarantees guarantees={trustGuarantees} />
      <HomeSection id="shop" background="mint" size="editorial" className="scroll-mt-20">
        <ProductCarousel products={homeCarouselProducts} />
      </HomeSection>
      <QualityVerification tabs={qualityTabs} />
      <ResearchResources articles={articles} />
      <CommunitySection />
    </main>
  );
}
