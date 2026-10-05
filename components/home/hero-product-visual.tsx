import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import {
  formatReportedAmount,
  formatReportedPurity,
  retatrutideBlackTopReport,
} from "@/lib/batch-reports";
import { heroCopy } from "@/lib/home/homepage";

export function HeroProductVisual() {
  const report = retatrutideBlackTopReport;
  const showReport = report.status === "report_available" && Boolean(report.reportUrl);

  return (
    <div className="relative mx-auto w-full max-w-[580px]">
      <div className="relative overflow-hidden rounded-2xl border border-border-strong bg-surface shadow-[0_24px_80px_-32px_rgba(0,0,0,0.8)]">
        <div className="absolute left-5 right-5 top-5 z-10 flex items-center justify-between gap-4 text-xs text-ash sm:left-7 sm:right-7 sm:top-6">
          <span className="font-mono uppercase tracking-[0.12em]">A closer look</span>
          <span>Retatrutide · 10 mg</span>
        </div>

        <div className="relative flex h-[350px] items-center justify-center overflow-hidden pt-7 sm:h-[405px] lg:h-[430px]">
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_45%,rgba(47,182,224,0.14),transparent_65%)]" />
          <div aria-hidden className="pointer-events-none absolute bottom-7 left-1/2 h-12 w-[64%] -translate-x-1/2 rounded-[100%] border border-accent/10 bg-paper/60 shadow-[0_8px_28px_rgba(0,0,0,0.3)]" />
          <div className="animate-float relative w-[245px] sm:w-[285px] lg:w-[305px]">
            <Image
              src={heroCopy.productImageSrc}
              alt={heroCopy.productImageAlt}
              width={1227}
              height={1282}
              preload
              sizes="(max-width: 640px) 245px, (max-width: 1024px) 285px, 305px"
              className="relative h-auto w-full object-contain drop-shadow-[12px_22px_16px_rgba(0,0,0,0.45)]"
            />
          </div>
        </div>

        {showReport && (
          <div className="relative border-t border-border-strong bg-paper/80 px-5 py-5 sm:px-7 sm:py-6">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <p className="text-sm font-medium text-ink">From the published batch report</p>
              <span className="font-mono text-xs text-ash">{report.batch}</span>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-4">
              <div>
                <dt className="text-xs text-ash">Reported purity</dt>
                <dd className="mt-1 font-mono text-xl text-accent sm:text-2xl">
                  {formatReportedPurity(report.purityPercent ?? 0)}
                </dd>
              </div>
              <div className="border-l border-border-strong pl-5">
                <dt className="text-xs text-ash">Reported amount</dt>
                <dd className="mt-1 font-mono text-xl text-ink sm:text-2xl">
                  {formatReportedAmount(report.reportedAmountMg ?? 0)}
                </dd>
              </div>
            </dl>
            <a
              href={report.reportUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 inline-flex items-center gap-1.5 text-sm text-accent underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
              aria-label={`Open ${report.product} lab report for batch ${report.batch} in a new tab`}
            >
              Open the original lab report <ArrowUpRight className="size-4" aria-hidden />
            </a>
            <p className="mt-2 text-xs leading-relaxed text-ash">Results apply to the sample tested. Check the report for its scope.</p>
          </div>
        )}
      </div>
      <div className="mt-4 flex items-center justify-between gap-4 px-1 text-xs text-ash">
        <span>Batch details, before checkout.</span>
        <Link href="/coa" className="shrink-0 text-ink underline-offset-4 hover:underline">All batch reports →</Link>
      </div>
    </div>
  );
}
