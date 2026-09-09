import type { Metadata } from "next";

import { AvailableMaterialsSection } from "@/components/home/available-materials-section";
import { HeroSection } from "@/components/home/hero-section";
import { NewsletterSignup } from "@/components/home/newsletter-signup";
import { WhyChooseSection } from "@/components/home/why-choose-section";
import { JsonLd } from "@/components/seo/json-ld";
import { getAvailabilityForCatalogHandles } from "@/lib/inventory/availability";
import { getActiveCatalogProducts } from "@/lib/products/catalog";
import { whyChooseCards } from "@/lib/home/homepage";
import { createPageMetadata, SITE_URL } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "PSL Labs: Synthetic Peptides for Laboratory Research",
  description:
    "Synthetic peptides and research materials for laboratory use. Independent third-party analytical reports available for all released lots.",
  path: "/",
});

const organizationLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "PSL Labs",
  legalName: "PSL Group LLC",
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

export const dynamic = "force-dynamic";

export default async function Home() {
  const activeProducts = getActiveCatalogProducts();
  const availabilityMap = await getAvailabilityForCatalogHandles(
    activeProducts.map((product) => product.handle)
  ).catch(() => new Map());

  return (
    <main>
      {/* Validate Organization markup: https://search.google.com/test/rich-results */}
      <JsonLd data={organizationLd} />
      <HeroSection />
      <AvailableMaterialsSection
        products={activeProducts}
        availabilityMap={availabilityMap}
      />
      <WhyChooseSection cards={whyChooseCards} />
      <NewsletterSignup />
    </main>
  );
}
