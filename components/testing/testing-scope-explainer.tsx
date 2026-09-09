import Link from "next/link";
import { AlertCircle, CheckCircle2, FileText, HelpCircle } from "lucide-react";

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
      {/* Analytical Definitions Grid */}
      <section className="rounded-xl border border-linen bg-surface p-6 md:p-8">
        <div className="flex items-center gap-2.5 text-accent">
          <FileText className="size-5 shrink-0" aria-hidden />
          <h2 className="font-display text-lg font-bold text-ink md:text-xl">
            Understanding Analytical Testing Metrics
          </h2>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-ash md:text-base">
          Our third-party test reports from Janoshik Analytical evaluate physical samples using standardized laboratory instrumentation (High-Performance Liquid Chromatography and Mass Spectrometry). Below is what each metric measures:
        </p>

        <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-3">
          <div className="rounded-lg border border-border-strong bg-paper p-4">
            <p className="font-mono text-xs font-semibold uppercase tracking-wider text-accent">
              1. Identity
            </p>
            <h3 className="mt-1 font-display text-base font-bold text-ink">
              Chemical Identity
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-ash">
              Confirms that the molecular structure of the sample matches the target compound by comparing chromatographic retention time and mass-to-charge ratio (MS) against verified reference standards.
            </p>
          </div>

          <div className="rounded-lg border border-border-strong bg-paper p-4">
            <p className="font-mono text-xs font-semibold uppercase tracking-wider text-accent">
              2. Purity (HPLC)
            </p>
            <h3 className="mt-1 font-display text-base font-bold text-ink">
              Chromatographic Purity
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-ash">
              Determined by UV peak area percentage at 214nm/220nm on HPLC. This quantifies the proportion of the target compound relative to detectable synthesis byproducts, truncation sequences, or related substances.
            </p>
          </div>

          <div className="rounded-lg border border-border-strong bg-paper p-4">
            <p className="font-mono text-xs font-semibold uppercase tracking-wider text-accent">
              3. Reported Amount
            </p>
            <h3 className="mt-1 font-display text-base font-bold text-ink">
              Quantitative Mass Assay
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-ash">
              Measures the absolute net mass of active peptide content present in the specific tested vial (e.g., 10.34 mg for a nominal 10 mg vial), or active concentration for solutions (e.g., benzyl alcohol %).
            </p>
          </div>
        </div>
      </section>

      {/* What this report does NOT establish */}
      <section className="rounded-xl border border-linen bg-surface p-6 md:p-8">
        <div className="flex items-center gap-2.5 text-signal">
          <AlertCircle className="size-5 shrink-0" aria-hidden />
          <h2 className="font-display text-lg font-bold text-ink md:text-xl">
            What Analytical Reports Do Not Establish
          </h2>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-ash md:text-base">
          To maintain strict scientific transparency and research compliance, researchers must recognize the boundaries of third-party HPLC and mass assay reports. Unless independently established by a separate designated test, analytical reports do not establish:
        </p>

        <ul className="mt-5 space-y-3 text-sm text-ash md:text-base">
          <li className="flex items-start gap-3">
            <span className="font-mono text-xs text-signal pt-0.5">—</span>
            <span>
              <strong className="text-ink">Sterility:</strong> HPLC purity testing assesses chemical composition, not microbiological sterility or absence of viable microorganisms.
            </span>
          </li>
          <li className="flex items-start gap-3">
            <span className="font-mono text-xs text-signal pt-0.5">—</span>
            <span>
              <strong className="text-ink">Endotoxin / Pyrogen Status:</strong> Bacterial endotoxin levels require a separate Limulus Amebocyte Lysate (LAL) assay and are not evaluated in standard HPLC purity scans.
            </span>
          </li>
          <li className="flex items-start gap-3">
            <span className="font-mono text-xs text-signal pt-0.5">—</span>
            <span>
              <strong className="text-ink">Human Safety, Pharmacology, or Efficacy:</strong> Chemical verification of compound identity and purity provides no assessment of biological activity, pharmacokinetics, or safety profile in biological systems.
            </span>
          </li>
          <li className="flex items-start gap-3">
            <span className="font-mono text-xs text-signal pt-0.5">—</span>
            <span>
              <strong className="text-ink">Suitability for In Vivo Administration:</strong> All compounds are intended exclusively for in vitro laboratory research and analytical calibration. Analytical data does not imply suitability for clinical, veterinary, or human administration.
            </span>
          </li>
          <li className="flex items-start gap-3">
            <span className="font-mono text-xs text-signal pt-0.5">—</span>
            <span>
              <strong className="text-ink">Regulatory Approval:</strong> Third-party analytical documentation does not constitute FDA approval, cGMP drug substance certification, or medical device registration.
            </span>
          </li>
        </ul>
      </section>

      {/* Lot Documentation Policy ("Selected Lots" Explanation) */}
      {showPolicy && (
        <section className="rounded-xl border border-linen bg-surface p-6 md:p-8">
          <div className="flex items-center gap-2.5 text-accent">
            <CheckCircle2 className="size-5 shrink-0" aria-hidden />
            <h2 className="font-display text-lg font-bold text-ink md:text-xl">
              Our Lot Documentation Policy
            </h2>
          </div>
          <div className="mt-4 space-y-3 text-sm leading-relaxed text-ash md:text-base">
            <p>
              PSL Labs operates a strict verification-before-release policy:
            </p>
            <p>
              <strong>1. Every active catalog batch has published documentation:</strong> Every currently sellable product in our active catalog has an independent, batch-matched analytical report published and accessible in our{" "}
              <Link href="/coa" className="font-medium text-accent underline underline-offset-4 hover:opacity-80">
                COA Lookup
              </Link>{" "}
              prior to inventory availability.
            </p>
            <p>
              <strong>2. Batch-specific scope:</strong> Analytical testing is performed on individual production lots. The results shown on any Certificate of Analysis apply strictly to the specific lot number and sample analyzed by the independent laboratory. We do not extrapolate purity or concentration data from one lot to another.
            </p>
            <p>
              <strong>3. Pipeline materials:</strong> Compounds designated as &quot;Coming Soon&quot; are currently undergoing synthesis or independent analytical verification. They are not released for purchase until laboratory documentation is published and verified.
            </p>
            <p>
              <strong>4. Independent verification:</strong> Every published report includes the original Janoshik task number and a unique digital verification key, enabling researchers to independently verify the authentic document directly on the laboratory&apos;s server at{" "}
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
        </section>
      )}
    </div>
  );
}
