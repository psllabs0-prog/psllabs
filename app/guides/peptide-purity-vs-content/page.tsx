import type { Metadata } from "next";
import Link from "next/link";

import { JsonLd } from "@/components/seo/json-ld";
import { GuideLayout } from "@/components/guides/guide-layout";
import { AnalyticalCallout } from "@/components/guides/analytical-callout";
import { ComparisonTable } from "@/components/guides/comparison-table";
import { getGuideBySlug } from "@/lib/content/guides-data";
import { ghkCu50mgReport } from "@/lib/batch-reports";
import { LEGAL_ENTITY_NAME } from "@/lib/content/testing-scope";
import { createPageMetadata, SITE_URL } from "@/lib/seo";

const guide = getGuideBySlug("peptide-purity-vs-content")!;

export const metadata: Metadata = createPageMetadata({
  title: guide.title,
  description: guide.description,
  path: `/guides/${guide.slug}`,
  type: "article",
});

const articleLd = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: guide.title,
  description: guide.description,
  author: { "@type": "Organization", name: LEGAL_ENTITY_NAME },
  publisher: { "@type": "Organization", name: LEGAL_ENTITY_NAME },
  datePublished: guide.publishedDate,
  dateModified: guide.modifiedDate,
  url: `${SITE_URL}/guides/${guide.slug}`,
  mainEntityOfPage: `${SITE_URL}/guides/${guide.slug}`,
};

const breadcrumbLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
    { "@type": "ListItem", position: 2, name: "Guides", item: `${SITE_URL}/guides` },
    {
      "@type": "ListItem",
      position: 3,
      name: guide.shortTitle,
      item: `${SITE_URL}/guides/${guide.slug}`,
    },
  ],
};

const tocItems = [
  { id: "what-people-mean", label: "What people usually hear in '99%'" },
  { id: "chromatographic-purity", label: "What a purity test measures" },
  { id: "area-percentage", label: "What peak area percentage measures" },
  { id: "method-dependence", label: "Why the method changes the number" },
  { id: "purity-not-content", label: "Purity vs net peptide content" },
  { id: "purity-not-identity", label: "Purity vs identity" },
  { id: "chromatogram-context", label: "Why the chromatogram matters" },
  { id: "questions-to-ask", label: "Five questions to ask about '99%+'" },
  { id: "empirical-example", label: "Example: GHK-Cu 50mg" },
  { id: "analytical-limitations", label: "Boundaries worth remembering" },
];

const purityVsContentColumns = [
  { key: "metric", header: "Metric" },
  { key: "units", header: "Units" },
  { key: "whatItMeasures", header: "What it measures" },
  { key: "whatItIgnores", header: "What it ignores" },
];

const purityVsContentRows = [
  {
    metric: "Purity",
    units: "Percentage (%)",
    whatItMeasures: "How much of the detected material is the main peptide.",
    whatItIgnores: "Total vial mass, salts, counterions, water, and fillers that do not show on the test.",
  },
  {
    metric: "Net peptide content",
    units: "Milligrams (mg)",
    whatItMeasures: "How many milligrams of target peptide are in the vial.",
    whatItIgnores: "Purity profile or differences between similar variants.",
  },
  {
    metric: "Gross powder weight",
    units: "Milligrams (mg)",
    whatItMeasures: "Total weight of the freeze-dried powder including salts and moisture.",
    whatItIgnores: "How much active peptide is in the powder; counterions often make up 15% to 25% of gross mass.",
  },
];

