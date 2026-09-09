import type { Metadata } from "next";
import Link from "next/link";

import { AnimateIn } from "@/components/product/animate-in";
import { JsonLd } from "@/components/seo/json-ld";
import { GuideLayout } from "@/components/guides/guide-layout";
import { ComparisonTable } from "@/components/guides/comparison-table";
import { AnalyticalCallout } from "@/components/guides/analytical-callout";
import { getGuideBySlug } from "@/lib/content/guides-data";
import { retatrutideBlackTopReport, ghkCu50mgReport } from "@/lib/batch-reports";
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
  { id: "three-questions", label: "Three Different Analytical Questions" },
  { id: "identity", label: "1. Chemical Identity: What Is the Target Molecule?" },
  { id: "purity", label: "2. Chromatographic Purity: What Proportion Is Target?" },
  { id: "content", label: "3. Content / Assay: How Many Milligrams Are Present?" },
  { id: "comparison-matrix", label: "Comparison Matrix: Identity vs Purity vs Content" },
  { id: "why-identity-not-purity", label: "Why Identity Does Not Establish Purity" },
  { id: "why-purity-not-content", label: "Why Purity Does Not Establish Content" },
  { id: "why-content-not-everything", label: "Why Content Does Not Establish Other Quality Attributes" },
  { id: "report-example", label: "Illustrative Report-Reading Example" },
  { id: "untested-attributes", label: "Attributes Requiring Separate Specialized Testing" },
  { id: "analytical-limitations", label: "Core Analytical Limitations" },
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
        {/* Intro */}
        <section className="flex flex-col gap-4">
          <p className="text-ash leading-relaxed">
            In research biochemical procurement, laboratory reports and Certificates of Analysis (COAs) are frequently reduced to a single number, most commonly an HPLC purity percentage such as 99.2% or 99.8%. This oversimplification conflates three fundamentally distinct analytical parameters: <strong>identity</strong>, <strong>chromatographic purity</strong>, and <strong>quantitative content</strong>.
          </p>
          <p className="text-ash leading-relaxed">
            Conflating these attributes introduces significant risk into quantitative research protocols. A vial containing an impeccably identified compound may suffer from unacceptable synthesis impurities; conversely, a sample demonstrating a single, sharp 99.5% HPLC peak might contain only half its nominal mass or represent a completely mislabeled peptide sequence.
          </p>
          <p className="text-ash leading-relaxed">
            This guide establishes precise analytical definitions for each metric, explains the laboratory instrumentation used to evaluate them, and demonstrates how to interpret all three parameters together when evaluating published third-party reports in our{" "}
            <Link
              href="/coa"
              className="font-medium text-accent underline underline-offset-4 hover:opacity-80"
            >
              COA Lookup
            </Link>{" "}
            or{" "}
            <Link
              href="/testing"
              className="font-medium text-accent underline underline-offset-4 hover:opacity-80"
            >
              Testing Methodology
            </Link>{" "}
            sections.
          </p>
        </section>

        {/* Section 1: Three Questions */}
        <section id="three-questions" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Three Different Analytical Questions
          </h2>
          <p className="text-ash leading-relaxed">
            When an analytical chemist receives a lyophilized vial for third-party evaluation, they must formulate three separate questions before designing an analytical sequence:
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 pt-2">
            <div className="rounded-xl border border-linen bg-surface p-5">
              <span className="font-mono text-xs font-bold text-accent">QUESTION 1</span>
              <h3 className="mt-1 font-display text-lg font-bold text-ink">Identity</h3>
              <p className="mt-2 text-xs leading-relaxed text-ash">
                <em>&ldquo;Is this the correct chemical entity?&rdquo;</em> Evaluates molecular mass, amino acid composition, and retention characteristics.
              </p>
            </div>
            <div className="rounded-xl border border-linen bg-surface p-5">
              <span className="font-mono text-xs font-bold text-accent">QUESTION 2</span>
              <h3 className="mt-1 font-display text-lg font-bold text-ink">Purity</h3>
              <p className="mt-2 text-xs leading-relaxed text-ash">
                <em>&ldquo;What proportion of the eluted sample is target peptide?&rdquo;</em> Evaluates relative peak area percentage against synthesis side-products.
              </p>
            </div>
            <div className="rounded-xl border border-linen bg-surface p-5">
              <span className="font-mono text-xs font-bold text-accent">QUESTION 3</span>
              <h3 className="mt-1 font-display text-lg font-bold text-ink">Content</h3>
              <p className="mt-2 text-xs leading-relaxed text-ash">
                <em>&ldquo;How much actual active peptide is inside the vial?&rdquo;</em> Measures absolute net milligrams (mg) or concentration (w/v).
              </p>
            </div>
          </div>
          <p className="text-ash leading-relaxed pt-2">
            No single routine analytical run answers all three questions simultaneously unless combined with specialized hyphenated instrumentation and rigorous quantitative standard curves.
          </p>
        </section>

        {/* Section 2: Identity */}
        <section id="identity" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            1. Chemical Identity: What Is the Target Molecule?
          </h2>
          <p className="text-ash leading-relaxed">
            Identity testing establishes whether the chemical structure of the sample corresponds to the expected compound. For synthetic peptides, identity is primary: if the amino acid sequence is incorrect or substituted, purity and mass measurements are irrelevant to the intended research protocol.
          </p>
          <div className="space-y-3 pl-1">
            <h3 className="font-display text-lg font-bold text-ink">Primary Analytical Methods for Identity:</h3>
            <ul className="list-disc pl-5 space-y-2 text-ash text-sm sm:text-base">
              <li>
                <strong className="text-ink">Liquid Chromatography-Mass Spectrometry (LC-MS):</strong> Measures the mass-to-charge ratio (m/z) of peptide ions. By deconvoluting multicharged ion envelopes ([M+H]+, [M+2H]2+, etc.), the laboratory calculates the experimental molecular weight of the intact peptide and matches it against the theoretical monoisotopic or average molecular weight.
              </li>
              <li>
                <strong className="text-ink">Matrix-Assisted Laser Desorption/Ionization (MALDI-TOF):</strong> Soft ionization technique providing precise molecular weight confirmation for synthetic peptides.
              </li>
              <li>
                <strong className="text-ink">Chromatographic Retention Time Alignment:</strong> Compares the elution time (t_R) of the sample against an authentic, verified chemical reference standard run under identical chromatographic conditions (same column stationary phase, solvent gradient, flow rate, and temperature).
              </li>
            </ul>
          </div>
          <AnalyticalCallout title="Identity Does Not Quantify Purity or Mass" variant="limitation">
            A mass spectrum confirms the presence of the molecular ion corresponding to the target peptide. However, mass spectrometry ion yields vary widely between molecules; a clean mass spectrum does not verify that the vial is free of non-ionizing impurities, nor does it establish how many milligrams are present.
          </AnalyticalCallout>
        </section>

        {/* Section 3: Purity */}
        <section id="purity" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            2. Chromatographic Purity: What Proportion Is Target?
          </h2>
          <p className="text-ash leading-relaxed">
            When a Certificate of Analysis lists a purity figure such as &ldquo;99.805%&rdquo;, it almost universally refers to <strong>chromatographic area percentage</strong> determined by Reversed-Phase High-Performance Liquid Chromatography (RP-HPLC).
          </p>
          <p className="text-ash leading-relaxed">
            During RP-HPLC analysis, the dissolved peptide sample is pumped through a hydrophobic stationary phase (e.g., C18 silica column) under a gradient of water and organic modifier (acetonitrile) containing an ion-pairing acid (such as trifluoroacetic acid, TFA). Components elute at characteristic times and pass through an optical detector monitoring ultraviolet absorption (typically at 214 nm, corresponding to the peptide backbone amide bond).
          </p>
          <div className="rounded-xl border border-linen bg-surface p-5 text-sm space-y-2">
            <p className="font-mono text-xs font-semibold uppercase tracking-wider text-accent">
              Chromatographic Area Calculation Formula
            </p>
            <p className="font-mono text-ink text-sm sm:text-base">
              Purity (%) = [ Area of Main Target Peak / Total Integrated Area of All Peaks ] × 100
            </p>
            <p className="text-xs text-stone">
              Where &ldquo;Total Integrated Area&rdquo; includes detected deletion sequences, diastereomers, oxidized variants, and synthesis byproducts that absorb UV light under the assay conditions.
            </p>
          </div>
          <p className="text-ash leading-relaxed">
            For deeper exploration of how HPLC gradients, column chemistry, and UV wavelengths alter this number, review our companion guide on{" "}
            <Link
              href="/guides/peptide-purity-vs-content"
              className="font-medium text-accent underline underline-offset-4 hover:opacity-80"
            >
              What Does 99% Peptide Purity Actually Mean?
            </Link>.
          </p>
        </section>

        {/* Section 4: Content */}
        <section id="content" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            3. Content / Assay: How Many Milligrams Are Present?
          </h2>
          <p className="text-ash leading-relaxed">
            Quantitative peptide content, often termed <strong>net peptide content</strong>, <strong>peptide assay</strong>, or <strong>quantitative mass</strong>, measures the absolute physical weight of pure peptide molecules in the container.
          </p>
          <p className="text-ash leading-relaxed">
            Synthetic peptides are manufactured as lyophilized salts. When a lyophilized cake is produced, it consists of:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-ash text-sm sm:text-base">
            <li>The active target peptide base</li>
            <li>Counterions bound to basic amino acid residues (most commonly trifluoroacetate TFA⁻ or acetate AcO⁻)</li>
            <li>Residual coordinated water of hydration (lyophilized peptides retain 2% to 8% moisture)</li>
            <li>Residual synthesis salts or buffering agents (e.g., ammonium bicarbonate or mannitol bulking agents if added)</li>
          </ul>
          <p className="text-ash leading-relaxed">
            Consequently, a vial containing 10.0 mg of total gross white powder may contain only 7.5 mg to 8.5 mg of net active peptide, even when the peptide purity is 99.5%. Measuring actual peptide content requires an independent quantitative assay against a calibrated reference standard, rather than simply weighing the vial on an analytical balance.
          </p>
          <AnalyticalCallout title="Net Peptide Content vs Gross Powder Weight" variant="key-point">
            Gross weight measures the complete contents of the vial (peptide + counterions + moisture + salts). Net peptide content measures exclusively the target peptide molecular mass. Research protocols requiring precise molar concentrations must be calculated using net peptide mass, not gross powder weight.
          </AnalyticalCallout>
        </section>

        {/* Section 5: Comparison Matrix */}
        <section id="comparison-matrix" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Comparison Matrix: Identity vs Purity vs Content
          </h2>
          <p className="text-ash leading-relaxed">
            The table below synthesizes the analytical scope, instrumentation, and critical non-conclusions for each core parameter:
          </p>
          <ComparisonTable
            columns={comparisonColumns}
            rows={comparisonRows}
            caption="Comparison of Peptide Identity, Purity, and Content attributes"
          />
        </section>

        {/* Section 6: Why Identity Does Not Establish Purity */}
        <section id="why-identity-not-purity" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Why Identity Does Not Automatically Establish Purity
          </h2>
          <p className="text-ash leading-relaxed">
            A positive identity confirmation by mass spectrometry establishes that molecules of the expected molecular weight are present in the sample. It does not establish the ratio of target molecules to impurities.
          </p>
          <p className="text-ash leading-relaxed">
            During solid-phase peptide synthesis (SPPS), failure sequences (truncation peptides missing one or two amino acids) often elute close to the main product. Furthermore, if a crude, unpurified synthesis mixture containing only 65% target peptide is injected into an LC-MS instrument, the mass spectrum will still show an unmistakable target ion peak. The presence of the peak proves identity; it says nothing about chromatographic purity.
          </p>
        </section>

        {/* Section 7: Why Purity Does Not Establish Content */}
        <section id="why-purity-not-content" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Why Purity Does Not Automatically Establish Content
          </h2>
          <p className="text-ash leading-relaxed">
            Chromatographic purity is an <em>intensive property</em>, a ratio of relative peak areas. It is completely independent of total vial mass (an <em>extensive property</em>).
          </p>
          <p className="text-ash leading-relaxed">
            Consider two hypothetical research vials:
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 pt-1">
            <div className="rounded-xl border border-linen bg-surface p-5">
              <span className="font-mono text-xs font-bold text-stone">VIAL A (NOMINAL 10 MG)</span>
              <ul className="mt-2 text-xs leading-relaxed text-ash space-y-1">
                <li>• HPLC Purity: <strong>99.5%</strong></li>
                <li>• Net Peptide Mass: <strong>6.20 mg</strong></li>
                <li>• Result: High purity, but severe 38% underfill.</li>
              </ul>
            </div>
            <div className="rounded-xl border border-linen bg-surface p-5">
              <span className="font-mono text-xs font-bold text-stone">VIAL B (NOMINAL 10 MG)</span>
              <ul className="mt-2 text-xs leading-relaxed text-ash space-y-1">
                <li>• HPLC Purity: <strong>98.1%</strong></li>
                <li>• Net Peptide Mass: <strong>10.45 mg</strong></li>
                <li>• Result: Slightly lower purity, but fully compliant mass fill.</li>
              </ul>
            </div>
          </div>
          <p className="text-ash leading-relaxed pt-2">
            A researcher relying solely on an HPLC report listing &ldquo;99.5% purity&rdquo; would be completely unaware that Vial A contains only 62% of the required experimental mass. If reconstituted into a volumetric flask based on the nominal 10 mg label, the resulting working concentration would be off by nearly 40%.
          </p>
        </section>

        {/* Section 8: Why Content Does Not Establish Everything */}
        <section id="why-content-not-everything" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Why Content Does Not Establish Other Quality Attributes
          </h2>
          <p className="text-ash leading-relaxed">
            Similarly, a quantitative assay confirming that a vial contains 10.34 mg of compound does not guarantee chemical purity or microbiological status. A vial filled with 10.34 mg of degraded material containing 85% target and 15% truncated side-products would meet a total mass threshold while failing chromatographic purity standards.
          </p>
          <p className="text-ash leading-relaxed">
            Furthermore, neither purity nor mass content provides any information regarding biological sterility or endotoxins. A vial can exhibit 99.9% chromatographic purity and verified 10.0 mg net mass while harboring bacterial endotoxins or microbial contamination.
          </p>
        </section>

        {/* Section 9: Illustrative Report Reading Example */}
        <section id="report-example" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Illustrative Report-Reading Example
          </h2>
          <p className="text-ash leading-relaxed">
            To see how this distinction functions on an actual third-party Certificate of Analysis, examine the empirical report published for PSL Labs Retatrutide (Batch &ldquo;Black Top&rdquo;, Task #{retatrutideBlackTopReport.taskNumber}) analyzed by Janoshik Analytical:
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
              Notice that all three values are reported separately. You can inspect this original document directly in our{" "}
              <Link
                href="/coa"
                className="text-accent underline underline-offset-2 hover:opacity-80"
              >
                COA Lookup
              </Link>{" "}
              or verify it on Janoshik&apos;s server at{" "}
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

        {/* Section 10: Untested Attributes */}
        <section id="untested-attributes" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Attributes Requiring Separate Specialized Testing
          </h2>
          <p className="text-ash leading-relaxed">
            Analytical transparency requires researchers to recognize what standard identity, purity, and mass assays do <em>not</em> evaluate. The following attributes require separate, specialized analytical determinations:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-ash text-sm sm:text-base">
            <li>
              <strong className="text-ink">Microbiological Sterility:</strong> Assessed by membrane filtration or direct inoculation into fluid thioglycollate medium (FTM) and soybean casein digest medium (SCDM) followed by 14-day incubation. HPLC and MS cannot detect viable bacteria, fungi, or bacterial spores.
            </li>
            <li>
              <strong className="text-ink">Bacterial Endotoxins:</strong> Assessed by chromogenic or turbidimetric Limulus Amebocyte Lysate (LAL) testing reported in Endotoxin Units (EU/mg). Endotoxins are pyrogenic lipopolysaccharides from Gram-negative bacterial cell walls that do not appear on standard HPLC chromatograms.
            </li>
            <li>
              <strong className="text-ink">Residual Solvents &amp; Counterions:</strong> Assessed by Headspace Gas Chromatography (GC-MS) for synthesis solvents (DMF, DCM, piperidine, acetonitrile) and ion-exchange chromatography for TFA counterion content.
            </li>
            <li>
              <strong className="text-ink">Water Content:</strong> Assessed by Karl Fischer coulometric titration to quantify residual moisture trapped within the lyophilized matrix.
            </li>
          </ul>
        </section>

        {/* Section 11: Analytical Limitations */}
        <section id="analytical-limitations" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Core Analytical Limitations
          </h2>
          <p className="text-ash leading-relaxed">
            When reviewing any analytical report from PSL Labs or any other research supplier, observe these scientific boundaries:
          </p>
          <div className="space-y-3">
            <AnalyticalCallout title="Tested Sample Limitation" variant="limitation">
              Analytical results apply strictly to the specific sample vial delivered to and analyzed by the laboratory. Testing cannot guarantee that every individual unit in a production lot has identical mass or moisture levels without statistical batch sampling.
            </AnalyticalCallout>
            <AnalyticalCallout title="Non-Equivalence to Biological Suitability" variant="limitation">
              Chemical verification of identity and chromatographic purity does not establish biological safety, pharmacokinetic properties, or suitability for in vivo administration. PSL Labs materials are distributed exclusively for laboratory research and analytical calibration.
            </AnalyticalCallout>
          </div>
          <p className="text-ash leading-relaxed pt-2">
            To learn how to inspect batch traceability and avoid misleading documentation, continue to our guide on{" "}
            <Link
              href="/guides/verify-peptide-laboratory-report"
              className="font-medium text-accent underline underline-offset-4 hover:opacity-80"
            >
              How to Verify a Peptide Laboratory Report
            </Link>{" "}
            or explore{" "}
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
