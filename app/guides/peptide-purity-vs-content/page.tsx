import type { Metadata } from "next";
import Link from "next/link";

import { JsonLd } from "@/components/seo/json-ld";
import { GuideLayout } from "@/components/guides/guide-layout";
import { AnalyticalCallout } from "@/components/guides/analytical-callout";
import { ComparisonTable } from "@/components/guides/comparison-table";
import { getGuideBySlug } from "@/lib/content/guides-data";
import { ghkCu50mgReport, retatrutideBlackTopReport } from "@/lib/batch-reports";
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
  { id: "what-people-mean", label: "What People Usually Mean by '99% Purity'" },
  { id: "chromatographic-purity", label: "Basic Explanation of Chromatographic Purity" },
  { id: "area-percentage", label: "What Peak Area Percentage Actually Measures" },
  { id: "method-dependence", label: "Why Purity Percentages Are Method-Dependent" },
  { id: "purity-not-content", label: "Purity Is Not Automatically Content (Net Mass)" },
  { id: "purity-not-identity", label: "Purity Is Not Automatically Identity" },
  { id: "chromatogram-context", label: "Why Chromatograms and Baseline Resolution Matter" },
  { id: "questions-to-ask", label: "Five Questions Researchers Should Ask When Seeing '99%+'" },
  { id: "empirical-example", label: "Empirical Case Study: GHK-Cu 50mg & Retatrutide" },
  { id: "analytical-limitations", label: "Analytical Boundaries & Misconceptions" },
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
    whatItIgnores: "Does not tell you how much active peptide is in the cake; counterions typically account for 15%–25% of gross mass.",
  },
];

