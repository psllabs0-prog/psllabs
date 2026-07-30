import type { Metadata } from "next";

import { AnimateIn } from "@/components/product/animate-in";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Peptide Purity Percentages Explained",
  description:
    "Understand what peptide purity percentages actually mean. Learn how HPLC purity is measured, what the remaining percentage represents, and why small differences can matter in research.",
  path: "/guides/peptide-purity-percentages",
  type: "article",
});

export default function PeptidePurityPercentagesGuidePage() {
  return (
    <main className="section-surface-ice min-h-screen">
      <article className="mx-auto max-w-[720px] px-6 py-16 md:px-12 md:py-20 lg:px-24 lg:py-24">
        <header className="mb-10 border-b border-linen pb-10 md:mb-12 md:pb-12">
          <AnimateIn>
            <p className="mono text-ash">GUIDE</p>
          </AnimateIn>
          <AnimateIn delay={0.06}>
            <h1 className="mt-4 font-[family-name:var(--font-display)] text-[clamp(2rem,4vw,2.5rem)] leading-[1.15] tracking-[-0.02em] text-ink">
              Peptide Purity Percentages — What Do They Actually Mean?
            </h1>
          </AnimateIn>
          <AnimateIn delay={0.1}>
            <p className="mt-5 text-base leading-relaxed text-ash md:text-[1.0625rem]">
              A plain-language explanation of HPLC purity numbers on research
              peptide Certificates of Analysis: how they are calculated, what
              the remainder can include, and why purity is only one part of
              quality documentation.
            </p>
          </AnimateIn>
        </header>

        <div className="flex flex-col gap-10 text-base leading-relaxed text-ink md:gap-12 md:text-[1.0625rem]">
          <AnimateIn delay={0.12}>
            <section className="flex flex-col gap-4">
              <h2 className="font-[family-name:var(--font-display)] text-xl font-bold text-ink md:text-2xl">
                What a purity percentage represents
              </h2>
              <p className="text-ash">
                On a typical peptide Certificate of Analysis (COA), a purity
                percentage estimates how much of the detected material in the
                tested sample is the target peptide versus everything else the
                method sees. If a report lists 99.5% purity by HPLC, that figure
                means that—under the laboratory’s method—about 99.5% of the
                integrated signal is attributed to the main peptide peak, and
                about 0.5% is attributed to other detected peaks.
              </p>
              <p className="text-ash">
                Purity is therefore a relative composition metric for that
                analytical run. It is not a statement about biological activity,
                and it applies only to the sample and batch identified in the
                report.
              </p>
            </section>
          </AnimateIn>

          <AnimateIn delay={0.14}>
            <section className="flex flex-col gap-4">
              <h2 className="font-[family-name:var(--font-display)] text-xl font-bold text-ink md:text-2xl">
                How purity is measured
              </h2>
              <p className="text-ash">
                Most research peptide purity values come from HPLC
                (high-performance liquid chromatography). In HPLC, the dissolved
                sample is pushed through a column packed with a specialized
                material. Different compounds travel at different rates, so they
                exit the column at different times and are recorded by a
                detector.
              </p>
              <p className="text-ash">
                The chromatogram is the graph of detector response versus time.
                Each peak corresponds to a component (or unresolved group of
                components) that eluted at that time. Analysts integrate peak
                areas—the area under each peak. For a common area-percent purity
                calculation, the area of the main (target) peak is divided by
                the total area of all integrated peaks, then expressed as a
                percentage. Method details, detection wavelength, and
                integration rules can all influence the number, which is why the
                full report and chromatogram matter more than a lone percentage
                copied into a summary.
              </p>
            </section>
          </AnimateIn>

          <AnimateIn delay={0.16}>
            <section className="flex flex-col gap-4">
              <h2 className="font-[family-name:var(--font-display)] text-xl font-bold text-ink md:text-2xl">
                What the remaining percentage could be
              </h2>
              <p className="text-ash">
                The fraction that is not the main peak is the impurity load
                visible to that HPLC method. Depending on the synthesis, workup,
                and storage history, it may include residual solvents (if they
                are detected under the method), synthesis byproducts, truncated
                or deletion sequences, closely related peptide sequences,
                degradation products formed after synthesis, or other process
                impurities. Some impurities may not appear at the detection
                settings used, so “100% minus purity” is best read as “other
                peaks seen here,” not a complete chemical inventory of the
                vial. Complementary tests on the same COA—when present—help
                narrow what those other peaks might represent.
              </p>
            </section>
          </AnimateIn>

          <AnimateIn delay={0.18}>
            <section className="flex flex-col gap-4">
              <h2 className="font-[family-name:var(--font-display)] text-xl font-bold text-ink md:text-2xl">
                The difference between 99.0% and 99.8%
              </h2>
              <p className="text-ash">
                Small gaps in purity look minor on a label but scale the amount
                of non-target signal. A sample reported at 99.0% purity has about
                1.0% other integrated material. A sample at 99.6% has about 0.4%
                other material. That means the 99.0% result carries roughly 2.5
                times as much non-target peak area as the 99.6% result (1.0 ÷
                0.4 = 2.5). Comparing 99.0% with 99.8% is similar in spirit: 1.0%
                versus 0.2% other material is a fivefold difference in impurity
                peak load under the same style of calculation.
              </p>
              <p className="text-ash">
                Those ratios do not automatically tell you whether the
                impurities are consequential for a given experiment—that depends
                on what they are and what your assay measures—but they explain
                why laboratories and researchers often care about tenths of a
                percent when comparing lots.
              </p>
            </section>
          </AnimateIn>

          <AnimateIn delay={0.2}>
            <section className="flex flex-col gap-4">
              <h2 className="font-[family-name:var(--font-display)] text-xl font-bold text-ink md:text-2xl">
                Why purity is not the only metric
              </h2>
              <p className="text-ash">
                Identity confirmation matters as much as purity. A material that
                is 99.9% “pure” by HPLC is still the wrong tool if the main peak
                is not the intended peptide. Identity is typically supported by
                methods such as mass spectrometry or other orthogonal tests
                listed on the report, alongside the chromatogram.
              </p>
              <p className="text-ash">
                Quantity matters too. Purity describes composition of what was
                detected; it does not by itself state how many milligrams are in
                the vial. Content or assay results (when reported) address how
                much material is present. A useful COA for research documentation
                therefore ties together identity, purity, and quantity for the
                named batch—each answering a different question.
              </p>
            </section>
          </AnimateIn>

          <AnimateIn delay={0.22}>
            <section className="flex flex-col gap-4">
              <h2 className="font-[family-name:var(--font-display)] text-xl font-bold text-ink md:text-2xl">
                How to verify a purity claim
              </h2>
              <p className="text-ash">
                Independent laboratory verification helps confirm that the
                purity number on a document matches what the testing lab
                recorded. When a third-party lab provides a public check,
                compare the task or report identifier on the COA with the lab’s
                own record rather than relying only on a reseller’s screenshot.
              </p>
              <p className="text-ash">
                One example is Janoshik’s verification tool at{" "}
                <a
                  href="https://janoshik.com/verify"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-petrol underline underline-offset-4 transition-opacity hover:opacity-80"
                >
                  janoshik.com/verify
                </a>
                . Entering the task number from a Janoshik report retrieves the
                original laboratory record so you can confirm that the reported
                purity (and related fields) match what the lab issued for that
                analysis.
              </p>
            </section>
          </AnimateIn>

          <AnimateIn delay={0.24}>
            <section className="flex flex-col gap-4">
              <h2 className="font-[family-name:var(--font-display)] text-xl font-bold text-ink md:text-2xl">
                Purity as one part of the quality picture
              </h2>
              <p className="text-ash">
                Use purity percentages as one documented measurement among
                several: read them with the chromatogram, identity results,
                quantity data, batch identifiers, and storage history. A single
                high number is helpful, but it is not a complete substitute for
                a full, verifiable laboratory report tied to the lot in hand.
                When purity, identity, and quantity agree with the labeled
                material—and the lab record can be checked independently—you
                have a stronger documentation trail for research use of that
                batch.
              </p>
            </section>
          </AnimateIn>
        </div>
      </article>
    </main>
  );
}
