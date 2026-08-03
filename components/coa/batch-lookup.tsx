"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ExternalLink, Search } from "lucide-react";

import {
  batchReports,
  batchReportToCertificateRows,
  findBatchReport,
} from "@/lib/batch-reports";
import { BatchTestingCard } from "@/components/product/batch-testing-card";
import { CertificatePanel } from "@/components/ui/certificate-panel";
import { TESTING_SCOPE_STATEMENT } from "@/lib/content/testing-scope";

export function BatchLookup() {
  const [query, setQuery] = useState("");
  const result = useMemo(() => findBatchReport(query), [query]);
  const publishedReports = batchReports.filter(
    (report) => report.status === "report_available"
  );

  return (
    <div className="flex flex-col gap-10">
      <section className="premium-card flex flex-col gap-5 p-6 md:p-7">
        <h2 className="font-display text-xl font-bold text-ink md:text-2xl">
          Look up a batch report
        </h2>
        <p className="text-sm leading-relaxed text-ash md:text-base">
          Enter a task number (e.g. 199788) or batch name (e.g. Black Top) to
          find the original laboratory report. {TESTING_SCOPE_STATEMENT}
        </p>
        <label className="flex flex-col gap-2">
          <span className="mono text-stone">Task number or batch name</span>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-ash"
              aria-hidden
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="199788 or Black Top"
              className="w-full rounded-md border border-linen bg-paper py-3 pl-11 pr-4 font-mono text-sm text-ink outline-none transition-colors placeholder:text-stone focus:border-accent/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            />
          </div>
        </label>
        {query.trim() && !result && (
          <p className="text-sm text-ash">
            No published report matches that lookup. Check the task number or
            batch name on your vial label, or contact{" "}
            <a
              href="mailto:support@psllabs.org"
              className="text-accent underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              support@psllabs.org
            </a>
            .
          </p>
        )}
      </section>

      {result && <BatchTestingCard report={result} />}

      <section className="flex flex-col gap-5">
        <div>
          <h2 className="font-display text-xl font-bold text-ink md:text-2xl">
            Published reports
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-ash md:text-base">
            All currently published third-party laboratory reports. Results apply
            only to the tested sample and batch identified in each report.
          </p>
        </div>
        <div className="grid gap-4">
          {publishedReports.map((report) => (
            <CertificatePanel
              key={`${report.productHandle}-${report.batch}-${report.taskNumber}`}
              headerLabel={`${report.product} · ${report.batch}`}
              rows={batchReportToCertificateRows(report)}
            >
              <div className="flex flex-wrap gap-3 border-t border-linen px-4 py-4 md:px-5">
                <Link
                  href={`/products/${report.productHandle}`}
                  className="inline-flex items-center justify-center rounded-pill border border-border-strong bg-paper px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:border-accent/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  Product page
                </Link>
                <a
                  href={report.reportUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-pill bg-accent px-4 py-2.5 text-sm font-medium text-page transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  View report
                  <ExternalLink className="size-3.5" aria-hidden />
                </a>
              </div>
            </CertificatePanel>
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-md border border-linen bg-surface p-2">
        <div className="relative aspect-[4/5] w-full max-h-[720px] bg-paper">
          <Image
            src={publishedReports[0]?.reportUrl ?? ""}
            alt={publishedReports[0]?.reportAltText ?? "Laboratory report"}
            fill
            className="object-contain object-top p-2"
            sizes="(max-width: 768px) 100vw, 960px"
            quality={95}
            unoptimized
          />
        </div>
        <p className="px-4 pb-4 pt-2 text-xs leading-relaxed text-ash">
          Original Janoshik laboratory report — Batch Black Top, Task 199788.
          {TESTING_SCOPE_STATEMENT}
        </p>
      </section>
    </div>
  );
}
