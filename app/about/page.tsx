import type { Metadata } from "next";
import Link from "next/link";

import { AnimateIn } from "@/components/product/animate-in";
import { aboutPage } from "@/lib/about";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "About",
  description:
    "The founder story behind PSL Labs—a small, honest longevity stack built for people who read labels and check COAs.",
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
            <h1 className="mt-6 font-[family-name:var(--font-display)] text-[clamp(2rem,4vw,2.75rem)] leading-[1.2] tracking-[-0.02em] text-[var(--color-ink)]">
              {aboutPage.headline}
            </h1>
          </AnimateIn>
        </header>

        <div className="flex flex-col gap-10 md:gap-12">
          {aboutPage.paragraphs.map((paragraph, index) => (
            <AnimateIn key={index} delay={0.1 + index * 0.05}>
              <p className="font-[family-name:var(--font-display)] text-[clamp(1.125rem,2vw,1.375rem)] leading-[1.75] text-[var(--color-ink)]">
                {paragraph}
              </p>
            </AnimateIn>
          ))}
        </div>

        <AnimateIn delay={0.4} className="mt-16 border-t border-[var(--color-sage)] pt-12 text-center md:mt-20">
          <Link
            href="/"
            className="text-sm text-[var(--color-sage)] underline underline-offset-4 transition-opacity duration-200 ease-out hover:opacity-70"
          >
            Explore the stack →
          </Link>
        </AnimateIn>
      </article>
    </main>
  );
}
