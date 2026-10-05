import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { ProductShowcase } from "@/components/product/product-showcase";
import { formatReportedPurity, retatrutideBlackTopReport } from "@/lib/batch-reports";
import { heroCopy } from "@/lib/home/homepage";
import { retatrutideSource } from "@/lib/products/retatrutide-source";

export function HeroProductVisual() {
  const report = retatrutideBlackTopReport;
  const showReport = report.status === "report_available" && Boolean(report.reportUrl);

  return (
    <div className="relative mx-auto w-full max-w-[640px]">
      <ProductShowcase src={heroCopy.productImageSrc} alt={heroCopy.productImageAlt} name={retatrutideSource.name} strength={retatrutideSource.nominalStrength} variant="hero" />
      <div className="mt-5 flex items-center justify-between gap-4 px-1 sm:mt-6">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-ash">In focus</p>
          <Link href={retatrutideSource.href} className="mt-1 inline-flex items-center gap-3 font-display text-xl font-medium text-ink underline-offset-4 hover:underline sm:text-2xl">
            Retatrutide <ArrowUpRight className="size-4 text-accent" aria-hidden />
          </Link>
        </div>
        {showReport && (
          <a href={report.reportUrl} target="_blank" rel="noopener noreferrer" className="group border-l border-border-strong pl-5 text-right focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent sm:pl-8" aria-label={`Open Retatrutide lab report for batch ${report.batch} in a new tab`}>
            <span className="block font-mono text-xl text-accent sm:text-2xl">{formatReportedPurity(report.purityPercent ?? 0)}</span>
            <span className="mt-1 inline-flex items-center gap-1 text-xs text-ash group-hover:text-ink">Reported purity <ArrowUpRight className="size-3" aria-hidden /></span>
          </a>
        )}
      </div>
      {showReport && <p className="mt-3 px-1 text-[11px] leading-relaxed text-ash">{report.batch} batch · Results apply to the sample tested. See the original report for its scope.</p>}
    </div>
  );
}
