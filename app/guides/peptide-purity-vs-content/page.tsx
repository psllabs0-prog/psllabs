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
  { id: "chromatographic-purity", label: "What chromatographic purity is" },
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
  { key: "metric", header: "Property / Metric" },
  { key: "units", header: "Units & Basis" },
  { key: "whatItMeasures", header: "What It Actually Measures" },
  { key: "whatItIgnores", header: "What It Completely Ignores" },
];

const purityVsContentRows = [
  {
    metric: "HPLC Purity",
    units: "Percentage (%) of total UV peak area",
    whatItMeasures: "Relative fraction of UV-absorbing material corresponding to the target retention peak at 214nm.",
    whatItIgnores: "Total vial mass, salts, TFA counterions, water of hydration, non-UV absorbing excipients (mannitol, sugars).",
  },
  {
    metric: "Net Peptide Content",
    units: "Milligrams (mg) or mass fraction (% w/w)",
    whatItMeasures: "Absolute physical mass of target peptide molecules present in the submitted vial container.",
    whatItIgnores: "Does not establish purity profile or resolution between diastereomers/deletion sequences.",
  },
  {
    metric: "Gross Powder Weight",
    units: "Milligrams (mg) total cake weight",
    whatItMeasures: "Total weight of lyophilized cake (peptide + TFA counterions + bound water + residual buffer salts).",
    whatItIgnores: "Does not tell you how much active peptide is in the cake; counterions typically account for 15% to 25% of gross mass.",
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
            &ldquo;99% purity&rdquo; is the headline number you see on listings, marketing pages, and Certificate of Analysis summaries. It is also one of the easiest metrics to misread.
          </p>
          <p className="text-ash leading-relaxed">
            In short: that percentage is usually an optical measurement from high-performance liquid chromatography (HPLC). It is not the same as &ldquo;99% of the powder by weight,&rdquo; and it does not by itself prove identity, fill weight, sterility, or endotoxin status.
          </p>
          <p className="text-ash leading-relaxed">
            This guide explains what HPLC area percentage really is, why the number depends on the method, and how to keep purity separate from peptide content when you prepare quantitative research solutions.
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
            Those are natural guesses, and they are wrong for analytical reporting. The percentage comes from a chromatography instrument under defined conditions.
          </p>
        </section>

        <section id="chromatographic-purity" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            What chromatographic purity is
          </h2>
          <p className="text-ash leading-relaxed">
            Reversed-phase HPLC separates dissolved molecules by hydrophobicity. The sample rides a pressurized water/acetonitrile gradient (with an acid modifier) across a column of alkyl-coated silica particles, usually C18.
          </p>
          <p className="text-ash leading-relaxed">
            Less hydrophobic impurities leave earlier; more hydrophobic ones leave later. As they exit, a UV detector records light absorption over time. That plot is the chromatogram: absorbance peaks versus elution time.
          </p>
        </section>

        <section id="area-percentage" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            What peak area percentage measures
          </h2>
          <p className="text-ash leading-relaxed">
            The purity figure on most COAs is relative peak area percentage:
          </p>
          <div className="rounded-xl border border-linen bg-surface p-5 text-sm space-y-2">
            <p className="font-mono text-xs font-semibold uppercase tracking-wider text-accent">
              Peak area integration
            </p>
            <p className="font-mono text-ink text-sm sm:text-base">
              Purity (%) = [ Area of Target Peak / Sum of All Integrated UV Peak Areas ] × 100
            </p>
          </div>
          <p className="text-ash leading-relaxed">
            Two details matter a lot:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-ash text-sm sm:text-base">
            <li>
              <strong>Different compounds absorb differently.</strong> Aromatic impurities (tryptophan, tyrosine, phenylalanine) absorb more strongly at 214 to 280 nm than purely aliphatic fragments. Relative peak area equals mass percentage only when extinction coefficients match, which is rare.
            </li>
            <li>
              <strong>UV-silent material is invisible.</strong> Water, inorganic salts, trifluoroacetate, acetate, mannitol, and sugars barely absorb at 214 nm or 220 nm. A sample can carry substantial salt by weight and still show a 99.8% HPLC area.
            </li>
          </ul>
        </section>

        <section id="method-dependence" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Why the method changes the number
          </h2>
          <p className="text-ash leading-relaxed">
            There is no single absolute &ldquo;purity&rdquo; for a sample. The reported percentage is tied to the method:
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 pt-1 text-sm">
            <div className="rounded-xl border border-linen bg-surface p-5 space-y-2">
              <span className="font-mono text-xs font-semibold text-accent uppercase">
                Method choices
              </span>
              <ul className="list-disc pl-4 space-y-1.5 text-ash text-xs sm:text-sm">
                <li><strong>Gradient steepness:</strong> A fast 10-minute gradient can merge related impurities into the main peak. A shallow 45-minute gradient often separates them.</li>
                <li><strong>Column chemistry:</strong> C4, C8, C18, and biphenyl phases interact differently with peptide structure.</li>
              </ul>
            </div>
            <div className="rounded-xl border border-linen bg-surface p-5 space-y-2">
              <span className="font-mono text-xs font-semibold text-accent uppercase">
                What that does to the number
              </span>
              <ul className="list-disc pl-4 space-y-1.5 text-ash text-xs sm:text-sm">
                <li><strong>Apparent purity shifts:</strong> The same physical sample might read 99.4% on a steep screening gradient and 97.2% on a high-resolution one.</li>
                <li><strong>Wavelength:</strong> Detection at 280 nm can miss non-aromatic impurities and inflate the figure versus 214 nm backbone detection.</li>
              </ul>
            </div>
          </div>
          <AnalyticalCallout title="Ask for method conditions" variant="method">
            Legitimate labs document column dimensions, flow rate, mobile phase, and gradient on the COA. A purity number without those conditions is hard to verify or reproduce.
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
            caption="Comparison between HPLC Purity, Net Peptide Content, and Gross Powder Weight"
          />
          <p className="text-ash leading-relaxed pt-3">
            Synthetic peptides are usually lyophilized as salts with counterions such as trifluoroacetic acid (TFA). The powders are also hygroscopic and often hold a few percent water.
          </p>
          <p className="text-ash leading-relaxed">
            In typical preparations, net peptide content is about <strong>70% to 85%</strong> of gross powder weight. The rest is counterions, water, and residual salts, even when HPLC purity is 99.8%. An assay (a quantitative mass measurement against standards) is what gives you milligrams, not the purity percentage.
          </p>
        </section>

        <section id="purity-not-identity" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Purity vs identity
          </h2>
          <p className="text-ash leading-relaxed">
            An HPLC UV detector only records absorbance. It does not name the molecule.
          </p>
          <p className="text-ash leading-relaxed">
            Inject the wrong compound and you can still get a single, clean 99.9% peak. That shows the sample is chromatographically homogeneous under those conditions. It does not prove the sequence is correct.
          </p>
          <p className="text-ash leading-relaxed">
            Identity needs mass spectrometry (LC-MS) or retention matching to an authentic reference standard. See{" "}
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
              <p className="text-ink font-semibold mt-1">Was identity confirmed by mass spectrometry?</p>
              <p className="text-xs text-ash mt-0.5">HPLC area % alone does not prove the target sequence.</p>
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
                <p className="font-mono text-xs text-stone uppercase">Chromatographic Purity (HPLC)</p>
                <p className="font-bold text-2xl text-ink font-mono">{ghkCu50mgReport.purityPercent}%</p>
                <p className="text-xs text-ash">Relative UV peak area. Related side-products make up less than 0.265% of the chromatographic profile.</p>
              </div>
              <div className="space-y-1">
                <p className="font-mono text-xs text-stone uppercase">Quantitative Content Assay</p>
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
            <AnalyticalCallout title="Chemistry is not biological suitability" variant="limitation">
              High chromatographic purity describes chemical composition under the method used. It does not mean the sample is sterile, pyrogen-free, or suitable for clinical use. Materials are for laboratory research and analytical calibration.
            </AnalyticalCallout>
            <AnalyticalCallout title="Marketing phrases are not methods" variant="limitation">
              Labels like &ldquo;pharmaceutical grade&rdquo; or &ldquo;100% verified pure&rdquo; are not rigorous analytical claims. Chemistry works within detection and quantification limits.
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
