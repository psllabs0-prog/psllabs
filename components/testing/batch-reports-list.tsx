"use client";

import { useState } from "react";
import { ChevronDown, ExternalLink } from "lucide-react";

import type { BatchReport } from "@/lib/batch-reports";
import {
  formatReportedAmount,
  formatReportedPurity,
  statusLabel,
} from "@/lib/batch-reports";
import { cn } from "@/lib/utils";

type BatchReportsListProps = {
  reports: BatchReport[];
};

function ReportCard({ report }: { report: BatchReport }) {
  const [open, setOpen] = useState(false);
  const amount = formatReportedAmount(report.reportedAmountMg);
  const purity = formatReportedPurity(report.purityPercent);

  return (
    <article className="premium-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="flex w-full items-start justify-between gap-3 px-4 py-4 text-left md:px-5"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-base font-bold text-ink">
              {report.product}
            </h3>
            <span className="badge-accent">{statusLabel(report.status)}</span>
          </div>
          <p className="mt-1 text-sm text-ash">
            Batch {report.batch} · Task {report.taskNumber} ·{" "}
            {report.laboratory}
          </p>
          <p className="mt-1 text-xs text-ash md:hidden">
            {amount} · {purity} · {report.analysisDate}
          </p>
        </div>
        <ChevronDown
          className={cn(
            "mt-1 size-5 shrink-0 text-ash transition-transform duration-200",
            open && "rotate-180"
          )}
          aria-hidden
        />
      </button>

      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr] md:grid-rows-[1fr]"
        )}
      >
        <div className="overflow-hidden">
          <div className="border-t border-linen px-4 pb-4 pt-3 md:px-5 md:pb-5">
            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase tracking-wide text-ash">
                  Product
                </dt>
                <dd className="mt-0.5 font-medium text-ink">{report.product}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-ash">
                  Batch
                </dt>
                <dd className="mt-0.5 font-medium text-ink">{report.batch}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-ash">
                  Task Number
                </dt>
                <dd className="mt-0.5 font-medium text-ink">
                  {report.taskNumber}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-ash">
                  Testing Laboratory
                </dt>
                <dd className="mt-0.5 font-medium text-ink">
                  {report.laboratory}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-ash">
                  Analysis Date
                </dt>
                <dd className="mt-0.5 font-medium text-ink">
                  {report.analysisDate}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-ash">
                  Reported Amount
                </dt>
                <dd className="mt-0.5 font-medium text-ink">{amount}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-ash">
                  Reported Purity
                </dt>
                <dd className="mt-0.5 font-medium text-ink">{purity}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-ash">
                  Status
                </dt>
                <dd className="mt-0.5 font-medium text-ink">
                  {statusLabel(report.status)}
                </dd>
              </div>
            </dl>

            <a
              href={report.reportUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-2 rounded-pill bg-ink px-4 py-2.5 text-sm font-medium text-lab-white transition-opacity hover:opacity-90"
            >
              View Report
              <ExternalLink className="size-3.5" aria-hidden />
            </a>
            <p className="mt-3 text-xs leading-relaxed text-ash">
              Laboratory results apply only to the tested sample and batch
              identified above.
            </p>
          </div>
        </div>
      </div>
    </article>
  );
}

export function BatchReportsList({ reports }: BatchReportsListProps) {
  if (reports.length === 0) {
    return (
      <p className="text-sm text-ash">
        No published batch reports are available yet. Check individual product
        pages for lot-specific documentation when released.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {reports.map((report) => (
        <ReportCard
          key={`${report.productHandle}-${report.batch}-${report.taskNumber}`}
          report={report}
        />
      ))}
    </div>
  );
}
