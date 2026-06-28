import type { Metadata } from "next";
import Link from "next/link";

import { AnimateIn } from "@/components/product/animate-in";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Checkout Canceled",
  description: "Your checkout was canceled. No payment was processed.",
  path: "/cancel",
});

export default function CancelPage() {
  return (
    <main className="bg-[var(--color-paper)]">
      <div className="mx-auto flex min-h-[60vh] max-w-[720px] flex-col items-center justify-center px-6 py-24 text-center md:px-12 lg:px-24">
        <AnimateIn>
          <p className="mono text-[var(--color-stone)]">CHECKOUT CANCELED</p>
        </AnimateIn>

        <AnimateIn delay={0.08}>
          <h1 className="mt-6 font-[family-name:var(--font-display)] text-[clamp(2rem,4vw,3rem)] leading-[1.1] tracking-[-0.02em] text-[var(--color-ink)]">
            No payment was taken.
          </h1>
        </AnimateIn>

        <AnimateIn delay={0.16}>
          <p className="mt-6 max-w-md text-base leading-relaxed text-[var(--color-stone)]">
            Your checkout was canceled before payment was processed. Your cart
            and selections are unchanged — you can return anytime.
          </p>
        </AnimateIn>

        <AnimateIn delay={0.24}>
          <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:gap-6">
            <Link
              href="/products"
              className="inline-flex items-center justify-center rounded-md bg-[var(--color-sage)] px-6 py-3.5 text-base font-medium text-[var(--color-lab-white)] transition-opacity duration-200 ease-out hover:opacity-90"
            >
              Return to Shop
            </Link>
            <Link
              href="/faq"
              className="text-base font-medium text-[var(--color-sage)] underline underline-offset-4 transition-opacity duration-200 ease-out hover:opacity-70"
            >
              Questions? Read the FAQ →
            </Link>
          </div>
        </AnimateIn>
      </div>
    </main>
  );
}