export default function PeptidePurityVsContentPage() {
  return (
    <>
      <JsonLd data={articleLd} />
      <JsonLd data={breadcrumbLd} />

      <GuideLayout guide={guide} tocItems={tocItems}>
        {/* Intro */}
        <section className="flex flex-col gap-4">
          <p className="text-ash leading-relaxed">
            In research biochemical specifications, &ldquo;99% purity&rdquo; is the most ubiquitous headline figure. It is presented in catalog listings, marketing headlines, and Certificate of Analysis summaries. Yet across analytical chemistry literature, purity is one of the most routinely misunderstood metrics.
          </p>
          <p className="text-ash leading-relaxed">
            A reported 99% purity does not mean a product is 99% pure peptide by weight. It does not establish that a 10 mg vial contains 9.9 mg of peptide. It does not prove that the material is sterile, free of bacterial pyrogens, or correctly identified.
          </p>
          <p className="text-ash leading-relaxed">
            This guide breaks down exactly what High-Performance Liquid Chromatography (HPLC) area percentage represents, why chromatographic results are strictly method-dependent, and why researchers must decouple chromatographic purity from <strong>peptide content</strong> when preparing quantitative laboratory solutions.
          </p>
        </section>

        {/* Section 1 */}
        <section id="what-people-mean" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            What People Usually Mean by &ldquo;99% Purity&rdquo;
          </h2>
          <p className="text-ash leading-relaxed">
            When a non-specialist or casual researcher sees &ldquo;99% purity,&rdquo; they typically assume:
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
            Every one of those four assumptions is scientifically false. In analytical reporting, 99% purity denotes a specific optical measurement on a chromatography instrument, subject to strict physicochemical definitions.
          </p>
        </section>

        {/* Section 2 */}
        <section id="chromatographic-purity" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Basic Explanation of Chromatographic Purity
          </h2>
          <p className="text-ash leading-relaxed">
            Reversed-Phase High-Performance Liquid Chromatography (RP-HPLC) separates dissolved molecules based on their hydrophobicity. The sample is injected into a pressurized mobile phase (a gradient of water and acetonitrile with an acid modifier) and pumped across a column packed with microscopic porous silica particles coated with alkyl chains (typically C18).
          </p>
          <p className="text-ash leading-relaxed">
            Molecules partition between the mobile and stationary phases. Less hydrophobic impurities elute early; more hydrophobic impurities elute late. As molecules leave the column, they pass through a flow cell where an ultraviolet (UV) detector measures light absorption over time. The output is a <strong>chromatogram</strong> showing absorbance peaks plotted against elution time.
          </p>
        </section>

        {/* Section 3 */}
        <section id="area-percentage" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            What Peak Area Percentage Actually Measures
          </h2>
          <p className="text-ash leading-relaxed">
            The &ldquo;purity percentage&rdquo; reported on a Certificate of Analysis is almost universally the <strong>relative peak area percentage</strong>:
          </p>
          <div className="rounded-xl border border-linen bg-surface p-5 text-sm space-y-2">
            <p className="font-mono text-xs font-semibold uppercase tracking-wider text-accent">
              Peak Area Integration Formula
            </p>
            <p className="font-mono text-ink text-sm sm:text-base">
              Purity (%) = [ Area of Target Peak / Sum of All Integrated UV Peak Areas ] × 100
            </p>
          </div>
          <p className="text-ash leading-relaxed">
            Critical analytical nuances in this calculation:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-ash text-sm sm:text-base">
            <li>
              <strong>Absorption Coefficients Differ:</strong> Different chemical species absorb UV light at different efficiencies (their molar extinction coefficient, ε). An impurity containing aromatic rings (tryptophan, tyrosine, phenylalanine) absorbs far more strongly at 214–280 nm than an impurity composed only of aliphatic residues (glycine, alanine, leucine). Relative peak area equals mass percentage <em>only</em> if all components possess identical extinction coefficients, which is rarely true.
            </li>
            <li>
              <strong>UV-Silent Materials Are Invisible:</strong> HPLC UV detectors only register molecules that absorb light at the chosen wavelength. Water, inorganic salts, trifluoroacetate, acetate, mannitol, and sugars do not absorb meaningfully at 214 nm or 220 nm. A sample could contain 30% inorganic salts by weight and still yield a 99.8% HPLC peak area!
            </li>
          </ul>
        </section>

        {/* Section 4 */}
        <section id="method-dependence" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Why Purity Percentages Are Method-Dependent
          </h2>
          <p className="text-ash leading-relaxed">
            A sample does not possess one absolute &ldquo;purity.&rdquo; Chromatographic purity is an operational measurement determined entirely by the method parameters employed:
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 pt-1 text-sm">
            <div className="rounded-xl border border-linen bg-surface p-5 space-y-2">
              <span className="font-mono text-xs font-semibold text-accent uppercase">
                Method Parameter
              </span>
              <ul className="list-disc pl-4 space-y-1.5 text-ash text-xs sm:text-sm">
                <li><strong>Gradient Steepness:</strong> A rapid 10-minute gradient compresses peaks, causing closely related synthesis impurities to co-elute with the main peak. A shallow 45-minute gradient separates them.</li>
                <li><strong>Column Chemistry:</strong> C4 vs C8 vs C18 vs biphenyl stationary phases interact differently with peptide secondary structures.</li>
              </ul>
            </div>
            <div className="rounded-xl border border-linen bg-surface p-5 space-y-2">
              <span className="font-mono text-xs font-semibold text-accent uppercase">
                Analytical Impact
              </span>
              <ul className="list-disc pl-4 space-y-1.5 text-ash text-xs sm:text-sm">
                <li><strong>Apparent Purity Shifts:</strong> The exact same physical sample might measure 99.4% on a steep screening gradient and 97.2% on an optimized, high-resolution gradient.</li>
                <li><strong>Wavelength Selection:</strong> Detection at 280 nm ignores non-aromatic impurities entirely, artificially inflating apparent purity compared to 214 nm backbone detection.</li>
              </ul>
            </div>
          </div>
          <AnalyticalCallout title="Method Reporting Transparency" variant="method">
            Legitimate analytical laboratories always document the column dimensions, flow rate, mobile phase composition, and gradient profile on the COA. If a report displays a purity number without specifying the method conditions, the percentage cannot be verified or reproduced.
          </AnalyticalCallout>
        </section>

        {/* Section 5 */}
        <section id="purity-not-content" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Purity Is Not Automatically Content (Net Mass)
          </h2>
          <p className="text-ash leading-relaxed">
            This is the single most critical distinction in quantitative peptide research:
          </p>
          <ComparisonTable
            columns={purityVsContentColumns}
            rows={purityVsContentRows}
            caption="Comparison between HPLC Purity, Net Peptide Content, and Gross Powder Weight"
          />
          <p className="text-ash leading-relaxed pt-3">
            Synthetic peptides are cationic bases that require counterions (usually trifluoroacetic acid, TFA) to stabilize during purification and lyophilization. Furthermore, lyophilized powders are hygroscopic, naturally binding 3% to 8% ambient water.
          </p>
          <p className="text-ash leading-relaxed">
            In typical lyophilized peptide preparations, the <strong>net peptide content</strong> ranges from <strong>70% to 85%</strong> of the gross powder weight. The remaining 15% to 30% consists of counterions, water of hydration, and residual processing salts, even when the HPLC purity is 99.8%.
          </p>
        </section>

        {/* Section 6 */}
        <section id="purity-not-identity" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Purity Is Not Automatically Identity
          </h2>
          <p className="text-ash leading-relaxed">
            An HPLC UV detector has no capacity to identify the chemical structure of an eluting molecule. It records only optical absorbance.
          </p>
          <p className="text-ash leading-relaxed">
            If an entirely wrong compound (e.g., Semaglutide instead of Retatrutide, or an incorrect scrambled isomer) is injected into an HPLC column, it may elute as a single, symmetrical, beautiful 99.9% peak. The chromatography confirms that the sample is homogeneous and free of co-eluting UV impurities; it does not confirm what the molecule is.
          </p>
          <p className="text-ash leading-relaxed">
            To establish identity, the chromatographic run must be coupled with <strong>Mass Spectrometry (LC-MS)</strong> or retention time matching against an authentic reference standard. For details, see our guide on{" "}
            <Link
              href="/guides/peptide-identity-vs-purity-vs-content"
              className="font-medium text-accent underline underline-offset-4 hover:opacity-80"
            >
              Peptide Identity vs Purity vs Content
            </Link>.
          </p>
        </section>

        {/* Section 7 */}
        <section id="chromatogram-context" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Why Chromatograms and Baseline Resolution Matter
          </h2>
          <p className="text-ash leading-relaxed">
            A trustworthy COA never provides just a numerical table, it provides the full <strong>chromatogram plot</strong> with baseline integration marks.
          </p>
          <p className="text-ash leading-relaxed">
            When inspecting a chromatogram, researchers should evaluate:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-ash text-sm sm:text-base">
            <li><strong>Baseline Stability:</strong> Does the baseline remain flat and stable throughout the run, or does it drift erratically?</li>
            <li><strong>Peak Symmetry:</strong> Is the main peak symmetrical, or does it display fronting or tailing shoulders indicating co-eluting failure sequences?</li>
            <li><strong>Integration Limits:</strong> Did the analyst integrate all detectable peaks, or were small impurity peaks artificially omitted by setting a high area threshold cutoff?</li>
            <li><strong>Full Run Time:</strong> Does the plot display the entire gradient sequence (including column wash and re-equilibration) to prove no late-eluting aggregates were excluded?</li>
          </ul>
        </section>

        {/* Section 8 */}
        <section id="questions-to-ask" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Five Questions Researchers Should Ask When Seeing &ldquo;99%+&rdquo;
          </h2>
          <div className="space-y-3 pt-1">
            <div className="rounded-xl border border-linen bg-surface p-4 text-sm">
              <span className="font-mono text-xs font-bold text-accent">QUESTION 1</span>
              <p className="text-ink font-semibold mt-1">What wavelength was used for detection?</p>
              <p className="text-xs text-ash mt-0.5">214 nm measures the peptide backbone and detects all peptide impurities. 280 nm ignores non-aromatic impurities, artificially inflating the apparent number.</p>
            </div>
            <div className="rounded-xl border border-linen bg-surface p-4 text-sm">
              <span className="font-mono text-xs font-bold text-accent">QUESTION 2</span>
              <p className="text-ink font-semibold mt-1">Is identity independently confirmed via Mass Spectrometry?</p>
              <p className="text-xs text-ash mt-0.5">HPLC area % alone does not prove the molecule is the target sequence.</p>
            </div>
            <div className="rounded-xl border border-linen bg-surface p-4 text-sm">
              <span className="font-mono text-xs font-bold text-accent">QUESTION 3</span>
              <p className="text-ink font-semibold mt-1">Was quantitative net peptide mass determined?</p>
              <p className="text-xs text-ash mt-0.5">Did the lab perform an assay to verify absolute milligrams in the vial, or are they relying solely on a nominal fill assumption?</p>
            </div>
            <div className="rounded-xl border border-linen bg-surface p-4 text-sm">
              <span className="font-mono text-xs font-bold text-accent">QUESTION 4</span>
              <p className="text-ink font-semibold mt-1">Can the report be verified directly on the laboratory&apos;s server?</p>
              <p className="text-xs text-ash mt-0.5">Is there a task number and verification key on verify.janoshik.com to confirm the document has not been altered?</p>
            </div>
            <div className="rounded-xl border border-linen bg-surface p-4 text-sm">
              <span className="font-mono text-xs font-bold text-accent">QUESTION 5</span>
              <p className="text-ink font-semibold mt-1">What other attributes were NOT tested?</p>
              <p className="text-xs text-ash mt-0.5">Does the researcher require endotoxin, sterility, or TFA quantification for their experimental cell lines?</p>
            </div>
          </div>
        </section>

        {/* Section 9 */}
        <section id="empirical-example" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Empirical Case Study: GHK-Cu 50mg &amp; Retatrutide
          </h2>
          <p className="text-ash leading-relaxed">
            Consider the published Janoshik laboratory report for PSL Labs GHK-Cu (Task #{ghkCu50mgReport.taskNumber}, Batch {ghkCu50mgReport.batch}):
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
                <p className="text-xs text-ash">Evaluates relative UV peak area. Confirms that synthesis side-products and deletion tripeptides constitute less than 0.265% of the chromatographic profile.</p>
              </div>
              <div className="space-y-1">
                <p className="font-mono text-xs text-stone uppercase">Quantitative Content Assay</p>
                <p className="font-bold text-2xl text-ink font-mono">{ghkCu50mgReport.reportedAmountMg} mg</p>
                <p className="text-xs text-ash">Absolute mass determination confirms 53.21 mg total complex (GHK content: 44.89 mg, copper: 8.32 mg) against the nominal 50 mg specification.</p>
              </div>
            </div>
            <p className="text-xs text-stone pt-2 border-t border-linen leading-relaxed">
              In this empirical report, both purity and quantitative mass are documented. A researcher preparing a 1.0 mM stock solution can use the exact 53.21 mg quantitative figure rather than assuming an arbitrary nominal mass.
            </p>
          </div>
        </section>

        {/* Section 10 */}
        <section id="analytical-limitations" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Analytical Boundaries &amp; Misconceptions
          </h2>
          <div className="space-y-3">
            <AnalyticalCallout title="Purity Does Not Imply Biological Suitability" variant="limitation">
              A sample displaying 99.8% chromatographic purity is not guaranteed to be sterile, pyrogen-free, or biologically safe. Analytical testing evaluates chemical composition, not clinical suitability. All materials are supplied strictly for laboratory research and analytical calibration.
            </AnalyticalCallout>
            <AnalyticalCallout title="Universal Claims Are Unscientific" variant="limitation">
              Phrases such as &ldquo;pharmaceutical grade,&rdquo; &ldquo;100% verified pure,&rdquo; or &ldquo;guaranteed zero impurities&rdquo; have no rigorous definition in research peptide supply. Analytical chemistry operates within defined detection limits (LOD) and quantification limits (LOQ).
            </AnalyticalCallout>
          </div>
          <p className="text-ash leading-relaxed pt-2">
            To learn how to verify original laboratory reports directly on Janoshik&apos;s server, continue to our guide on{" "}
            <Link
              href="/guides/verify-peptide-laboratory-report"
              className="font-medium text-accent underline underline-offset-4 hover:opacity-80"
            >
              How to Verify a Peptide Laboratory Report
            </Link>{" "}
            or inspect our full catalog in{" "}
            <Link
              href="/coa"
              className="font-medium text-accent underline underline-offset-4 hover:opacity-80"
            >
              COA / Batch Lookup
            </Link>.
          </p>
        </section>
      </GuideLayout>
    </>
  );
}
