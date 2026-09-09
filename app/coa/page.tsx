import type { Metadata } from "next";
import Link from "next/link";

import { BatchLookup } from "@/components/coa/batch-lookup";
import { AnimateIn } from "@/components/product/animate-in";
import { TestingScopeExplainer } from "@/components/testing/testing-scope-explainer";
import { TESTING_SCOPE_STATEMENT } from "@/lib/content/testing-scope";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "COA Lookup: Batch Reports",
  description:
    "Look up published third-party laboratory reports by task number or batch name. Independent HPLC and mass assays from Janoshik Analytical.",
  path: "/coa",
});

export default function CoaPage() {
  return (
    <main className="bg-paper">
      <div className="mx-auto max-w-[960px] px-6 py-16 md:px-16 md:py-20 lg:px-24 lg:py-24">
        <header className="mb-10 flex max-w-3xl flex-col gap-5 md:mb-12">
          <AnimateIn>
            <p className="mono text-accent">DOCUMENTATION</p>
          </AnimateIn>
          <AnimateIn delay={0.06}>
            <h1 className="font-display text-display-lg font-bold text-ink">
              COA / Batch Lookup
            </h1>
          </AnimateIn>
          <AnimateIn delay={0.1}>
            <p className="text-body-lg leading-relaxed text-ash">
              Find and inspect original third-party laboratory reports for currently released lots. {TESTING_SCOPE_STATEMENT}
            </p>
          </AnimateIn>
        </header>

        <AnimateIn delay={0.14}>
          <BatchLookup />
        </AnimateIn>

        <AnimateIn delay={0.18} className="mt-10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-linen bg-surface p-5 text-sm">
            <div className="flex flex-col gap-1">
              <span className="font-bold text-ink">New to reading laboratory reports?</span>
              <p className="text-xs text-ash">
                Learn how to verify task numbers, inspect HPLC baselines, and understand testing boundaries.
              </p>
            </div>
            <Link
              href="/guides/verify-peptide-laboratory-report"
              className="mono text-xs font-semibold text-accent underline underline-offset-4 hover:opacity-80 shrink-0"
            >
              How to Verify a Lab Report →
            </Link>
          </div>
        </AnimateIn>

        <AnimateIn delay={0.2} className="mt-14 md:mt-16">
          <TestingScopeExplainer showPolicy={true} />
        </AnimateIn>
      </div>
    </main>
  );
}
