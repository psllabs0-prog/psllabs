"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ExternalLink, Search } from "lucide-react";

import {
  batchReports,
  findBatchReport,
  formatReportedAmount,
  formatReportedPurity,
} from "@/lib/batch-reports";
import { BatchTestingCard } from "@/components/product/batch-testing-card";
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
          <span className="mono text-ash">Task number or batch name</span>
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
              className="w-full rounded-xl border border-linen bg-lab-white py-3 pl-11 pr-4 text-sm text-ink outline-none transition-colors focus:border-primary-blue/50"
            />
          </div>
        </label>
        {query.trim() && !result && (
          <p className="text-sm text-ash">
            No published report matches that lookup. Check the task number or
            batch name on your vial label, or contact{" "}
            <a
              href="mailto:support@psllabs.org"
              className="text-petrol underline underline-offset-4"
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
            <article
              key={`${report.productHandle}-${report.batch}-${report.taskNumber}`}
              className="premium-card flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between"
            >
              <div>
                <p className="font-display text-lg font-bold text-ink">
                  {report.product} — Batch {report.batch}
                </p>
                <p className="mt-1 text-sm text-ash">
                  Task {report.taskNumber} · {report.laboratory} · Nominal{" "}
                  {report.nominalStrength} · Lab amount{" "}
                  {formatReportedAmount(report.reportedAmountMg)} ·{" "}
                  {formatReportedPurity(report.purityPercent)} purity
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link
                  href={`/products/${report.productHandle}`}
                  className="inline-flex items-center justify-center rounded-pill border border-linen bg-lab-white px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:border-primary-blue/40"
                >
                  Product page
                </Link>
                <a
                  href={report.reportUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-pill bg-ink px-4 py-2.5 text-sm font-medium text-lab-white transition-opacity hover:opacity-90"
                >
                  View report
                  <ExternalLink className="size-3.5" aria-hidden />
                </a>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="premium-card overflow-hidden p-2">
        <div className="relative aspect-[4/5] w-full max-h-[720px] bg-lab-white">
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
