import type { Metadata } from "next";
import Link from "next/link";

import { ContentPageLayout } from "@/components/content/content-page-layout";
import { ContentSections } from "@/components/content/content-sections";
import { AnimateIn } from "@/components/product/animate-in";
import { BatchReportsList } from "@/components/testing/batch-reports-list";
import { TestingScopeExplainer } from "@/components/testing/testing-scope-explainer";
import { getAvailableBatchReports } from "@/lib/batch-reports";
import { testingPageMeta, testingSections } from "@/lib/content/testing";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Testing & Quality",
  description: testingPageMeta.description,
  path: "/testing",
});

export default function TestingPage() {
  const reports = getAvailableBatchReports();

  return (
    <ContentPageLayout meta={testingPageMeta}>
      <AnimateIn>
        <section className="flex flex-col gap-4">
          <div>
            <h2 className="font-[family-name:var(--font-display)] text-xl font-bold text-ink md:text-2xl">
              Published batch reports
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-ash md:text-base">
              Original third-party lab reports for lots currently for sale. Results apply to the sample and lot named on each report.{" "}
              <a
                href="/coa"
                className="font-medium text-accent underline underline-offset-4"
              >
                View Batch Reports →
              </a>
            </p>
          </div>
          <BatchReportsList reports={reports} />
        </section>
      </AnimateIn>

      <AnimateIn delay={0.1}>
        <TestingScopeExplainer showPolicy={true} />
      </AnimateIn>

      <AnimateIn delay={0.15}>
        <section className="rounded-xl border border-linen bg-surface p-6 sm:p-8">
          <div className="flex flex-col gap-2">
            <span className="mono text-xs uppercase text-accent font-semibold">
              GUIDES
            </span>
            <h2 className="font-display text-xl font-bold text-ink sm:text-2xl">
              Guides for reading lab reports
            </h2>
            <p className="text-sm leading-relaxed text-ash">
              Short explainers on purity, verification, batch matching, and what testing does not cover.
            </p>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Link
              href="/guides/peptide-identity-vs-purity-vs-content"
              className="rounded-lg border border-linen bg-paper p-4 transition-colors hover:border-linen-dark hover:bg-surface/50"
            >
              <p className="font-bold text-ink text-sm">Identity vs purity vs amount</p>
              <p className="text-xs text-ash mt-1">What each result actually tells you.</p>
            </Link>
            <Link
              href="/guides/verify-peptide-laboratory-report"
              className="rounded-lg border border-linen bg-paper p-4 transition-colors hover:border-linen-dark hover:bg-surface/50"
            >
              <p className="font-bold text-ink text-sm">How to verify a lab report</p>
              <p className="text-xs text-ash mt-1">Check the task ID, date, and lab name.</p>
            </Link>
            <Link
              href="/guides/peptide-purity-vs-content"
              className="rounded-lg border border-linen bg-paper p-4 transition-colors hover:border-linen-dark hover:bg-surface/50"
            >
              <p className="font-bold text-ink text-sm">What 99% purity means</p>
              <p className="text-xs text-ash mt-1">Why purity % is not the same as total amount.</p>
            </Link>
            <Link
              href="/guides/what-peptide-testing-can-establish"
              className="rounded-lg border border-linen bg-paper p-4 transition-colors hover:border-linen-dark hover:bg-surface/50"
            >
              <p className="font-bold text-ink text-sm">What testing can and cannot establish</p>
              <p className="text-xs text-ash mt-1">Limits of HPLC and mass assay reports.</p>
            </Link>
          </div>

          <div className="mt-4 border-t border-linen pt-3">
            <Link
              href="/guides"
              className="text-xs font-mono font-medium text-accent underline underline-offset-4 hover:opacity-80"
            >
              View all guides →
            </Link>
          </div>
        </section>
      </AnimateIn>

      <ContentSections sections={testingSections} />
    </ContentPageLayout>
  );
}
