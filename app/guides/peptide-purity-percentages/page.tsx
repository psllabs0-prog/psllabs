import type { Metadata } from "next";

import { AnimateIn } from "@/components/product/animate-in";
import { JsonLd } from "@/components/seo/json-ld";
import { createPageMetadata, SITE_URL } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Peptide Purity Percentages Explained",
  description:
    "Understand what peptide purity percentages actually mean. Learn how HPLC purity is measured, what the remaining percentage represents, and why small differences can matter in research.",
  path: "/guides/peptide-purity-percentages",
  type: "article",
});

const GUIDE_DATE = "2026-07-29";
const GUIDE_MODIFIED = "2026-08-02";

const articleLd = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "Peptide Purity Percentages — What Do They Actually Mean?",
  author: { "@type": "Organization", name: "PSL Labs" },
  publisher: { "@type": "Organization", name: "PSL Labs" },
  datePublished: GUIDE_DATE,
  dateModified: GUIDE_MODIFIED,
  url: `${SITE_URL}/guides/peptide-purity-percentages`,
};

export default function PeptidePurityPercentagesGuidePage() {
  return (
    <main className="section-surface-ice min-h-screen">
      {/* Validate Article markup: https://search.google.com/test/rich-results */}
      <JsonLd data={articleLd} />
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
              How to read an HPLC purity number on a research peptide COA—what
              it counts, what it leaves out, and why a few tenths of a percent
              can matter when you compare lots.
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
                On a peptide Certificate of Analysis (COA), purity is a share of
                what the lab’s method actually detected. If the report says 99.5%
                by HPLC, that means roughly 99.5% of the integrated detector
                signal sits under the main peptide peak. The other ~0.5% sits
                under other peaks the method picked up.
              </p>
              <p className="text-ash">
                So it’s a relative composition number for that run—not a claim
                about biology, and not a blank check for every vial with a
                similar label. It only describes the sample and batch named on
                that report.
              </p>
            </section>
          </AnimateIn>

          <AnimateIn delay={0.14}>
            <section className="flex flex-col gap-4">
              <h2 className="font-[family-name:var(--font-display)] text-xl font-bold text-ink md:text-2xl">
                How purity is measured
              </h2>
              <p className="text-ash">
                Most research peptide purity figures come from HPLC
                (high-performance liquid chromatography). You dissolve the
                sample, push it through a packed column, and different compounds
                move at different speeds. They hit the detector at different
                times.
              </p>
              <p className="text-ash">
                The chromatogram is that detector trace over time. Each peak is
                something that eluted. Analysts integrate the area under each
                peak. For a typical area-percent purity, you take the main peak
                area, divide by the total area of all integrated peaks, and
                convert to a percentage.
              </p>
              <p className="text-ash">
                Method details matter—wavelength, column, integration rules. That’s
                why a lone percentage stripped into a summary is weaker than the
                full report with the chromatogram attached.
              </p>
            </section>
          </AnimateIn>

          <AnimateIn delay={0.16}>
            <section className="flex flex-col gap-4">
              <h2 className="font-[family-name:var(--font-display)] text-xl font-bold text-ink md:text-2xl">
                What the remaining percentage could be
              </h2>
              <p className="text-ash">
                Whatever isn’t the main peak is the impurity load that HPLC saw.
                Depending on synthesis, cleanup, and storage, that can include
                residual solvents (if the method detects them), synthesis
                byproducts, truncated sequences, closely related peptides, or
                degradation products.
              </p>
              <p className="text-ash">
                Here’s the catch: some impurities won’t show up at the settings
                used. So “100% minus purity” means “other peaks on this
                chromatogram,” not a complete inventory of everything in the
                vial. Other tests on the same COA can help you interpret those
                peaks when they’re listed.
              </p>
            </section>
          </AnimateIn>

          <AnimateIn delay={0.18}>
            <section className="flex flex-col gap-4">
              <h2 className="font-[family-name:var(--font-display)] text-xl font-bold text-ink md:text-2xl">
                The difference between 99.0% and 99.8%
              </h2>
              <p className="text-ash">
                The gap looks tiny on a label. The impurity load doesn’t.
              </p>
              <p className="text-ash">
                At 99.0% purity you’ve got about 1.0% other integrated material.
                At 99.6% you’ve got about 0.4%. That’s roughly 2.5× more
                non-target peak area at 99.0% than at 99.6% (1.0 ÷ 0.4 = 2.5).
                Stack 99.0% against 99.8% and you’re comparing 1.0% vs 0.2%—a
                fivefold difference in that impurity-peak load under the same
                style of calculation.
              </p>
              <p className="text-ash">
                Those ratios don’t tell you whether the impurities matter for
                your assay. That depends on what they are and what you’re
                measuring. They do explain why people comparing lots still care
                about tenths of a percent.
              </p>
            </section>
          </AnimateIn>

          <AnimateIn delay={0.2}>
            <section className="flex flex-col gap-4">
              <h2 className="font-[family-name:var(--font-display)] text-xl font-bold text-ink md:text-2xl">
                Why purity is not the only metric
              </h2>
              <p className="text-ash">
                Identity matters just as much. A sample that’s 99.9% “pure” by
                HPLC is useless if the main peak isn’t the peptide you think it
                is. Labs usually back identity with mass spectrometry or another
                orthogonal test on the report—read those fields with the
                chromatogram.
              </p>
              <p className="text-ash">
                Quantity matters too. Purity says how the detected signal
                splits; it doesn’t say how many milligrams are in the vial.
                Content or assay results (when reported) answer that. A solid
                research COA ties identity, purity, and quantity to the same
                batch. Each answers a different question.
              </p>
            </section>
          </AnimateIn>

          <AnimateIn delay={0.22}>
            <section className="flex flex-col gap-4">
              <h2 className="font-[family-name:var(--font-display)] text-xl font-bold text-ink md:text-2xl">
                How to verify a purity claim
              </h2>
              <p className="text-ash">
                Don’t stop at a screenshot. If the testing lab offers a public
                check, match the task or report ID on the COA to the lab’s own
                record.
              </p>
              <p className="text-ash">
                One option is Janoshik’s tool at{" "}
                <a
                  href="https://janoshik.com/verify"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-petrol underline underline-offset-4 transition-opacity hover:opacity-80"
                >
                  janoshik.com/verify
                </a>
                . Enter the task number from a Janoshik report and you’ll pull
                the original lab record—so you can confirm the purity (and the
                rest of the fields) match what the lab actually issued.
              </p>
            </section>
          </AnimateIn>

          <AnimateIn delay={0.24}>
            <section className="flex flex-col gap-4">
              <h2 className="font-[family-name:var(--font-display)] text-xl font-bold text-ink md:text-2xl">
                Purity as one part of the quality picture
              </h2>
              <p className="text-ash">
                Treat purity as one measurement in a set: chromatogram, identity,
                quantity, batch ID, and how the material was stored. A high
                number is useful. It isn’t a substitute for a full, verifiable
                lab report on the lot you actually have. When those pieces line
                up—and you can check the lab record yourself—you’ve got a much
                stronger paper trail for that batch.
              </p>
            </section>
          </AnimateIn>
        </div>
      </article>
    </main>
  );
}
