import type { Metadata } from "next";
import Link from "next/link";

import { AnimateIn } from "@/components/product/animate-in";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Order Confirmed",
  description: "Your PSL Labs order has been placed successfully.",
  path: "/success",
});

export default function SuccessPage() {
  return (
    <main className="bg-[var(--color-paper)]">
      <div className="mx-auto flex min-h-[60vh] max-w-[720px] flex-col items-center justify-center px-6 py-24 text-center md:px-12 lg:px-24">
        <AnimateIn>
          <p className="mono text-[var(--color-sage)]">ORDER CONFIRMED</p>
        </AnimateIn>

        <AnimateIn delay={0.08}>
          <h1 className="mt-6 font-[family-name:var(--font-display)] text-[clamp(2rem,4vw,3rem)] leading-[1.1] tracking-[-0.02em] text-[var(--color-ink)]">
            Thank you.
          </h1>
        </AnimateIn>

        <AnimateIn delay={0.16}>
          <p className="mt-6 max-w-md text-base leading-relaxed text-[var(--color-stone)]">
            Your payment has been received. You&apos;ll get a confirmation email
            once your order ships. Most orders ship within 1–2 business days.
          </p>
        </AnimateIn>

        <AnimateIn delay={0.24}>
          <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:gap-6">
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-md bg-[var(--color-sage)] px-6 py-3.5 text-base font-medium text-[var(--color-lab-white)] transition-opacity duration-200 ease-out hover:opacity-90"
            >
              Back to Home
            </Link>
            <Link
              href="/protocol"
              className="text-base font-medium text-[var(--color-sage)] underline underline-offset-4 transition-opacity duration-200 ease-out hover:opacity-70"
            >
              Read the Protocol →
            </Link>
          </div>
        </AnimateIn>
      </div>
    </main>
  );
}
