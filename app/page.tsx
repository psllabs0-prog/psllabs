import type { Metadata } from "next";
import Link from "next/link";

import { FeatureTile } from "@/components/ui/feature-tile";
import { HomeSection } from "@/components/ui/home-section";
import { PillButton } from "@/components/ui/pill-button";
import { ProductCard } from "@/components/ui/product-card";
import type { ProductThemeColor } from "@/components/ui/product-card";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "The daily protocol for the next thirty years",
  description:
    "Clinical-grade longevity compounds. Third-party verified, every batch. Designed to compound.",
  path: "/",
});

const products: Array<{
  tag: string;
  name: string;
  description: string;
  price: string;
  subscribe: string;
  href: string;
  themeColor: ProductThemeColor;
}> = [
  {
    tag: "FOUNDATION · DAILY",
    name: "Foundation",
    description:
      "The base layer. Trans-resveratrol, spermidine, fisetin, and methylated B-complex.",
    price: "$52",
    subscribe: "subscribe ↓ $44",
    href: "/products/foundation",
    themeColor: "lavender",
  },
  {
    tag: "CELLULAR ENERGY · NAD+",
    name: "Cellular Energy",
    description:
      "NMN and NR with TMG for methylation support. Targets NAD+ decline.",
    price: "$68",
    subscribe: "subscribe ↓ $58",
    href: "/products/cellular-energy",
    themeColor: "blush",
  },
  {
    tag: "RECOVERY · MITOCHONDRIA",
    name: "Recovery",
    description:
      "Urolithin A, ubiquinol, and PQQ. The mitochondrial biogenesis stack.",
    price: "$84",
    subscribe: "subscribe ↓ $72",
    href: "/products/recovery",
    themeColor: "mint",
  },
];

export default function Home() {
  return (
    <main>
      {/* Hero */}
      <HomeSection background="pale-yellow" className="lg:py-32">
        <div className="mx-auto grid max-w-[1440px] grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-20">
          <div className="flex flex-col gap-10">
            <div className="flex flex-col gap-6">
              <h1 className="font-display text-[clamp(2.5rem,5vw,3.5rem)] leading-[1.05] tracking-[-0.02em] text-near-black">
                The daily protocol for the next thirty years.
              </h1>
              <p className="max-w-lg text-base leading-relaxed text-slate-muted md:text-[1.125rem]">
                Clinical-grade longevity compounds. Third-party verified, every
                batch. Designed to compound.
              </p>
            </div>

            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
              <PillButton href="/#shop">Shop the Stack</PillButton>
              <Link
                href="/protocol"
                className="text-base font-medium text-near-black underline underline-offset-4 transition-opacity duration-200 ease-out hover:opacity-70"
              >
                The Protocol
              </Link>
            </div>
          </div>

          <div
            className="flex aspect-[4/5] items-center justify-center rounded-2xl bg-[var(--color-lab-white)] shadow-soft-card lg:aspect-square"
            role="img"
            aria-label="Product image placeholder"
          >
            <div className="h-56 w-28 rounded-xl bg-pale-yellow" />
          </div>
        </div>
      </HomeSection>

      {/* Manifesto */}
      <HomeSection background="blush">
        <p className="mx-auto max-w-[60ch] text-center font-display text-2xl font-bold leading-[1.5] text-near-black">
          Most longevity supplements are marketing wearing a lab coat.
          Proprietary blends that don&apos;t disclose doses. Ingredients at a
          fraction of the clinical amount. Claims that wouldn&apos;t survive a
          citation check. We started PSL Labs to build the opposite — a small,
          honest stack of compounds with real evidence, dosed the way the
          research actually used them, tested by a lab we don&apos;t own, and
          published openly.
        </p>
      </HomeSection>

      {/* Trust tiles */}
      <HomeSection background="lavender">
        <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-6 md:grid-cols-3 md:gap-8">
          <FeatureTile
            themeColor="mint"
            title="Clinical-grade"
            description="Clinical-grade longevity compounds."
          />
          <FeatureTile
            themeColor="blush"
            title="Verified"
            description="Third-party verified, every batch."
          />
          <FeatureTile
            themeColor="pale-yellow"
            title="Compounding"
            description="Designed to compound."
          />
        </div>
      </HomeSection>

      {/* The Stack */}
      <HomeSection
        id="shop"
        background="mint"
        className="scroll-mt-20"
      >
        <div className="mx-auto max-w-[1440px]">
          <header className="mb-16 flex flex-col items-center gap-4 text-center">
            <p className="mono text-slate-muted">THE STACK</p>
            <h2 className="font-display text-[clamp(2rem,4vw,2.75rem)] font-bold leading-tight tracking-[-0.02em] text-near-black">
              Three compounds. One daily protocol.
            </h2>
          </header>

          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
            {products.map((product) => (
              <ProductCard key={product.href} {...product} />
            ))}
          </div>
        </div>
      </HomeSection>
    </main>
  );
}
