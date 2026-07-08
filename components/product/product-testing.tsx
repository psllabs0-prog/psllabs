import type { Product } from "@/lib/products";
import { getBatchReportsForProduct } from "@/lib/batch-reports";

import { AnimateIn } from "./animate-in";
import { BatchTestingCard } from "./batch-testing-card";
import { SectionShell } from "./section-shell";

export function ProductTesting({ product }: { product: Product }) {
  const reports = getBatchReportsForProduct(product.handle).filter(
    (report) => report.status === "report_available"
  );
  const hasReport = reports.length > 0;

  return (
    <SectionShell label="TESTING & QUALITY" variant="soft" width="prose">
      <div className="flex flex-col gap-5">
        <AnimateIn>
          <div className="premium-card p-6 md:p-7">
            <div className="mb-4 flex flex-wrap gap-2">
              <span className="badge-verified">Third-party tested</span>
              <span className="badge-accent">
                {hasReport
                  ? "Third-Party Report Available"
                  : "Documentation when available"}
              </span>
            </div>
            <p className="text-base leading-[1.7] text-ash md:text-body-lg">
              {hasReport
                ? "Independent third-party laboratory documentation is published for selected lots. Review the batch report below for laboratory-reported identity, amount, and purity results specific to the tested sample."
                : (product.testing.description ||
                  "Lot-specific third-party documentation is published when available.")}
            </p>
          </div>
        </AnimateIn>

        {reports.map((report) => (
          <AnimateIn key={`${report.batch}-${report.taskNumber}`}>
            <BatchTestingCard report={report} />
          </AnimateIn>
        ))}
      </div>
    </SectionShell>
  );
}
