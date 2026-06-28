import type { Metadata } from "next";
import Link from "next/link";

import { AnimateIn } from "@/components/product/animate-in";
import { aboutPage } from "@/lib/about";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "About",
  description:
    "Why PSL Labs exists—research-grade compounds with third-party testing and full batch documentation.",
  path: "/about",
});

export default function AboutPage() {
  return (
    <main className="bg-[var(--color-paper)]">
      <article className="mx-auto max-w-[720px] px-6 py-20 md:px-12 md:py-28 lg:px-24 lg:py-36">
        <header className="mb-14 text-center md:mb-20">
          <AnimateIn>
            <p className="mono text-[var(--color-stone)]">{aboutPage.label}</p>
          </AnimateIn>
          <AnimateIn delay={0.08}>
            <h1 className="mt-6 font-display text-[clamp(2rem,4vw,2.75rem)] font-bold leading-[1.15] tracking-[-0.02em] text-near-black">
              {aboutPage.headline}
            </h1>
          </AnimateIn>
          <AnimateIn delay={0.12}>
            <p className="font-serif mx-auto mt-6 max-w-lg text-body-lg text-ash">
              {aboutPage.intro}
            </p>
          </AnimateIn>
        </header>

        <div className="flex flex-col gap-14 md:gap-16">
          {aboutPage.sections.map((section, index) => (
            <AnimateIn key={section.id} delay={0.1 + index * 0.05}>
              <section className="flex flex-col gap-4 border-t border-[var(--color-sage)] pt-10 first:border-t-0 first:pt-0">
                <p className="mono text-[var(--color-stone)]">{section.label}</p>
                <h2 className="font-display text-2xl font-bold tracking-[-0.02em] text-near-black">
                  {section.title}
                </h2>
                <div className="flex flex-col gap-4">
                  {section.paragraphs.map((paragraph) => (
                    <p
                      key={paragraph.slice(0, 48)}
                      className={
                        paragraph.startsWith("[PLACEHOLDER:")
                          ? "rounded-lg border border-dashed border-[var(--color-sage)] bg-[var(--color-lab-white)] px-4 py-3 font-[family-name:var(--font-mono)] text-sm leading-relaxed text-[var(--color-stone)]"
                          : "text-base leading-relaxed text-slate-muted md:text-[1.0625rem]"
                      }
                    >
                      {paragraph}
                    </p>
                  ))}
                </div>
              </section>
            </AnimateIn>
          ))}
        </div>

        <AnimateIn
          delay={0.4}
          className="mt-16 flex flex-col items-center gap-4 border-t border-[var(--color-sage)] pt-12 text-center md:mt-20"
        >
          <Link
            href="/testing"
            className="text-sm text-[var(--color-sage)] underline underline-offset-4 transition-opacity duration-200 ease-out hover:opacity-70"
          >
            View testing standards →
          </Link>
          <Link
            href="/products"
            className="text-sm text-[var(--color-sage)] underline underline-offset-4 transition-opacity duration-200 ease-out hover:opacity-70"
          >
            Browse products →
          </Link>
        </AnimateIn>
      </article>
    </main>
  );
}
