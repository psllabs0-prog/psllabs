"use client";

import Link from "next/link";
import { FileCheck, Search, ShieldCheck } from "lucide-react";

import { batchReports } from "@/lib/batch-reports";
import { trackGuideCtaClick } from "@/lib/analytics/guide-events";

type BatchDocumentationCTAProps = {
  guideSlug: string;
  title?: string;
  description?: string;
  primaryLabel?: string;
  primaryHref?: string;
  secondaryLabel?: string;
  secondaryHref?: string;
  showSampleBatch?: boolean;
  className?: string;
};

export function BatchDocumentationCTA({
  guideSlug,
  title = "Review Published PSL Labs Batch Reports",
  description = "Every production lot released in our active catalog is paired with an authentic, third-party Certificate of Analysis from Janoshik Analytical. Inspect chromatographic purity, quantitative mass assays, and independent digital verification keys.",
  primaryLabel = "Look Up a Batch in COA Lookup",
  primaryHref = "/coa",
  secondaryLabel = "Explore Testing Methodology",
  secondaryHref = "/testing",
  showSampleBatch = true,
  className = "",
}: BatchDocumentationCTAProps) {
  // Use real batch reports from the central data source
  const sampleReports = batchReports.slice(0, 3);

  return (
    <section
      className={`rounded-xl border border-linen bg-surface p-6 sm:p-8 md:p-10 ${className}`}
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-accent">
            <ShieldCheck className="size-4 shrink-0" aria-hidden />
            <span>Research Verification Infrastructure</span>
          </div>
          <h3 className="font-display text-xl font-bold text-ink sm:text-2xl">
            {title}
          </h3>
          <p className="text-sm leading-relaxed text-ash sm:text-base">
            {description}
          </p>
        </div>

        {showSampleBatch && (
          <div className="flex flex-col gap-2 rounded-lg border border-linen bg-paper p-4">
            <p className="font-mono text-xs font-semibold text-stone uppercase tracking-wider">
              Currently Published Analytical Reports (Janoshik)
            </p>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3 pt-1">
              {sampleReports.map((report) => (
                <div
                  key={report.taskNumber}
                  className="flex flex-col gap-1 rounded border border-linen/80 bg-surface/50 p-2.5 text-xs font-mono"
                >
                  <span className="font-semibold text-ink truncate">
                    {report.product}
                  </span>
                  <span className="text-stone">Task #{report.taskNumber}</span>
                  <span className="text-accent font-medium">
                    {report.purityPercent
                      ? `${report.purityPercent}% purity`
                      : "Assay verified"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link
            href={primaryHref}
            onClick={() => trackGuideCtaClick("coa", guideSlug)}
            className="inline-flex items-center justify-center gap-2 rounded-pill bg-accent px-6 py-3 text-sm font-semibold text-page transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            <Search className="size-4 shrink-0" aria-hidden />
            <span>{primaryLabel}</span>
          </Link>

          <Link
            href={secondaryHref}
            onClick={() => trackGuideCtaClick("testing", guideSlug)}
            className="inline-flex items-center justify-center gap-2 rounded-pill border border-border-strong bg-paper px-6 py-3 text-sm font-semibold text-ink transition-colors hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            <FileCheck className="size-4 shrink-0" aria-hidden />
            <span>{secondaryLabel}</span>
          </Link>
        </div>

        <p className="text-xs text-stone leading-relaxed">
          Analytical reports reflect testing performed on the specific sample and lot identified. Materials are supplied exclusively for laboratory research and analytical calibration.
        </p>
      </div>
    </section>
  );
}