export default function PeptidePurityVsContentPage() {
  return (
    <>
      <JsonLd data={articleLd} />
      <JsonLd data={breadcrumbLd} />

      <GuideLayout guide={guide} tocItems={tocItems}>
        <section className="flex flex-col gap-4">
          <p className="text-ash leading-relaxed">
            &ldquo;99% purity&rdquo; on a lab report means about 99% of the detected material is the main peptide. It does not mean 99% of the powder by weight, and it does not prove identity, fill weight, sterility, or endotoxin status.
          </p>
          <p className="text-ash leading-relaxed">
            That percentage usually comes from a laboratory purity test (HPLC). The number depends on the test method used.
          </p>
          <p className="text-ash leading-relaxed">
            This guide explains what the number really measures and how to keep purity separate from how much peptide is in the vial.
          </p>
        </section>

        <section id="what-people-mean" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            What people usually hear in &ldquo;99%&rdquo;
          </h2>
          <p className="text-ash leading-relaxed">
            Non-specialists often assume something like this:
          </p>
          <div className="rounded-xl border border-linen bg-surface p-5 text-sm space-y-2 text-ash">
            <p className="text-ink font-medium">Common (incorrect) assumptions:</p>
            <ul className="list-disc pl-5 space-y-1 text-xs sm:text-sm">
              <li><em>Assumption 1:</em> &ldquo;99% of the powder in the vial is active peptide.&rdquo;</li>
              <li><em>Assumption 2:</em> &ldquo;If I dissolve this 10 mg vial in 10 mL of buffer, I will have a 1.0 mg/mL peptide concentration.&rdquo;</li>
              <li><em>Assumption 3:</em> &ldquo;99% purity implies pharmaceutical or clinical grade quality.&rdquo;</li>
              <li><em>Assumption 4:</em> &ldquo;The material is safe and free of contaminants.&rdquo;</li>
            </ul>
          </div>
          <p className="text-ash leading-relaxed">
            Those are natural guesses, but they are wrong. The percentage comes from a lab test under specific conditions.
          </p>
        </section>

        <section id="chromatographic-purity" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            What a purity test measures
          </h2>
          <p className="text-ash leading-relaxed">
            A laboratory purity test separates dissolved molecules in a column. Different compounds leave at different times.
          </p>
          <p className="text-ash leading-relaxed">
            A light detector records what passes through over time. That graph is the chromatogram: peaks plotted against run time.
          </p>
        </section>

        <section id="area-percentage" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            How the percentage is calculated
          </h2>
          <p className="text-ash leading-relaxed">
            The purity figure on most COAs is a ratio of peak areas:
          </p>
          <div className="rounded-xl border border-linen bg-surface p-5 text-sm space-y-2">
            <p className="font-mono text-xs font-semibold uppercase tracking-wider text-accent">
              Peak area calculation
            </p>
            <p className="font-mono text-ink text-sm sm:text-base">
              Purity (%) = [ Area of Target Peak / Sum of All Peak Areas ] × 100
            </p>
          </div>
          <p className="text-ash leading-relaxed">
            Two details matter:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-ash text-sm sm:text-base">
            <li>
              <strong>Different compounds absorb light differently.</strong> Peak area does not always equal mass percentage.
            </li>
            <li>
              <strong>Some material is invisible to the test.</strong> Water, salts, and fillers may not show on the graph. A sample can carry substantial salt by weight and still show 99.8% purity.
            </li>
          </ul>
        </section>

        <section id="method-dependence" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Why the method changes the number
          </h2>
          <p className="text-ash leading-relaxed">
            There is no single absolute purity for a sample. The reported percentage depends on the test method:
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 pt-1 text-sm">
            <div className="rounded-xl border border-linen bg-surface p-5 space-y-2">
              <span className="font-mono text-xs font-semibold text-accent uppercase">
                Method choices
              </span>
              <ul className="list-disc pl-4 space-y-1.5 text-ash text-xs sm:text-sm">
                <li><strong>Run speed:</strong> A fast run can merge related impurities into the main peak. A slower run often separates them.</li>
                <li><strong>Column type:</strong> Different columns interact differently with peptide structure.</li>
              </ul>
            </div>
            <div className="rounded-xl border border-linen bg-surface p-5 space-y-2">
              <span className="font-mono text-xs font-semibold text-accent uppercase">
                What that does to the number
              </span>
              <ul className="list-disc pl-4 space-y-1.5 text-ash text-xs sm:text-sm">
                <li><strong>Number shifts:</strong> The same sample might read 99.4% on one method and 97.2% on another.</li>
                <li><strong>Detection wavelength:</strong> Different wavelengths can miss some impurities and change the result.</li>
              </ul>
            </div>
          </div>
          <AnalyticalCallout title="Ask for method conditions" variant="method">
            Good labs document column type, flow rate, solvents, and run conditions on the COA. A purity number without those details is hard to verify.
          </AnalyticalCallout>
        </section>

        <section id="purity-not-content" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Purity vs net peptide content
          </h2>
          <p className="text-ash leading-relaxed">
            This is the distinction that matters most for quantitative work:
          </p>
          <ComparisonTable
            columns={purityVsContentColumns}
            rows={purityVsContentRows}
            caption="Comparison between purity, net peptide content, and gross powder weight"
          />
          <p className="text-ash leading-relaxed pt-3">
            Synthetic peptides are usually freeze dried as salts with counterions. The powders also hold a few percent water.
          </p>
          <p className="text-ash leading-relaxed">
            In typical preparations, net peptide content is about <strong>70% to 85%</strong> of gross powder weight. The rest is counterions, water, and residual salts, even when purity is 99.8%. An assay (a quantitative mass test against a reference standard) gives you milligrams, not the purity percentage.
          </p>
        </section>

        <section id="purity-not-identity" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Purity vs identity
          </h2>
          <p className="text-ash leading-relaxed">
            A purity test records light absorption. It does not name the molecule.
          </p>
          <p className="text-ash leading-relaxed">
            The wrong compound can still give a single, clean 99.9% peak. That shows the sample looks uniform on the test. It does not prove the sequence is correct.
          </p>
          <p className="text-ash leading-relaxed">
            Identity needs identity testing or retention matching to a reference standard. See{" "}
            <Link
              href="/guides/peptide-identity-vs-purity-vs-content"
              className="font-medium text-accent underline underline-offset-4 hover:opacity-80"
            >
              Peptide Identity vs Purity vs Content
            </Link>.
          </p>
        </section>

        <section id="chromatogram-context" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Why the chromatogram matters
          </h2>
          <p className="text-ash leading-relaxed">
            A trustworthy COA gives the chromatogram plot with integration marks, not only a summary table. When you look at it, check:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-ash text-sm sm:text-base">
            <li><strong>Baseline:</strong> Flat and stable, or drifting?</li>
            <li><strong>Peak shape:</strong> Symmetrical, or showing fronting, tailing, or shoulders?</li>
            <li><strong>Integration:</strong> Were small impurity peaks included, or cut off by a high area threshold?</li>
            <li><strong>Full run:</strong> Does the plot cover the whole gradient, including late wash, so late-eluting material is not hidden?</li>
          </ul>
        </section>

        <section id="questions-to-ask" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Five questions to ask about &ldquo;99%+&rdquo;
          </h2>
          <div className="space-y-3 pt-1">
            <div className="rounded-xl border border-linen bg-surface p-4 text-sm">
              <span className="font-mono text-xs font-bold text-accent">QUESTION 1</span>
              <p className="text-ink font-semibold mt-1">What detection wavelength was used?</p>
              <p className="text-xs text-ash mt-0.5">214 nm reads the peptide backbone broadly. 280 nm can miss non-aromatic impurities.</p>
            </div>
            <div className="rounded-xl border border-linen bg-surface p-4 text-sm">
              <span className="font-mono text-xs font-bold text-accent">QUESTION 2</span>
              <p className="text-ink font-semibold mt-1">Was identity confirmed by a separate test?</p>
              <p className="text-xs text-ash mt-0.5">A purity percentage alone does not prove the target sequence.</p>
            </div>
            <div className="rounded-xl border border-linen bg-surface p-4 text-sm">
              <span className="font-mono text-xs font-bold text-accent">QUESTION 3</span>
              <p className="text-ink font-semibold mt-1">Was net peptide mass assayed?</p>
              <p className="text-xs text-ash mt-0.5">Did the lab measure absolute milligrams, or rely on a nominal fill assumption?</p>
            </div>
            <div className="rounded-xl border border-linen bg-surface p-4 text-sm">
              <span className="font-mono text-xs font-bold text-accent">QUESTION 4</span>
              <p className="text-ink font-semibold mt-1">Can you verify the report on the lab&apos;s server?</p>
              <p className="text-xs text-ash mt-0.5">Look for a task number and key on verify.janoshik.com.</p>
            </div>
            <div className="rounded-xl border border-linen bg-surface p-4 text-sm">
              <span className="font-mono text-xs font-bold text-accent">QUESTION 5</span>
              <p className="text-ink font-semibold mt-1">What else was not tested?</p>
              <p className="text-xs text-ash mt-0.5">If your experiment needs endotoxin, sterility, or TFA data, those require separate assays.</p>
            </div>
          </div>
        </section>

        <section id="empirical-example" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Example: GHK-Cu 50mg
          </h2>
          <p className="text-ash leading-relaxed">
            On the published Janoshik report for PSL Labs GHK-Cu (Task #{ghkCu50mgReport.taskNumber}, Batch {ghkCu50mgReport.batch}), purity and content are reported as separate results:
          </p>
          <div className="rounded-xl border border-linen bg-surface p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-linen pb-3">
              <span className="font-mono text-xs font-semibold text-accent">
                JANOSHIK REPORT ANALYSIS · GHK-CU 50MG
              </span>
              <span className="font-mono text-xs text-stone">
                Task #{ghkCu50mgReport.taskNumber}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 text-sm">
              <div className="space-y-1">
                <p className="font-mono text-xs text-stone uppercase">Purity</p>
                <p className="font-bold text-2xl text-ink font-mono">{ghkCu50mgReport.purityPercent}%</p>
                <p className="text-xs text-ash">Related side products make up less than 0.265% of the test profile.</p>
              </div>
              <div className="space-y-1">
                <p className="font-mono text-xs text-stone uppercase">Content assay</p>
                <p className="font-bold text-2xl text-ink font-mono">{ghkCu50mgReport.reportedAmountMg} mg</p>
                <p className="text-xs text-ash">Absolute mass: 53.21 mg total complex (GHK content: 44.89 mg, copper: 8.32 mg) versus the nominal 50 mg label.</p>
              </div>
            </div>
            <p className="text-xs text-stone pt-2 border-t border-linen leading-relaxed">
              Both values are documented. For a precise research stock solution, use the assayed milligrams rather than assuming the nominal label mass.
            </p>
          </div>
        </section>

        <section id="analytical-limitations" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Boundaries worth remembering
          </h2>
          <div className="space-y-3">
            <AnalyticalCallout title="Lab data is not medical advice" variant="limitation">
              High purity describes chemical composition under the test used. It does not mean the sample is sterile or suitable for clinical use. Materials are for laboratory research only.
            </AnalyticalCallout>
            <AnalyticalCallout title="Marketing phrases are not test results" variant="limitation">
              Labels like &ldquo;pharmaceutical grade&rdquo; or &ldquo;100% verified pure&rdquo; are not lab measurements. Every test has detection limits.
            </AnalyticalCallout>
          </div>
          <p className="text-ash leading-relaxed pt-2">
            To verify original reports, continue with{" "}
            <Link
              href="/guides/verify-peptide-laboratory-report"
              className="font-medium text-accent underline underline-offset-4 hover:opacity-80"
            >
              How to Verify a Peptide Laboratory Report
            </Link>{" "}
            or{" "}
            <Link
              href="/coa"
              className="font-medium text-accent underline underline-offset-4 hover:opacity-80"
            >
              View Batch Reports
            </Link>.
          </p>
        </section>
      </GuideLayout>
    </>
  );
}
