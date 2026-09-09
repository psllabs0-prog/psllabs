import type { Metadata } from "next";
import Link from "next/link";

import { JsonLd } from "@/components/seo/json-ld";
import { GuideLayout } from "@/components/guides/guide-layout";
import { ComparisonTable } from "@/components/guides/comparison-table";
import { AnalyticalCallout } from "@/components/guides/analytical-callout";
import { getGuideBySlug } from "@/lib/content/guides-data";
import { retatrutideBlackTopReport } from "@/lib/batch-reports";
import { LEGAL_ENTITY_NAME } from "@/lib/content/testing-scope";
import { createPageMetadata, SITE_URL } from "@/lib/seo";

const guide = getGuideBySlug("peptide-identity-vs-purity-vs-content")!;

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
  { id: "three-questions", label: "Three questions, not one number" },
  { id: "identity", label: "What does identity tell you?" },
  { id: "purity", label: "What does purity tell you?" },
  { id: "content", label: "What does content tell you?" },
  { id: "comparison-matrix", label: "Side-by-side comparison" },
  { id: "how-they-relate", label: "How the three results relate" },
  { id: "report-example", label: "Reading a real report" },
  { id: "untested-attributes", label: "What needs separate tests" },
  { id: "analytical-limitations", label: "Practical limits" },
];

const comparisonColumns = [
  { key: "attribute", header: "Analytical Attribute" },
  { key: "question", header: "Question It Answers" },
  { key: "method", header: "Common Method Category" },
  { key: "notEstablished", header: "What It Does NOT Establish" },
];

const comparisonRows = [
  {
    attribute: "Chemical Identity",
    question: "Is this specific target molecular sequence/structure present in the sample?",
    method: "Mass Spectrometry (LC-MS / MALDI-TOF) & retention time matching",
    notEstablished: "Does not establish purity percentage, net vial mass, sterility, or absence of truncation fragments.",
  },
  {
    attribute: "Chromatographic Purity",
    question: "What fraction of UV-absorbing material corresponds to the main chromatographic peak?",
    method: "Reversed-Phase HPLC (RP-HPLC) with UV/Vis detection (typically 214nm / 220nm)",
    notEstablished: "Does not prove molecular identity by itself, does not quantify net vial milligrams, and does not detect UV-transparent excipients.",
  },
  {
    attribute: "Content / Assay (Net Mass)",
    question: "How many absolute milligrams of active peptide are present in the submitted vial?",
    method: "Quantitative HPLC against an authentic calibration curve / nitrogen elemental analysis",
    notEstablished: "Does not verify microbiological sterility, absence of bacterial endotoxins, counterion ratios, or biological activity.",
  },
  {
    attribute: "Sterility & Endotoxins",
    question: "Is the vial free of viable microorganisms and bacterial pyrogens?",
    method: "Microbiological culture incubation & Limulus Amebocyte Lysate (LAL) assay",
    notEstablished: "HPLC and MS purity assays provide zero information regarding sterility or endotoxins.",
  },
];

