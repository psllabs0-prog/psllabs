import type { Metadata } from "next";

import { AboutClosing } from "@/components/about/about-cta";
import { AboutHero } from "@/components/about/about-hero";
import { AboutMission } from "@/components/about/about-mission";
import { aboutContent } from "@/lib/about";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "About",
  description:
    "PSL Labs research-use documentation, batch transparency, and product information for laboratory reference.",
  path: "/about",
});

export default function AboutPage() {
  const { hero, mission, valueCards, closing } = aboutContent;

  return (
    <main className="bg-paper">
      <AboutHero hero={hero} />
      <AboutMission mission={mission} valueCards={valueCards} />
      <AboutClosing closing={closing} />
    </main>
  );
}
