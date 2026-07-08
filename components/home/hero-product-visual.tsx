import { ProductVialImage } from "@/components/product/product-vial-image";
import {
  formatReportedAmount,
  formatReportedPurity,
  retatrutideBlackTopReport,
} from "@/lib/batch-reports";
import { heroCopy } from "@/lib/home/homepage";

function ReportPreviewContent({ compact = false }: { compact?: boolean }) {
  const report = retatrutideBlackTopReport;
  const amount = formatReportedAmount(report.reportedAmountMg).replace(
    "mg",
    " mg"
  );
  const purity = formatReportedPurity(report.purityPercent);

  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[0.65rem] font-medium uppercase tracking-wide text-biotech-deep">
          Third-Party Test Report
        </p>
        <span className="badge-accent py-0.5 text-[0.5rem] before:hidden">
          Report
        </span>
      </div>
      <p
        className={
          compact
            ? "mt-1.5 font-display text-sm font-bold text-ink"
            : "mt-1.5 font-display text-base font-bold text-ink"
        }
      >
        {report.product}
      </p>
      <dl
        className={
          compact
            ? "mt-2 space-y-1 text-[0.65rem] leading-snug text-ash"
            : "mt-2 space-y-1 text-[0.7rem] leading-snug text-ash"
        }
      >
        <div className="flex justify-between gap-3">
          <dt>Batch</dt>
          <dd className="font-medium text-ink">{report.batch}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Purity</dt>
          <dd className="font-medium text-ink">{purity}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Reported Amount</dt>
          <dd className="font-medium text-ink">{amount}</dd>
        </div>
      </dl>
      <span className="mt-2.5 inline-flex text-[0.7rem] font-medium text-primary-blue underline-offset-2 group-hover:underline">
        View Test Report
      </span>
    </>
  );
}

function VialFrame() {
  return (
    <div className="overflow-hidden rounded-2xl border border-linen shadow-[0_16px_48px_rgba(37,99,235,0.12)]">
      <ProductVialImage
        src={heroCopy.productImageSrc}
        alt={heroCopy.productImageAlt}
        context="hero"
        priority
        animate
        className="w-full border-0"
      />
    </div>
  );
}

export function HeroProductVisual() {
  const report = retatrutideBlackTopReport;
  const showPreview =
    report.status === "report_available" && Boolean(report.reportUrl);

  return (
    <div className="relative mx-auto w-full max-w-[580px] md:max-w-[640px] lg:max-w-[700px]">
      <div
        aria-hidden
        className="absolute inset-[8%] -z-10 rounded-[2rem] bg-gradient-to-br from-primary-blue/15 via-cyan-accent/10 to-soft-blue blur-2xl"
      />

      {showPreview && (
        <a
          href={report.reportUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`View ${report.product} third-party test report for batch ${report.batch}`}
          className="group absolute left-0 top-[6%] z-20 hidden w-[44%] max-w-[11.5rem] -rotate-3 rounded-xl border border-linen bg-lab-white/95 p-3 shadow-[0_12px_32px_rgba(37,99,235,0.12)] backdrop-blur-sm transition-transform hover:-rotate-1 hover:shadow-[0_16px_36px_rgba(37,99,235,0.16)] sm:block md:left-[1%] md:w-[38%] md:max-w-[12.5rem]"
        >
          <ReportPreviewContent />
        </a>
      )}

      <VialFrame />

      {showPreview && (
        <a
          href={report.reportUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`View ${report.product} third-party test report for batch ${report.batch}`}
          className="group mt-4 block rounded-xl border border-linen bg-soft-blue/40 p-3 shadow-[0_8px_24px_rgba(37,99,235,0.08)] sm:hidden"
        >
          <ReportPreviewContent compact />
        </a>
      )}
    </div>
  );
}
