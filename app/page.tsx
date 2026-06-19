import type { Metadata } from "next";
import Link from "next/link";

import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "The daily protocol for the next thirty years",
  description:
    "Clinical-grade longevity compounds. Third-party verified, every batch. Designed to compound.",
  path: "/",
});

const products = [
  {
    tag: "FOUNDATION · DAILY",
    name: "Foundation",
    description:
      "The base layer. Trans-resveratrol, spermidine, fisetin, and methylated B-complex.",
    price: "$52",
    subscribe: "subscribe ↓ $44",
    href: "/products/foundation",
  },
  {
    tag: "CELLULAR ENERGY · NAD+",
    name: "Cellular Energy",
    description:
      "NMN and NR with TMG for methylation support. Targets NAD+ decline.",
    price: "$68",
    subscribe: "subscribe ↓ $58",
    href: "/products/cellular-energy",
  },
  {
    tag: "RECOVERY · MITOCHONDRIA",
    name: "Recovery",
    description:
      "Urolithin A, ubiquinol, and PQQ. The mitochondrial biogenesis stack.",
    price: "$84",
    subscribe: "subscribe ↓ $72",
    href: "/products/recovery",
  },
] as const;

export default function Home() {
  return (
    <main className="bg-[var(--color-paper)]">
      <section className="mx-auto max-w-[1440px] px-6 py-16 md:px-12 md:py-24 lg:px-24 lg:py-[120px]">
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-20">
          {/* Left column */}
          <div className="flex flex-col gap-10">
            <div className="flex flex-col gap-6">
              <h1 className="text-[clamp(2.5rem,5vw,3.5rem)] leading-[1.1] tracking-[-0.02em] text-[var(--color-ink)]">
                The daily protocol for the next thirty years.
              </h1>
              <p className="max-w-lg text-base leading-relaxed text-[var(--color-stone)] md:text-[1.125rem]">
                Clinical-grade longevity compounds. Third-party verified, every
                batch. Designed to compound.
              </p>
            </div>

            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-8">
              <a
                href="/#shop"
                className="inline-flex items-center justify-center rounded-md bg-[var(--color-sage)] px-6 py-3.5 text-base font-medium text-[var(--color-lab-white)] transition-opacity duration-200 ease-out hover:opacity-90"
              >
                Shop the Stack
              </a>
              <Link
                href="/protocol"
                className="text-base font-medium text-[var(--color-sage)] underline underline-offset-4 transition-opacity duration-200 ease-out hover:opacity-70"
              >
                The Protocol
              </Link>
            </div>
          </div>

          {/* Right column — product image placeholder */}
          <div
            className="aspect-[4/5] w-full rounded-md lg:aspect-square"
            style={{
              background:
                "linear-gradient(135deg, var(--color-paper) 0%, var(--color-stone) 100%)",
            }}
            role="img"
            aria-label="Product image placeholder"
          />
        </div>
      </section>

      <section className="bg-[var(--color-paper)] px-6 py-24">
        <p className="mx-auto max-w-[60ch] text-center font-[family-name:var(--font-display)] text-2xl leading-[1.6] text-[var(--color-ink)]">
          Most longevity supplements are marketing wearing a lab coat.
          Proprietary blends that don&apos;t disclose doses. Ingredients at a
          fraction of the clinical amount. Claims that wouldn&apos;t survive a
          citation check. We started PSL Labs to build the opposite — a small,
          honest stack of compounds with real evidence, dosed the way the
          research actually used them, tested by a lab we don&apos;t own, and
          published openly.
        </p>
      </section>

      <section
        id="shop"
        className="scroll-mt-20 bg-[var(--color-paper)] px-6 py-24 md:px-12 lg:px-24"
      >
        <div className="mx-auto max-w-[1440px]">
          <header className="mb-16 flex flex-col items-center gap-4 text-center">
            <p className="mono text-[var(--color-stone)]">THE STACK</p>
            <h2 className="font-[family-name:var(--font-display)] text-[clamp(2rem,4vw,2.25rem)] leading-tight tracking-[-0.02em] text-[var(--color-ink)]">
              Three compounds. One daily protocol.
            </h2>
          </header>

          <div className="grid grid-cols-1 gap-y-16 lg:grid-cols-3 lg:gap-y-0">
            {products.map((product, index) => (
              <article
                key={product.href}
                className={`flex flex-col transition-transform duration-200 ease-out hover:-translate-y-1 ${
                  index > 0
                    ? "lg:border-l lg:border-[var(--color-sage)]"
                    : ""
                }`}
              >
                <div
                  className="h-[320px] bg-[var(--color-lab-white)]"
                  role="img"
                  aria-label={`${product.name} product image placeholder`}
                />

                <div className="flex flex-col gap-4 px-6 py-8">
                  <p className="mono text-[var(--color-stone)]">{product.tag}</p>

                  <h3 className="font-[family-name:var(--font-display)] text-2xl text-[var(--color-ink)]">
                    {product.name}
                  </h3>

                  <p className="text-[0.95rem] leading-relaxed text-[var(--color-ink)]">
                    {product.description}
                  </p>

                  <div className="flex flex-wrap items-baseline gap-3">
                    <span className="font-[family-name:var(--font-display)] text-xl text-[var(--color-ink)]">
                      {product.price}
                    </span>
                    <span className="font-[family-name:var(--font-mono)] text-sm text-[var(--color-stone)]">
                      {product.subscribe}
                    </span>
                  </div>

                  <Link
                    href={product.href}
                    className="w-fit text-sm text-[var(--color-sage)] underline underline-offset-4 transition-opacity duration-100 ease-out hover:opacity-70"
                  >
                    Learn more →
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
