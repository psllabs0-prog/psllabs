import Link from "next/link";
import { CheckCircle2, FileText } from "lucide-react";
import { AnimateIn } from "@/components/product/animate-in";
import { reconstitutionSolution5mlReport } from "@/lib/batch-reports";

type TestingScopeExplainerProps = {
  className?: string;
  showPolicy?: boolean;
  reportKind?: "peptide" | "solution";
};

export function TestingScopeExplainer({
  className = "",
  showPolicy = true,
  reportKind = "peptide",
}: TestingScopeExplainerProps) {
  const solution = reportKind === "solution";
  return (
    <div className={`flex flex-col gap-8 ${className}`}>
      <AnimateIn>
        <section className="public-section-card p-6 md:p-8">
          <div className="flex items-center gap-2.5 text-accent">
            <FileText className="size-5 shrink-0" aria-hidden />
            <h2 className="font-display text-lg font-bold text-ink md:text-xl">
              What the lab report shows
            </h2>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-ash md:text-base">
            {solution
              ? `The Janoshik report for Batch ${reconstitutionSolution5mlReport.batch}, Task #${reconstitutionSolution5mlReport.taskNumber}, reports benzyl alcohol concentration. Read that result separately from peptide purity or vial amount.`
              : "Our published peptide reports come from Janoshik Analytical, an independent lab. The report shows three main results. Each one answers a different question."}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-ash md:text-base">
            The report only covers the tests shown on the original laboratory file.
          </p>

          <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-3">
            <div className="rounded-lg border border-border-strong bg-paper p-4">
              <p className="font-mono text-xs font-semibold uppercase tracking-wider text-accent">
                {solution ? "Sample" : "Identity"}
              </p>
              <h3 className="mt-1 font-display text-base font-bold text-ink">
                {solution ? "What sample is named on the report?" : "What material did the lab identify?"}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-ash">
                {solution ? "The sample field names bacteriostatic water. The requested test is benzyl alcohol analysis." : "The report shows whether the tested sample matches the expected compound."}
              </p>
            </div>

            <div className="rounded-lg border border-border-strong bg-paper p-4">
              <p className="font-mono text-xs font-semibold uppercase tracking-wider text-accent">
                {solution ? "Concentration" : "Purity"}
              </p>
              <h3 className="mt-1 font-display text-base font-bold text-ink">
                {solution ? "How much benzyl alcohol was measured?" : "How clean did the sample look in the lab's purity test?"}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-ash">
                {solution ? `The reported result is ${reconstitutionSolution5mlReport.reportedResult!.value} benzyl alcohol in the tested sample. This is a concentration, not a peptide purity percentage.` : "The report gives a purity percentage for the tested sample."}
              </p>
            </div>

            <div className="rounded-lg border border-border-strong bg-paper p-4">
              <p className="font-mono text-xs font-semibold uppercase tracking-wider text-accent">
                {solution ? "Scope" : "Amount"}
              </p>
              <h3 className="mt-1 font-display text-base font-bold text-ink">
                {solution ? "What does this report not establish?" : "How much material did the lab measure?"}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-ash">
                {solution ? "This report does not list peptide purity, sterility or endotoxin results. The sample name and concentration do not establish suitability for use in people or animals." : "The report shows how much target material was measured in the tested sample. For a solution, it may show concentration instead."}
              </p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-linen pt-3 text-xs font-mono text-stone">
            <span>Want more detail?</span>
            <Link
              href="/guides/peptide-identity-vs-purity-vs-content"
              className="text-accent underline underline-offset-2 hover:opacity-80"
            >
              Identity vs purity vs amount
            </Link>
            <span>·</span>
            <Link
              href="/guides/peptide-purity-vs-content"
              className="text-accent underline underline-offset-2 hover:opacity-80"
            >
              What 99% purity means
            </Link>
          </div>
        </section>
      </AnimateIn>

      {showPolicy && (
        <AnimateIn>
          <section className="public-section-card p-6 md:p-8">
            <div className="flex items-center gap-2.5 text-accent">
              <CheckCircle2 className="size-5 shrink-0" aria-hidden />
              <h2 className="font-display text-lg font-bold text-ink md:text-xl">
                How we publish batch reports
              </h2>
            </div>
            <div className="mt-4 space-y-3 text-sm leading-relaxed text-ash md:text-base">
              <p>
                <strong className="text-ink">1. Active products have published reports.</strong> If a product is available to buy, its current batch report is already published in{" "}
                <Link href="/coa" className="font-medium text-accent underline underline-offset-4 hover:opacity-80">
                  Batch Reports
                </Link>.
              </p>
              <p>
                <strong className="text-ink">2. Results apply to that batch.</strong> The report covers the batch and sample the lab tested. We do not reuse one batch&apos;s numbers for a different batch.
              </p>
              <p>
                <strong className="text-ink">3. Coming Soon stays unavailable.</strong> Items marked Coming Soon are not for sale until the report is published.
              </p>
              <p>
                <strong className="text-ink">4. You can check the original file.</strong> Each report includes a Janoshik task number. Open the original on{" "}
                <a
                  href="https://verify.janoshik.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-accent underline underline-offset-4 hover:opacity-80"
                >
                  verify.janoshik.com
                </a>.
              </p>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-linen pt-3 text-xs font-mono text-stone">
              <span>Related reading:</span>
              <Link
                href="/guides/batch-specific-vs-generic-coa"
                className="text-accent underline underline-offset-2 hover:opacity-80"
              >
                Why the batch number matters
              </Link>
              <span>·</span>
              <Link
                href="/guides/verify-peptide-laboratory-report"
                className="text-accent underline underline-offset-2 hover:opacity-80"
              >
                How to verify a lab report
              </Link>
            </div>
          </section>
        </AnimateIn>
      )}
    </div>
  );
}
