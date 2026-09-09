import type { Metadata } from "next";

import { AnimateIn } from "@/components/product/animate-in";
import { JsonLd } from "@/components/seo/json-ld";
import { RelatedGuides } from "@/components/guides/related-guides";
import { BatchDocumentationCTA } from "@/components/guides/batch-documentation-cta";
import { LEGAL_ENTITY_NAME } from "@/lib/content/testing-scope";
import { createPageMetadata, SITE_URL } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Peptide Purity Percentages Explained",
  description:
    "What peptide purity percentages mean on a lab report, how a purity test works, and what the remaining percentage represents.",
  path: "/guides/peptide-purity-percentages",
  type: "article",
});

const GUIDE_DATE = "2026-07-29";
const GUIDE_MODIFIED = "2026-08-02";

const articleLd = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "Peptide Purity Percentages: What Do They Actually Mean?",
  author: { "@type": "Organization", name: LEGAL_ENTITY_NAME },
  publisher: { "@type": "Organization", name: LEGAL_ENTITY_NAME },
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
              Peptide Purity Percentages: What Do They Actually Mean?
            </h1>
          </AnimateIn>
          <AnimateIn delay={0.1}>
            <p className="mt-5 text-base leading-relaxed text-ash md:text-[1.0625rem]">
              A purity percentage on a lab report tells you how much of the
              detected material is the main peptide, compared with other peaks
              the test picked up. It applies only to that sample and batch.
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
                On a Certificate of Analysis (COA), purity is a share of what
                the lab&apos;s test actually detected. If the report says 99.5%
                by a laboratory purity test (HPLC), that means roughly 99.5% of
                the measured signal belongs to the main peptide peak. The rest
                belongs to other peaks the method picked up.
              </p>
              <p className="text-ash">
                It is a relative number for that run, not a claim about biology
                and not a guarantee for every vial with a similar label. It
                only describes the sample and batch named on that report.
              </p>
            </section>
          </AnimateIn>

          <AnimateIn delay={0.14}>
            <section className="flex flex-col gap-4">
              <h2 className="font-[family-name:var(--font-display)] text-xl font-bold text-ink md:text-2xl">
                How purity is measured
              </h2>
              <p className="text-ash">
                Most research peptide purity figures come from a laboratory
                purity test. The sample is dissolved and run through a column.
                Different compounds move at different speeds and are detected at
                different times.
              </p>
              <p className="text-ash">
                The chromatogram is the graph of that run over time. Each peak
                is something the test detected. For a typical area-percent
                purity, you take the main peak area, divide by the total area
                of all counted peaks, and convert to a percentage.
              </p>
              <p className="text-ash">
                Method details matter: wavelength, column, and how peaks are
                counted. That is why a lone percentage in a summary is weaker
                than the full report with the chromatogram attached.
              </p>
            </section>
          </AnimateIn>

          <AnimateIn delay={0.16}>
            <section className="flex flex-col gap-4">
              <h2 className="font-[family-name:var(--font-display)] text-xl font-bold text-ink md:text-2xl">
                What the remaining percentage could be
              </h2>
              <p className="text-ash">
                Whatever is not the main peak is other material the test saw.
                Depending on synthesis, cleanup, and storage, that can include
                residual solvents (if the method detects them), synthesis
                byproducts, shortened sequences, closely related peptides, or
                breakdown products.
              </p>
              <p className="text-ash">
                Some impurities will not show up at the settings used. So
                &ldquo;100% minus purity&rdquo; means &ldquo;other peaks on
                this graph,&rdquo; not a complete list of everything in the
                vial. Other tests on the same COA can help you interpret those
                peaks when they are listed.
              </p>
            </section>
          </AnimateIn>

          <AnimateIn delay={0.18}>
            <section className="flex flex-col gap-4">
              <h2 className="font-[family-name:var(--font-display)] text-xl font-bold text-ink md:text-2xl">
                The difference between 99.0% and 99.8%
              </h2>
              <p className="text-ash">
                The gap looks tiny on a label. At 99.0% purity, about 1.0% of
                the detected signal is other material. At 99.8%, about 0.2% is
                other material. That is a meaningful difference when you compare
                lots, even though both numbers look high.
              </p>
              <p className="text-ash">
                Those figures do not tell you whether the other material matters
                for your work. That depends on what it is and what you are
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
                Identity matters just as much. A sample that is 99.9%
                &ldquo;pure&rdquo; by a purity test is useless if the main peak
                is not the peptide you think it is. Labs usually back identity
                with identity testing on the report. Read those fields with the
                chromatogram.
              </p>
              <p className="text-ash">
                Quantity matters too. Purity says how the detected signal
                splits. It does not say how many milligrams are in the vial.
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
                Do not stop at a screenshot. If the testing lab offers a public
                check, match the task or report ID on the COA to the lab&apos;s
                own record.
              </p>
              <p className="text-ash">
                One option is Janoshik&apos;s tool at{" "}
                <a
                  href="https://janoshik.com/verify"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-petrol underline underline-offset-4 transition-opacity hover:opacity-80"
                >
                  janoshik.com/verify
                </a>
                . Enter the task number from a Janoshik report and you will pull
                the original lab record. You can confirm the purity and the rest
                of the fields match what the lab actually issued.
              </p>
            </section>
          </AnimateIn>

          <AnimateIn delay={0.24}>
            <section className="flex flex-col gap-4">
              <h2 className="font-[family-name:var(--font-display)] text-xl font-bold text-ink md:text-2xl">
                Purity as one part of the quality picture
              </h2>
              <p className="text-ash">
                Treat purity as one measurement in a set: chromatogram,
                identity, quantity, batch ID, and how the material was stored. A
                high number is useful. It is not a substitute for a full,
                verifiable lab report on the lot you actually have. When those
                pieces line up, and you can check the lab record yourself, you
                have a much stronger paper trail for that batch.
              </p>
            </section>
          </AnimateIn>

          <AnimateIn delay={0.26}>
            <BatchDocumentationCTA guideSlug="peptide-purity-percentages" />
          </AnimateIn>

          <AnimateIn delay={0.28}>
            <RelatedGuides currentSlug="peptide-purity-percentages" />
          </AnimateIn>
        </div>
      </article>
    </main>
  );
}
