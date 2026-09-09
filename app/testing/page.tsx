import type { Metadata } from "next";

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
              Published Batch Reports
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-ash md:text-base">
              Original third-party laboratory reports for currently released lots. Results
              apply strictly to the tested sample and lot identified in each
              report.{" "}
              <a
                href="/coa"
                className="font-medium text-accent underline underline-offset-4"
              >
                COA Lookup →
              </a>
            </p>
          </div>
          <BatchReportsList reports={reports} />
        </section>
      </AnimateIn>

      <AnimateIn delay={0.1}>
        <TestingScopeExplainer showPolicy={true} />
      </AnimateIn>

      <ContentSections sections={testingSections} />
    </ContentPageLayout>
  );
}
