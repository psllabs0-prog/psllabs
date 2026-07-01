import type { Metadata } from "next";

import { AboutCta } from "@/components/about/about-cta";
import { AboutHero } from "@/components/about/about-hero";
import { AboutMission } from "@/components/about/about-mission";
import { AboutResearchProcess } from "@/components/about/about-research-process";
import { AboutTestingStandards } from "@/components/about/about-testing-standards";
import { AboutTimeline } from "@/components/about/about-timeline";
import { aboutContent } from "@/lib/about";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "About",
  description:
    "PSL Labs mission, research process, testing standards, and commitment to verified research-grade compounds.",
  path: "/about",
});

export default function AboutPage() {
  const { hero, mission, labPhotos, researchProcess, testingStandards, timeline } =
    aboutContent;

  return (
    <main className="bg-paper">
      <AboutHero hero={hero} featuredPhoto={labPhotos[0]} />
      <AboutMission mission={mission} photos={labPhotos} />
      <AboutResearchProcess researchProcess={researchProcess} />
      <AboutTestingStandards testingStandards={testingStandards} />
      <AboutTimeline timeline={timeline} />
      <AboutCta />
    </main>
  );
}