export default function PeptideIdentityVsPurityVsContentPage() {
  return (
    <>
      <JsonLd data={articleLd} />
      <JsonLd data={breadcrumbLd} />

      <GuideLayout guide={guide} tocItems={tocItems}>
        <section className="flex flex-col gap-4">
          <p className="text-ash leading-relaxed">
            Lab reports often get boiled down to one number, usually an HPLC purity figure like 99.2% or 99.8%. That number is useful, but it answers only one of three different questions.
          </p>
          <p className="text-ash leading-relaxed">
            <strong>Identity</strong> asks whether the right molecule is present. <strong>Purity</strong> asks how much of the UV-detectable material looks like the main peak. <strong>Content</strong> (sometimes called assay) asks how many milligrams of peptide are actually in the vial.
          </p>
          <p className="text-ash leading-relaxed">
            Mixing those up can break a quantitative experiment. A correctly identified peptide can still carry synthesis impurities. A sharp 99.5% peak can still sit in a vial that is underfilled, or in rare cases mislabeled. This guide walks through each metric and how to read them together on reports in our{" "}
            <Link
              href="/coa"
              className="font-medium text-accent underline underline-offset-4 hover:opacity-80"
            >
              COA Lookup
            </Link>{" "}
            and{" "}
            <Link
              href="/testing"
              className="font-medium text-accent underline underline-offset-4 hover:opacity-80"
            >
              Testing Methodology
            </Link>{" "}
            pages.
          </p>
        </section>

        <section id="three-questions" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Three questions, not one number
          </h2>
          <p className="text-ash leading-relaxed">
            When a chemist opens a lyophilized vial for third-party testing, they are really planning three separate checks:
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 pt-2">
            <div className="rounded-xl border border-linen bg-surface p-5">
              <span className="font-mono text-xs font-bold text-accent">QUESTION 1</span>
              <h3 className="mt-1 font-display text-lg font-bold text-ink">Identity</h3>
              <p className="mt-2 text-xs leading-relaxed text-ash">
                <em>&ldquo;Is this the correct chemical entity?&rdquo;</em> Looks at molecular mass, composition, and retention behavior.
              </p>
            </div>
            <div className="rounded-xl border border-linen bg-surface p-5">
              <span className="font-mono text-xs font-bold text-accent">QUESTION 2</span>
              <h3 className="mt-1 font-display text-lg font-bold text-ink">Purity</h3>
              <p className="mt-2 text-xs leading-relaxed text-ash">
                <em>&ldquo;What share of the eluted sample is target peptide?&rdquo;</em> Compares the main peak area with related synthesis side-products.
              </p>
            </div>
            <div className="rounded-xl border border-linen bg-surface p-5">
              <span className="font-mono text-xs font-bold text-accent">QUESTION 3</span>
              <h3 className="mt-1 font-display text-lg font-bold text-ink">Content</h3>
              <p className="mt-2 text-xs leading-relaxed text-ash">
                <em>&ldquo;How much active peptide is in the vial?&rdquo;</em> Measures absolute milligrams or concentration, not a relative percentage.
              </p>
            </div>
          </div>
          <p className="text-ash leading-relaxed pt-2">
            A single routine run rarely answers all three unless the lab also runs quantitative standards and complementary instruments.
          </p>
        </section>

        <section id="identity" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            What does identity tell you?
          </h2>
          <p className="text-ash leading-relaxed">
            Identity testing checks whether the sample matches the expected compound. For synthetic peptides, that comes first. If the sequence is wrong, purity and mass numbers are answering the wrong question for your protocol.
          </p>
          <p className="text-ash leading-relaxed">
            Labs usually lean on mass spectrometry (MS), which measures mass-to-charge ratios of peptide ions. Common setups include liquid chromatography-mass spectrometry (LC-MS) and matrix-assisted laser desorption/ionization time-of-flight (MALDI-TOF). By reading multicharged ion envelopes, the lab estimates experimental molecular weight and compares it with the theoretical value.
          </p>
          <p className="text-ash leading-relaxed">
            Retention time matching helps too. The sample&apos;s elution time is compared with an authentic reference standard run on the same column, gradient, flow rate, and temperature.
          </p>
          <AnalyticalCallout title="A clean mass spectrum is not a purity score" variant="limitation">
            Seeing the expected molecular ion shows the target is present. Ion yields vary between molecules, so a clean spectrum alone does not prove the vial is free of other material or tell you how many milligrams are inside.
          </AnalyticalCallout>
        </section>

        <section id="purity" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            What does purity tell you?
          </h2>
          <p className="text-ash leading-relaxed">
            When a Certificate of Analysis lists something like &ldquo;99.805% purity,&rdquo; that almost always means chromatographic area percentage from reversed-phase high-performance liquid chromatography (HPLC or RP-HPLC).
          </p>
          <p className="text-ash leading-relaxed">
            In plain terms, HPLC pushes the dissolved sample through a hydrophobic column under a water/acetonitrile gradient with an ion-pairing acid such as trifluoroacetic acid (TFA). Components leave the column at different times and pass a UV detector, often at 214 nm where the peptide backbone absorbs. The plot of absorbance versus time is the chromatogram.
          </p>
          <div className="rounded-xl border border-linen bg-surface p-5 text-sm space-y-2">
            <p className="font-mono text-xs font-semibold uppercase tracking-wider text-accent">
              How the percentage is calculated
            </p>
            <p className="font-mono text-ink text-sm sm:text-base">
              Purity (%) = [ Area of Main Target Peak / Total Integrated Area of All Peaks ] × 100
            </p>
            <p className="text-xs text-stone">
              Total area includes UV-absorbing deletion sequences, diastereomers, oxidized variants, and other synthesis byproducts under those assay conditions.
            </p>
          </div>
          <p className="text-ash leading-relaxed">
            For more on how gradients, columns, and wavelengths change this number, see{" "}
            <Link
              href="/guides/peptide-purity-vs-content"
              className="font-medium text-accent underline underline-offset-4 hover:opacity-80"
            >
              What Does 99% Peptide Purity Actually Mean?
            </Link>.
          </p>
        </section>

        <section id="content" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            What does content tell you?
          </h2>
          <p className="text-ash leading-relaxed">
            Content (also called net peptide content, peptide assay, or quantitative mass) is the absolute amount of target peptide in the container.
          </p>
          <p className="text-ash leading-relaxed">
            Lyophilized peptides arrive as salts. The white cake typically includes the peptide base, counterions on basic residues (often trifluoroacetate or acetate), residual moisture (commonly a few percent), and sometimes leftover salts or bulking agents.
          </p>
          <p className="text-ash leading-relaxed">
            So a vial with 10.0 mg of gross powder may hold closer to 7.5 to 8.5 mg of net peptide even at 99.5% HPLC purity. Getting that number right takes a quantitative assay against a calibrated standard, not just weighing the vial.
          </p>
          <AnalyticalCallout title="Gross powder vs net peptide" variant="key-point">
            Gross weight is everything in the vial. Net peptide content is only the target peptide mass. For precise molar concentrations in research work, use net peptide mass.
          </AnalyticalCallout>
        </section>

        <section id="comparison-matrix" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Side-by-side comparison
          </h2>
          <p className="text-ash leading-relaxed">
            Here is the short version of what each attribute covers and where it stops:
          </p>
          <ComparisonTable
            columns={comparisonColumns}
            rows={comparisonRows}
            caption="Comparison of Peptide Identity, Purity, and Content attributes"
          />
        </section>

        <section id="how-they-relate" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            How the three results relate
          </h2>
          <p className="text-ash leading-relaxed">
            Mass spectrometry can confirm the expected molecular weight is present without telling you the ratio of target to impurities. A crude mixture that is only about 65% target can still show a clear target ion. Presence is not the same as chromatographic purity.
          </p>
          <p className="text-ash leading-relaxed">
            Purity is a relative peak-area ratio. It does not care how much powder is in the vial. Two nominal 10 mg vials can look very different in practice:
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 pt-1">
            <div className="rounded-xl border border-linen bg-surface p-5">
              <span className="font-mono text-xs font-bold text-stone">VIAL A (NOMINAL 10 MG)</span>
              <ul className="mt-2 text-xs leading-relaxed text-ash space-y-1">
                <li>• HPLC Purity: <strong>99.5%</strong></li>
                <li>• Net Peptide Mass: <strong>6.20 mg</strong></li>
                <li>• High purity, but a large underfill relative to the label.</li>
              </ul>
            </div>
            <div className="rounded-xl border border-linen bg-surface p-5">
              <span className="font-mono text-xs font-bold text-stone">VIAL B (NOMINAL 10 MG)</span>
              <ul className="mt-2 text-xs leading-relaxed text-ash space-y-1">
                <li>• HPLC Purity: <strong>98.1%</strong></li>
                <li>• Net Peptide Mass: <strong>10.45 mg</strong></li>
                <li>• Slightly lower purity, but the fill matches the label better.</li>
              </ul>
            </div>
          </div>
          <p className="text-ash leading-relaxed pt-2">
            If you only read &ldquo;99.5% purity&rdquo; on Vial A and dissolve as if it were 10 mg, your working concentration can be far off. Likewise, a solid mass assay does not guarantee a clean purity profile or microbiological status. Those are separate measurements.
          </p>
        </section>

        <section id="report-example" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Reading a real report
          </h2>
          <p className="text-ash leading-relaxed">
            Here is how the three values show up on a published third-party report for PSL Labs Retatrutide (Batch &ldquo;Black Top&rdquo;, Task #{retatrutideBlackTopReport.taskNumber}) from Janoshik Analytical:
          </p>

          <div className="rounded-xl border border-linen bg-surface p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-linen pb-3">
              <span className="font-mono text-xs font-semibold text-accent">
                SAMPLE CASE STUDY · PSL LABS RETATRUTIDE
              </span>
              <span className="font-mono text-xs text-stone">
                Task #{retatrutideBlackTopReport.taskNumber}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 text-sm">
              <div>
                <p className="font-mono text-xs text-stone uppercase">1. Identity (MS)</p>
                <p className="font-bold text-ink mt-0.5">Retatrutide Confirmed</p>
                <p className="text-xs text-ash mt-1">Matched theoretical monoisotopic mass envelope via mass spectrometry.</p>
              </div>
              <div>
                <p className="font-mono text-xs text-stone uppercase">2. Purity (HPLC)</p>
                <p className="font-bold text-ink mt-0.5">{retatrutideBlackTopReport.purityPercent}% Purity</p>
                <p className="text-xs text-ash mt-1">Single major peak detected at 214nm; minor impurities total 0.195%.</p>
              </div>
              <div>
                <p className="font-mono text-xs text-stone uppercase">3. Net Amount (Assay)</p>
                <p className="font-bold text-ink mt-0.5">{retatrutideBlackTopReport.reportedAmountMg} mg Net Mass</p>
                <p className="text-xs text-ash mt-1">Quantitative HPLC assay confirms 13.03 mg active peptide vs 10 mg nominal.</p>
              </div>
            </div>

            <p className="text-xs text-stone border-t border-linen pt-3">
              All three values are reported separately. You can open the document in our{" "}
              <Link
                href="/coa"
                className="text-accent underline underline-offset-2 hover:opacity-80"
              >
                COA Lookup
              </Link>{" "}
              or check it on Janoshik&apos;s server at{" "}
              <a
                href={retatrutideBlackTopReport.verificationUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent underline underline-offset-2 hover:opacity-80"
              >
                verify.janoshik.com
              </a>.
            </p>
          </div>
        </section>

        <section id="untested-attributes" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            What needs separate tests
          </h2>
          <p className="text-ash leading-relaxed">
            Standard identity, purity, and mass work leave several attributes for specialized assays:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-ash text-sm sm:text-base">
            <li>
              <strong className="text-ink">Microbiological sterility:</strong> Membrane filtration or direct inoculation into growth media, then multi-day incubation. HPLC and MS do not detect viable organisms.
            </li>
            <li>
              <strong className="text-ink">Bacterial endotoxins:</strong> Limulus Amebocyte Lysate (LAL) testing, reported in Endotoxin Units (EU/mg). Pyrogenic lipopolysaccharides do not show up on a standard HPLC chromatogram.
            </li>
            <li>
              <strong className="text-ink">Residual solvents and counterions:</strong> Headspace GC-MS for synthesis solvents, and ion-exchange methods for TFA content.
            </li>
            <li>
              <strong className="text-ink">Water content:</strong> Karl Fischer titration for moisture trapped in the lyophilized matrix.
            </li>
          </ul>
        </section>

        <section id="analytical-limitations" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Practical limits
          </h2>
          <p className="text-ash leading-relaxed">
            Two boundaries are worth keeping in mind when you read any research supplier report:
          </p>
          <div className="space-y-3">
            <AnalyticalCallout title="Results apply to the tested sample" variant="limitation">
              Numbers describe the vial the laboratory received and analyzed. Without broader lot sampling, they do not prove every unit in a production run has identical mass or moisture.
            </AnalyticalCallout>
            <AnalyticalCallout title="Chemistry is not biological suitability" variant="limitation">
              Verified identity and chromatographic purity speak to chemical composition. They do not establish safety, pharmacokinetics, or suitability for in vivo use. PSL Labs materials are for laboratory research and analytical calibration only.
            </AnalyticalCallout>
          </div>
          <p className="text-ash leading-relaxed pt-2">
            Next, see{" "}
            <Link
              href="/guides/verify-peptide-laboratory-report"
              className="font-medium text-accent underline underline-offset-4 hover:opacity-80"
            >
              How to Verify a Peptide Laboratory Report
            </Link>{" "}
            or{" "}
            <Link
              href="/guides/batch-specific-vs-generic-coa"
              className="font-medium text-accent underline underline-offset-4 hover:opacity-80"
            >
              Batch-Specific COAs vs Generic COAs
            </Link>.
          </p>
        </section>
      </GuideLayout>
    </>
  );
}
