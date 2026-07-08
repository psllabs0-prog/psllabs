import type { Metadata } from "next";

import { ContentPageLayout } from "@/components/content/content-page-layout";
import { ContentSections } from "@/components/content/content-sections";
import { AnimateIn } from "@/components/product/animate-in";
import { BatchReportsList } from "@/components/testing/batch-reports-list";
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
              Available batch reports
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-ash md:text-base">
              Published third-party laboratory reports for selected lots. Results
              apply only to the tested sample and batch identified in each
              report.{" "}
              <a
                href="/coa"
                className="font-medium text-petrol underline underline-offset-4"
              >
                COA / Batch Lookup →
              </a>
            </p>
          </div>
          <BatchReportsList reports={reports} />
        </section>
      </AnimateIn>
      <ContentSections sections={testingSections} />
    </ContentPageLayout>
  );
}
