import type { Metadata } from "next";

import { HeroSection } from "@/components/home/hero-section";
import { WhyChooseSection } from "@/components/home/why-choose-section";
import { JsonLd } from "@/components/seo/json-ld";
import { whyChooseCards } from "@/lib/home/homepage";
import { createPageMetadata, SITE_URL } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "PSL Labs - Research Peptides",
  description:
    "Batch-specific research documentation and analytical testing information from PSL Labs.",
  path: "/",
});

const organizationLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "PSL Labs",
  url: SITE_URL,
  description:
    "US-based research peptide supplier providing batch-level third-party testing documentation.",
  email: "support@psllabs.org",
  address: {
    "@type": "PostalAddress",
    addressLocality: "Phoenix",
    addressRegion: "AZ",
    addressCountry: "US",
  },
};

export default function Home() {
  return (
    <main>
      {/* Validate Organization markup: https://search.google.com/test/rich-results */}
      <JsonLd data={organizationLd} />
      <HeroSection />
      <WhyChooseSection cards={whyChooseCards} />
    </main>
  );
}
