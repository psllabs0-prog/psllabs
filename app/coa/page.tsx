import type { Metadata } from "next";

import { BatchLookup } from "@/components/coa/batch-lookup";
import { AnimateIn } from "@/components/product/animate-in";
import { TESTING_SCOPE_STATEMENT } from "@/lib/content/testing-scope";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "COA / Batch Lookup",
  description:
    "Look up published third-party laboratory reports by task number or batch name.",
  path: "/coa",
});

export default function CoaPage() {
  return (
    <main className="section-surface-ice">
      <div className="mx-auto max-w-[960px] px-6 py-16 md:px-16 md:py-20 lg:px-24 lg:py-24">
        <header className="mb-10 flex max-w-3xl flex-col gap-5 md:mb-12">
          <AnimateIn>
            <p className="mono text-biotech-deep/90">DOCUMENTATION</p>
          </AnimateIn>
          <AnimateIn delay={0.06}>
            <h1 className="font-display text-display-lg font-bold text-ink">
              COA / Batch Lookup
            </h1>
          </AnimateIn>
          <AnimateIn delay={0.1}>
            <p className="text-body-lg leading-relaxed text-ash">
              Find the original third-party laboratory report for a published
              lot. {TESTING_SCOPE_STATEMENT}
            </p>
          </AnimateIn>
        </header>
        <AnimateIn delay={0.14}>
          <BatchLookup />
        </AnimateIn>
      </div>
    </main>
  );
}
