import Link from "next/link";
import { AlertCircle, CheckCircle2, FileText } from "lucide-react";

type TestingScopeExplainerProps = {
  className?: string;
  showPolicy?: boolean;
};

export function TestingScopeExplainer({
  className = "",
  showPolicy = true,
}: TestingScopeExplainerProps) {
  return (
    <div className={`flex flex-col gap-8 ${className}`}>
      <section className="rounded-xl border border-linen bg-surface p-6 md:p-8">
        <div className="flex items-center gap-2.5 text-accent">
          <FileText className="size-5 shrink-0" aria-hidden />
          <h2 className="font-display text-lg font-bold text-ink md:text-xl">
            What the lab report usually shows
          </h2>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-ash md:text-base">
          Our published reports come from Janoshik Analytical, an independent lab. Most peptide reports cover three separate measurements. They answer different questions.
        </p>

        <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-3">
          <div className="rounded-lg border border-border-strong bg-paper p-4">
            <p className="font-mono text-xs font-semibold uppercase tracking-wider text-accent">
              1. Identity
            </p>
            <h3 className="mt-1 font-display text-base font-bold text-ink">
              What material did the lab find?
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-ash">
              <strong className="text-ink">What it tells you:</strong> Whether the tested sample matches the expected compound, usually using mass spectrometry (a method that checks molecular mass) and related lab checks.
            </p>
            <p className="mt-2 text-xs leading-relaxed text-ash">
              <strong className="text-ink">What it doesn&apos;t tell you:</strong> How much material is in the vial, or how clean the sample is.
            </p>
          </div>

          <div className="rounded-lg border border-border-strong bg-paper p-4">
            <p className="font-mono text-xs font-semibold uppercase tracking-wider text-accent">
              2. Purity
            </p>
            <h3 className="mt-1 font-display text-base font-bold text-ink">
              How clean did the sample look?
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-ash">
              <strong className="text-ink">What it tells you:</strong> Under HPLC testing (a common lab method that separates components in a sample), how much of the detected signal was reported as the target compound.
            </p>
            <p className="mt-2 text-xs leading-relaxed text-ash">
              <strong className="text-ink">What it doesn&apos;t tell you:</strong> The exact milligrams in the vial. A high purity percentage is not the same as total amount.
            </p>
          </div>

          <div className="rounded-lg border border-border-strong bg-paper p-4">
            <p className="font-mono text-xs font-semibold uppercase tracking-wider text-accent">
              3. Amount
            </p>
            <h3 className="mt-1 font-display text-base font-bold text-ink">
              How much was measured?
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-ash">
              <strong className="text-ink">What it tells you:</strong> How much target material the lab measured in the tested sample (for example, 10.34 mg in a vial labeled 10 mg), or concentration for solutions.
            </p>
            <p className="mt-2 text-xs leading-relaxed text-ash">
              <strong className="text-ink">What it doesn&apos;t tell you:</strong> Sterility, endotoxin status, or other tests that were not run.
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

      <section className="rounded-xl border border-linen bg-surface p-6 md:p-8">
        <div className="flex items-center gap-2.5 text-signal">
          <AlertCircle className="size-5 shrink-0" aria-hidden />
          <h2 className="font-display text-lg font-bold text-ink md:text-xl">
            What these reports do not cover
          </h2>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-ash md:text-base">
          A standard HPLC and mass report is useful, but it is not a full quality certificate for every possible test. Unless a separate test is clearly listed on the report, it does not cover:
        </p>

        <ul className="mt-5 space-y-3 text-sm text-ash md:text-base">
          <li className="flex items-start gap-3">
            <span className="font-mono text-xs text-signal pt-0.5">•</span>
            <span>
              <strong className="text-ink">Sterility.</strong> Chemical purity testing does not check for live microbes.
            </span>
          </li>
          <li className="flex items-start gap-3">
            <span className="font-mono text-xs text-signal pt-0.5">•</span>
            <span>
              <strong className="text-ink">Endotoxins.</strong> Bacterial endotoxin (pyrogen) testing needs a separate assay, often called an LAL test.
            </span>
          </li>
          <li className="flex items-start gap-3">
            <span className="font-mono text-xs text-signal pt-0.5">•</span>
            <span>
              <strong className="text-ink">Human safety or efficacy.</strong> Lab chemistry results do not tell you how a material behaves in people or animals.
            </span>
          </li>
          <li className="flex items-start gap-3">
            <span className="font-mono text-xs text-signal pt-0.5">•</span>
            <span>
              <strong className="text-ink">Use in people or animals.</strong> These materials are for laboratory research only.
            </span>
          </li>
          <li className="flex items-start gap-3">
            <span className="font-mono text-xs text-signal pt-0.5">•</span>
            <span>
              <strong className="text-ink">FDA approval.</strong> A third-party lab report is not FDA approval or drug certification.
            </span>
          </li>
        </ul>

        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-linen pt-3 text-xs font-mono text-stone">
          <span>Full guide:</span>
          <Link
            href="/guides/what-peptide-testing-can-establish"
            className="text-accent underline underline-offset-2 hover:opacity-80"
          >
            What testing can and cannot establish
          </Link>
        </div>
      </section>

      {showPolicy && (
        <section className="rounded-xl border border-linen bg-surface p-6 md:p-8">
          <div className="flex items-center gap-2.5 text-accent">
            <CheckCircle2 className="size-5 shrink-0" aria-hidden />
            <h2 className="font-display text-lg font-bold text-ink md:text-xl">
              How we publish batch reports
            </h2>
          </div>
          <div className="mt-4 space-y-3 text-sm leading-relaxed text-ash md:text-base">
            <p>
              <strong className="text-ink">1. Active products have published reports.</strong> If a product is available to buy in our catalog, its current lot report is already published in{" "}
              <Link href="/coa" className="font-medium text-accent underline underline-offset-4 hover:opacity-80">
                COA Lookup
              </Link>.
            </p>
            <p>
              <strong className="text-ink">2. Results apply to that batch.</strong> The report covers the lot and sample the lab tested. We do not reuse one lot&apos;s numbers for a different lot.
            </p>
            <p>
              <strong className="text-ink">3. Coming Soon stays unavailable.</strong> Items marked Coming Soon are still in synthesis or testing. They are not for sale until the report is published.
            </p>
            <p>
              <strong className="text-ink">4. You can verify the file yourself.</strong> Each report includes a Janoshik task number and verification key. Confirm the original on{" "}
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
      )}
    </div>
  );
}
