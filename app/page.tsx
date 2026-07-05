import type { Metadata } from "next";

import { HeroSection } from "@/components/home/hero-section";
import { WhyChooseSection } from "@/components/home/why-choose-section";
import { whyChooseCards } from "@/lib/home/homepage";
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
      <WhyChooseSection cards={whyChooseCards} />
    </main>
  );
}
