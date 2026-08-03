import Image from "next/image";
import Link from "next/link";
import { ExternalLink } from "lucide-react";

import type { BatchReport } from "@/lib/batch-reports";
import {
  batchReportToCertificateRows,
  formatReportedAmount,
} from "@/lib/batch-reports";
import { CertificatePanel } from "@/components/ui/certificate-panel";
import { TESTING_SCOPE_STATEMENT } from "@/lib/content/testing-scope";

const BATCH_REPORT_DISCLAIMER =
  "This third-party laboratory report applies only to the specific sample and batch identified in the report. Results do not establish safety, efficacy, sterility, regulatory approval, or suitability for human use.";

const BATCH_SCOPE_NOTE =
  "Laboratory results apply only to the tested sample and batch identified above.";

type BatchTestingCardProps = {
  report: BatchReport;
};

export function BatchTestingCard({ report }: BatchTestingCardProps) {
  const amountLabel = formatReportedAmount(report.reportedAmountMg);

  return (
    <div className="flex flex-col gap-5">
      <CertificatePanel
        headerLabel={`Batch Testing — ${report.batch}`}
        rows={batchReportToCertificateRows(report)}
      />

      <div className="rounded-md border border-linen bg-surface p-5 md:p-6">
        <p className="text-sm leading-relaxed text-ash">
          {TESTING_SCOPE_STATEMENT} Results are batch-specific and do not apply
          to other lots.
        </p>

        <div className="mt-5 grid gap-3 rounded-md border border-border-strong bg-paper p-4 sm:grid-cols-2">
          <div>
            <p className="font-mono text-[0.6875rem] uppercase tracking-[0.08em] text-stone">
              Nominal Strength
            </p>
            <p className="mt-1 font-mono text-xl font-medium text-ink">
              {report.nominalStrength}
            </p>
            <p className="mt-1 text-xs text-ash">Labeled vial strength</p>
          </div>
          <div>
            <p className="font-mono text-[0.6875rem] uppercase tracking-[0.08em] text-stone">
              Laboratory-Reported Amount — Batch {report.batch}
            </p>
            <p className="mt-1 font-mono text-xl font-medium text-ink">
              {amountLabel}
            </p>
            <p className="mt-1 text-xs text-ash">
              Amount reported for the tested sample
            </p>
          </div>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-ash">{BATCH_SCOPE_NOTE}</p>

        <div className="mt-6 overflow-hidden rounded-md border border-linen bg-paper">
          <a
            href={report.reportUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="group block focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <div className="relative aspect-[3/4] w-full max-h-[520px] bg-paper sm:aspect-[4/5] sm:max-h-[640px]">
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
            className="inline-flex items-center justify-center gap-2 rounded-pill bg-accent px-5 py-3 text-sm font-medium text-page transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            View original report
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
          <a
            href={report.verificationUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-pill border border-border-strong bg-surface px-5 py-3 text-sm font-medium text-ink transition-colors hover:border-accent/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Verify with Janoshik
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
          <Link
            href="/coa"
            className="inline-flex items-center justify-center gap-2 rounded-pill border border-border-strong bg-surface px-5 py-3 text-sm font-medium text-ink transition-colors hover:border-accent/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            COA / Batch Lookup
          </Link>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-ash">
          Use the unique verification key shown on the original report.
        </p>

        <p className="mt-6 border-t border-linen pt-4 text-xs leading-relaxed text-ash">
          {BATCH_REPORT_DISCLAIMER}
        </p>
      </div>
    </div>
  );
}
