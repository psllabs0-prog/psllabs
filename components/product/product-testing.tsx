import Link from "next/link";

import type { Product } from "@/lib/products";
import { getBatchReportsForProduct } from "@/lib/batch-reports";
import { TESTING_SCOPE_STATEMENT } from "@/lib/content/testing-scope";

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
              <span className="badge-verified">
                {hasReport ? "Report available" : "Documentation when available"}
              </span>
            </div>
            <p className="text-base leading-[1.7] text-ash md:text-body-lg">
              {hasReport
                ? `Independent third-party laboratory documentation is published for selected lots. ${TESTING_SCOPE_STATEMENT}`
                : (product.testing.description ||
                  "Lot-specific third-party documentation is published when available.")}
            </p>
            <Link
              href="/coa"
              className="mt-4 inline-flex text-sm font-medium text-petrol underline underline-offset-4 transition-opacity hover:opacity-80"
            >
              COA / Batch Lookup →
            </Link>
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
