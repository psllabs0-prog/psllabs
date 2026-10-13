import Link from "next/link";

import type { Product } from "@/lib/products";
import { getBatchReportsForProduct } from "@/lib/batch-reports";
import { TESTING_SCOPE_STATEMENT } from "@/lib/content/testing-scope";

import { ScrollReveal } from "@/components/motion/scroll-reveal";
import { BatchTestingCard } from "./batch-testing-card";
import { SectionShell } from "./section-shell";
import styles from "./product-details.module.css";

export function ProductTesting({ product, compact = false }: { product: Product; compact?: boolean }) {
  const reports = getBatchReportsForProduct(product.handle).filter(
    (report) => report.status === "report_available"
  );
  const hasReport = reports.length > 0;

  if (compact) {
    return (
      <section id="batch-testing" className={styles.testingSection}>
        <h2>{hasReport ? "Original laboratory report" : "Batch report status"}</h2>
        <p className={styles.testingDescription}>{product.testing.description || TESTING_SCOPE_STATEMENT}</p>
        <p className={styles.testingDescription}>Match your vial lot to the published report. Results apply only to the named sample and tests performed.</p>
        {reports.map((report) => <BatchTestingCard key={`${report.batch}-${report.taskNumber}`} report={report} compact />)}
        <Link href="/coa" className={styles.documentationLink}>Browse all batch reports →</Link>
      </section>
    );
  }

  return (
    <SectionShell
      id="batch-testing"
      label="BATCH DOCUMENTATION"
      title={hasReport ? "Take a look at the lab report." : "Batch report status"}
      variant="soft"
      width="prose"
    >
      <div className="flex flex-col gap-5">
        <ScrollReveal>
          <div className="public-section-card p-6 md:p-8">
            <div className="mb-4 flex flex-wrap gap-2">
              <span className="badge-verified">
                {hasReport ? "Original report available" : "No published report yet"}
              </span>
            </div>
            <p className="text-base leading-[1.7] text-ash md:text-body-lg">
              {hasReport
                ? `Match the lot below to the batch you’re reviewing, then open the original report. ${TESTING_SCOPE_STATEMENT}`
                : (product.testing.description ||
                  "A third party lab report for the batch is published when available.")}
            </p>
            <Link
              href="/coa"
              className="mt-4 inline-flex text-sm font-medium text-petrol underline underline-offset-4 transition-opacity hover:opacity-80"
            >
              Browse all batch reports →
            </Link>
          </div>
        </ScrollReveal>

        {reports.map((report) => (
          <ScrollReveal key={`${report.batch}-${report.taskNumber}`}>
            <BatchTestingCard report={report} />
          </ScrollReveal>
        ))}
      </div>
    </SectionShell>
  );
}
