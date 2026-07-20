import type { Metadata } from "next";

import { HeroSection } from "@/components/home/hero-section";
import { WhyChooseSection } from "@/components/home/why-choose-section";
import { whyChooseCards } from "@/lib/home/homepage";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "PSL Labs - Research Peptides",
  description:
    "Batch-specific research documentation and analytical testing information from PSL Labs.",
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
