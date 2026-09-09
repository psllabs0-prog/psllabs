import type { Metadata } from "next";
import Link from "next/link";

import { AnimateIn } from "@/components/product/animate-in";
import { shippingPageMeta, shippingSections } from "@/lib/content/shipping";
import { createPageMetadata } from "@/lib/seo";

function renderParagraph(text: string, key: number) {
  // Light link injection for known paths/emails without changing meaning.
  const parts = text.split(/(\/track|\/returns|\/contact|support@psllabs\.org)/g);
  return (
    <p key={key} className="text-ash">
      {parts.map((part, i) => {
        if (part === "/track") {
          return (
            <Link
              key={i}
              href="/track"
              className="font-medium text-accent underline underline-offset-4 hover:opacity-80"
            >
              Track Order
            </Link>
          );
        }
        if (part === "/returns") {
          return (
            <Link
              key={i}
              href="/returns"
              className="font-medium text-accent underline underline-offset-4 hover:opacity-80"
            >
              Returns &amp; Refunds
            </Link>
          );
        }
        if (part === "/contact") {
          return (
            <Link
              key={i}
              href="/contact"
              className="font-medium text-accent underline underline-offset-4 hover:opacity-80"
            >
              Contact
            </Link>
          );
        }
        if (part === "support@psllabs.org") {
          return (
            <a
              key={i}
              href="mailto:support@psllabs.org"
              className="font-medium text-accent underline underline-offset-4"
            >
              support@psllabs.org
            </a>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </p>
  );
}

export const metadata: Metadata = createPageMetadata({
  title: "Shipping Policy",
  description: shippingPageMeta.description,
  path: "/shipping",
});

export default function ShippingPage() {
  return (
    <main className="min-h-screen bg-paper">
      <div className="mx-auto max-w-[760px] px-6 py-16 md:px-12 md:py-20 lg:px-24 lg:py-24">
        <header className="mb-12 border-b border-linen pb-10 md:mb-14 md:pb-12">
          <AnimateIn>
            <p className="mono text-ash">{shippingPageMeta.label}</p>
          </AnimateIn>
          <AnimateIn delay={0.06}>
            <h1 className="mt-4 font-[family-name:var(--font-display)] text-[clamp(2rem,4vw,2.5rem)] leading-[1.15] tracking-[-0.02em] text-ink">
              {shippingPageMeta.title}
            </h1>
          </AnimateIn>
          {shippingPageMeta.intro?.map((paragraph, index) => (
            <AnimateIn key={index} delay={0.1 + index * 0.04}>
              <p className="mt-5 text-base leading-relaxed text-ash md:text-[1.0625rem]">
                {paragraph}
              </p>
            </AnimateIn>
          ))}
        </header>

        <div className="flex flex-col gap-10 md:gap-12 text-base leading-relaxed text-ink md:text-[1.0625rem]">
          {shippingSections.map((section, index) => (
            <AnimateIn key={section.id} delay={0.12 + index * 0.04}>
              <section className="flex flex-col gap-3 rounded-xl border border-linen bg-surface p-6 md:p-8">
                <h2 className="font-[family-name:var(--font-display)] text-xl font-bold text-ink md:text-2xl">
                  {section.title}
                </h2>
                {section.paragraphs.map((paragraph, pIndex) =>
                  renderParagraph(paragraph, pIndex)
                )}
              </section>
            </AnimateIn>
          ))}
        </div>
      </div>
    </main>
  );
}
