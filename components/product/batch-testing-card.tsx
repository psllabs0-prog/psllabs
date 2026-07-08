import Image from "next/image";
import { ExternalLink } from "lucide-react";

import type { BatchReport } from "@/lib/batch-reports";
import {
  formatReportedAmount,
  formatReportedPurity,
} from "@/lib/batch-reports";

const BATCH_REPORT_DISCLAIMER =
  "This third-party laboratory report applies only to the specific sample and batch identified in the report. Results do not establish safety, efficacy, sterility, regulatory approval, or suitability for human use.";

const BATCH_SCOPE_NOTE =
  "Laboratory results apply only to the tested sample and batch identified above.";

type BatchTestingCardProps = {
  report: BatchReport;
};

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-linen/80 py-3 last:border-b-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
      <dt className="text-xs font-medium uppercase tracking-wide text-ash">
        {label}
      </dt>
      <dd className="text-sm font-medium text-ink sm:text-right">{value}</dd>
    </div>
  );
}

export function BatchTestingCard({ report }: BatchTestingCardProps) {
  const amountLabel = formatReportedAmount(report.reportedAmountMg);
  const purityLabel = formatReportedPurity(report.purityPercent);

  return (
    <div className="premium-card overflow-hidden p-6 md:p-7">
      <div className="mb-5 flex flex-wrap gap-2">
        <span className="badge-verified">Third-party tested</span>
        <span className="badge-accent">Third-Party Report Available</span>
      </div>

      <h3 className="font-display text-lg font-bold text-ink">
        Batch Testing — {report.batch}
      </h3>
      <p className="mt-2 text-sm text-ash">
        Laboratory-reported results for the sample and batch identified below.
        These results are batch-specific and do not apply to other lots.
      </p>

      <dl className="mt-5 rounded-xl border border-linen bg-soft-blue/30 px-4 py-1">
        <DetailRow label="Laboratory" value={report.laboratory} />
        <DetailRow label="Batch" value={report.batch} />
        <DetailRow label="Task Number" value={report.taskNumber} />
        <DetailRow label="Identity Result" value={report.identityResult} />
        <DetailRow
          label="Laboratory-Reported Amount"
          value={amountLabel}
        />
        <DetailRow
          label="Laboratory-Reported Purity"
          value={purityLabel}
        />
        <DetailRow label="Analysis Date" value={report.analysisDate} />
      </dl>

      <div className="mt-5 grid gap-3 rounded-xl border border-linen bg-lab-white p-4 sm:grid-cols-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-ash">
            Nominal Strength
          </p>
          <p className="mt-1 font-display text-xl font-bold text-ink">
            {report.nominalStrength}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-ash">
            Laboratory-Reported Amount — Batch {report.batch}
          </p>
          <p className="mt-1 font-display text-xl font-bold text-ink">
            {amountLabel}
          </p>
        </div>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-ash">{BATCH_SCOPE_NOTE}</p>

      <div className="mt-6 overflow-hidden rounded-xl border border-linen bg-soft-blue/20">
        <a
          href={report.reportUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="group block"
        >
          <div className="relative aspect-[3/4] w-full max-h-[520px] bg-lab-white sm:aspect-[4/5] sm:max-h-[640px]">
            <Image
              src={report.reportUrl}
              alt={report.reportAltText}
              fill
              className="object-contain object-top p-2 transition-opacity group-hover:opacity-95 sm:p-3"
              sizes="(max-width: 768px) 100vw, 640px"
              quality={95}
              unoptimized
            />
          </div>
          <span className="sr-only">Open full test report in a new tab</span>
        </a>
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <a
          href={report.reportUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2 rounded-pill bg-ink px-5 py-3 text-sm font-medium text-lab-white transition-opacity hover:opacity-90"
        >
          View Test Report
          <ExternalLink className="size-3.5" aria-hidden />
        </a>
        <a
          href={report.verificationUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2 rounded-pill border border-linen bg-lab-white px-5 py-3 text-sm font-medium text-ink transition-colors hover:border-primary-blue/40"
        >
          Verify with Janoshik
          <ExternalLink className="size-3.5" aria-hidden />
        </a>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-ash">
        Use the unique verification key shown on the original report.
      </p>

      <p className="mt-6 border-t border-linen pt-4 text-xs leading-relaxed text-ash">
        {BATCH_REPORT_DISCLAIMER}
      </p>
    </div>
  );
}
