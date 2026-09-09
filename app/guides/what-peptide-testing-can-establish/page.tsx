import type { Metadata } from "next";
import Link from "next/link";
import { AlertCircle, CheckCircle2, ShieldAlert, Sparkles } from "lucide-react";

import { JsonLd } from "@/components/seo/json-ld";
import { GuideLayout } from "@/components/guides/guide-layout";
import { AnalyticalCallout } from "@/components/guides/analytical-callout";
import { ComparisonTable } from "@/components/guides/comparison-table";
import { VerificationChecklist } from "@/components/guides/verification-checklist";
import { getGuideBySlug } from "@/lib/content/guides-data";
import { LEGAL_ENTITY_NAME } from "@/lib/content/testing-scope";
import { createPageMetadata, SITE_URL } from "@/lib/seo";

const guide = getGuideBySlug("what-peptide-testing-can-establish")!;

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
  { id: "incomplete-statement", label: "'Third-Party Tested' Is Incomplete Information" },
  { id: "specific-questions", label: "Analytical Testing Answers Highly Specific Questions" },
  { id: "identity-testing", label: "1. Chemical Identity Testing" },
  { id: "purity-testing", label: "2. Chromatographic Purity Testing" },
  { id: "content-testing", label: "3. Content & Amount (Mass Assay) Testing" },
  { id: "capstone-matrix", label: "The Comprehensive Analytical Scope Matrix" },
  { id: "separate-tests", label: "Additional Attributes Requiring Separate Dedicated Tests" },
  { id: "no-substitutes", label: "What One Analytical Method Cannot Substitute For" },
  { id: "tested-sample-limits", label: "Tested-Sample & Single-Vial Boundaries" },
  { id: "batch-representativeness", label: "Batch Representativeness & Statistical Limits" },
  { id: "what-testing-cannot-prove", label: "What Analytical Testing Does NOT Establish" },
  { id: "psl-transparency", label: "How PSL Labs Presents Laboratory Documentation" },
  { id: "analytical-checklist", label: "The Researcher's Analytical Evaluation Checklist" },
];

const scopeMatrixColumns = [
  { key: "attribute", header: "Tested Attribute" },
  { key: "addresses", header: "What the Test Explicitly Addresses" },
  { key: "notEstablished", header: "What It Does NOT Automatically Establish" },
];

const scopeMatrixRows = [
  {
    attribute: "Chemical Identity",
    addresses: "Molecular weight and sequence confirmation via mass-to-charge ratio (LC-MS / MALDI-TOF) against theoretical structure.",
    notEstablished: "Does not establish purity percentage, net vial mass, presence of truncations, counterion ratio, or sterility.",
  },
  {
    attribute: "Chromatographic Purity",
    addresses: "Relative UV peak area percentage at 214nm/220nm on RP-HPLC, separating target from detectable synthesis side-products.",
    notEstablished: "Does not prove molecular identity, does not measure net milligrams, and cannot detect non-UV absorbing salts or sugars.",
  },
  {
    attribute: "Content / Assay (Mass)",
    addresses: "Absolute physical mass of active peptide present in the specific tested vial container (measured in mg).",
    notEstablished: "Does not establish microbiological sterility, bacterial endotoxin status, or biological receptor potency.",
  },
  {
    attribute: "Microbiological Sterility",
    addresses: "Absence of viable proliferating aerobic/anaerobic bacteria and fungi following 14-day USP <71> incubation.",
    notEstablished: "Does not verify chemical identity, chromatographic purity, mass content, or absence of non-viable pyrogens.",
  },
  {
    attribute: "Bacterial Endotoxin Status",
    addresses: "Quantification of Gram-negative bacterial lipopolysaccharides via Limulus Amebocyte Lysate (LAL) assay (EU/mg).",
    notEstablished: "Does not evaluate chemical purity, intact peptide identity, or microbiological sterility.",
  },
  {
    attribute: "Residual Solvents & Salts",
    addresses: "Quantification of volatile organic synthesis reagents (DMF, DCM, piperidine) via Headspace GC-MS.",
    notEstablished: "Does not confirm peptide sequence, amino acid fidelity, or quantitative peptide content.",
  },
];

export default function WhatPeptideTestingCanEstablishPage() {
  return (
    <>
      <JsonLd data={articleLd} />
      <JsonLd data={breadcrumbLd} />

      <GuideLayout guide={guide} tocItems={tocItems}>
        {/* Intro */}
        <section className="flex flex-col gap-4">
          <p className="text-ash leading-relaxed">
            In the research biochemical sector, &ldquo;third-party tested&rdquo; has become a universal trust badge. It appears on vendor banners, product cards, and marketing emails. Yet from an analytical chemistry perspective, the statement &ldquo;this product is third-party tested&rdquo; conveys incomplete information.
          </p>
          <p className="text-ash leading-relaxed">
            Testing is not an abstract quality stamp; it is a series of distinct chemical and biological assays, each designed to evaluate a single physical property under specified instrumentation parameters. A test that confirms molecular identity tells you nothing about chromatographic purity. A test that establishes purity tells you nothing about net vial mass. And no chemical test establishes biological sterility or clinical safety.
          </p>
          <p className="text-ash leading-relaxed">
            This capstone authority guide establishes the exact boundaries of analytical peptide documentation: what standard laboratory tests establish, what requires separate assays, and what laboratory data can never establish.
          </p>
        </section>

        {/* Section 1 */}
        <section id="incomplete-statement" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            &ldquo;Third-Party Tested&rdquo; Is Incomplete Information
          </h2>
          <p className="text-ash leading-relaxed">
            When a supplier states that a compound is &ldquo;third-party tested,&rdquo; the critical follow-up questions must always be:
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 pt-1">
            <div className="rounded-xl border border-linen bg-surface p-5 text-sm space-y-1">
              <span className="font-mono text-xs font-bold text-accent">QUESTION 1</span>
              <p className="font-bold text-ink">What was tested?</p>
              <p className="text-xs text-ash">Was it identity, purity area %, quantitative mass fill, or all three?</p>
            </div>
            <div className="rounded-xl border border-linen bg-surface p-5 text-sm space-y-1">
              <span className="font-mono text-xs font-bold text-accent">QUESTION 2</span>
              <p className="font-bold text-ink">How was it tested?</p>
              <p className="text-xs text-ash">What instrumentation, column chemistry, and detector wavelengths were used?</p>
            </div>
            <div className="rounded-xl border border-linen bg-surface p-5 text-sm space-y-1">
              <span className="font-mono text-xs font-bold text-accent">QUESTION 3</span>
              <p className="font-bold text-ink">Can it be verified?</p>
              <p className="text-xs text-ash">Does the issuing laboratory host the authentic raw record under an immutable task ID?</p>
            </div>
          </div>
          <p className="text-ash leading-relaxed pt-2">
            Without answers to these three questions, the claim &ldquo;third-party tested&rdquo; functions as marketing reassurance rather than empirical documentation.
          </p>
        </section>

        {/* Section 2 */}
        <section id="specific-questions" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Analytical Testing Answers Highly Specific Questions
          </h2>
          <p className="text-ash leading-relaxed">
            Analytical chemistry operates on reductionism: complex physical materials are interrogated through targeted physical phenomena (mass-to-charge deflection, light absorption, retention time, culture incubation).
          </p>
          <p className="text-ash leading-relaxed">
            Each assay answers exactly one question. Attempting to generalize the results of an HPLC purity scan to encompass sterility, biological efficacy, or safety is scientifically invalid.
          </p>
        </section>

        {/* Section 3: Identity */}
        <section id="identity-testing" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            1. Chemical Identity Testing
          </h2>
          <p className="text-ash leading-relaxed">
            <strong>Question Answered:</strong> <em>Does the sample contain molecules matching the target molecular formula and mass?</em>
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-ash text-sm sm:text-base">
            <li><strong>Methodology:</strong> Liquid Chromatography-Mass Spectrometry (LC-MS) or MALDI-TOF mass spectrometry.</li>
            <li><strong>What It Establishes:</strong> Confirms that the molecular weight of the main ionizing species matches the theoretical monoisotopic or average molecular weight calculated from the amino acid sequence.</li>
            <li><strong>What It Does Not Establish:</strong> LC-MS does not quantify net milligrams in the vial, does not detect non-ionizing salts, and cannot distinguish between L- and D-enantiomers without specialized chiral digestion.</li>
          </ul>
        </section>

        {/* Section 4: Purity */}
        <section id="purity-testing" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            2. Chromatographic Purity Testing
          </h2>
          <p className="text-ash leading-relaxed">
            <strong>Question Answered:</strong> <em>What percentage of detectable UV-absorbing material corresponds to the main retention peak?</em>
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-ash text-sm sm:text-base">
            <li><strong>Methodology:</strong> Reversed-Phase High-Performance Liquid Chromatography (RP-HPLC) with UV/Vis spectrophotometric detection (typically at 214 nm or 220 nm).</li>
            <li><strong>What It Establishes:</strong> Quantifies the relative optical peak area of the target peptide relative to detectable synthesis side-products, deletion sequences, and related substances that absorb light at that wavelength.</li>
            <li><strong>What It Does Not Establish:</strong> HPLC does not prove chemical identity, does not measure absolute vial mass, and is blind to UV-transparent excipients (salts, TFA counterions, water). Review our dedicated analysis on{" "}
            <Link
              href="/guides/peptide-purity-vs-content"
              className="text-accent underline underline-offset-2"
            >
              What Does 99% Peptide Purity Actually Mean?
            </Link>.</li>
          </ul>
        </section>

        {/* Section 5: Content */}
        <section id="content-testing" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            3. Content &amp; Amount (Mass Assay) Testing
          </h2>
          <p className="text-ash leading-relaxed">
            <strong>Question Answered:</strong> <em>How many absolute milligrams of active peptide are present in the submitted vial?</em>
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-ash text-sm sm:text-base">
            <li><strong>Methodology:</strong> Quantitative HPLC against a multi-point calibration curve of an authentic reference standard, or total nitrogen elemental analysis.</li>
            <li><strong>What It Establishes:</strong> The physical net mass of the target peptide (e.g., 10.34 mg on a nominal 10 mg vial), eliminating assumptions regarding gross powder weight and counterion fraction.</li>
            <li><strong>What It Does Not Establish:</strong> Net mass does not verify biological sterility, absence of bacterial endotoxins, or receptor binding affinity.</li>
          </ul>
        </section>

        {/* Section 6: Comprehensive Scope Matrix */}
        <section id="capstone-matrix" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            The Comprehensive Analytical Scope Matrix
          </h2>
          <p className="text-ash leading-relaxed">
            The matrix below defines the exact analytical boundaries for each major testing category in peptide research documentation:
          </p>
          <ComparisonTable
            columns={scopeMatrixColumns}
            rows={scopeMatrixRows}
            caption="Comprehensive matrix of analytical testing capabilities and limitations"
          />
        </section>

        {/* Section 7 */}
        <section id="separate-tests" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Additional Attributes Requiring Separate Dedicated Tests
          </h2>
          <p className="text-ash leading-relaxed">
            Beyond identity, purity, and net mass, several critical biochemical parameters require independent, specialized testing protocols:
          </p>
          <div className="space-y-3 pt-1 text-sm">
            <div className="rounded-xl border border-linen bg-surface p-5 space-y-1.5">
              <span className="font-mono text-xs font-bold text-accent uppercase">
                Microbiological Sterility (USP &lt;71&gt;)
              </span>
              <p className="text-ash leading-relaxed">
                Requires 14-day incubation in fluid thioglycollate medium (FTM) and soybean casein digest medium (SCDM) to detect viable anaerobic/aerobic bacteria and fungi. Chemical HPLC and mass spectrometry cannot detect viable biological organisms.
              </p>
            </div>
            <div className="rounded-xl border border-linen bg-surface p-5 space-y-1.5">
              <span className="font-mono text-xs font-bold text-accent uppercase">
                Bacterial Endotoxins (USP &lt;85&gt;)
              </span>
              <p className="text-ash leading-relaxed">
                Requires Limulus Amebocyte Lysate (LAL) turbidimetric or chromogenic testing to detect lipopolysaccharides from Gram-negative bacterial outer membranes. Pyrogens are biologically active at picogram concentrations but completely invisible to standard HPLC detectors.
              </p>
            </div>
            <div className="rounded-xl border border-linen bg-surface p-5 space-y-1.5">
              <span className="font-mono text-xs font-bold text-accent uppercase">
                Residual Solvents (USP &lt;467&gt;)
              </span>
              <p className="text-ash leading-relaxed">
                Requires Headspace Gas Chromatography (GC-MS) to quantify volatile organic synthesis reagents such as N,N-dimethylformamide (DMF), dichloromethane (DCM), piperidine, and acetonitrile.
              </p>
            </div>
          </div>
        </section>

        {/* Section 8 */}
        <section id="no-substitutes" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            What One Analytical Method Cannot Substitute For
          </h2>
          <p className="text-ash leading-relaxed">
            Analytical instrumentation cannot cross domain boundaries:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-ash text-sm sm:text-base">
            <li><strong>HPLC cannot substitute for Mass Spectrometry:</strong> UV absorbance cannot identify a molecular structure.</li>
            <li><strong>Mass Spectrometry cannot substitute for Quantitative Assay:</strong> Ionization response factors vary unpredictably between different peptides and salt forms.</li>
            <li><strong>Chemical purity cannot substitute for microbiological testing:</strong> A chemically pure 99.9% peptide can be non-sterile and contaminated with pyrogenic endotoxins.</li>
          </ul>
        </section>

        {/* Section 9 */}
        <section id="tested-sample-limits" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Tested-Sample &amp; Single-Vial Boundaries
          </h2>
          <p className="text-ash leading-relaxed">
            A fundamental tenet of third-party analytical testing:
          </p>
          <AnalyticalCallout title="The Destructive Assay Boundary" variant="limitation">
            Because analytical chromatography and mass spectrometry dissolve and destroy the analyzed sample, test results apply strictly to the specific vial submitted to the testing facility. Testing does not prove that every other vial in that production lot is chemically identical.
          </AnalyticalCallout>
          <p className="text-ash leading-relaxed">
            Statistical confidence across a lot depends on manufacturing quality control, validated bulk homogenization, and automated fill precision. A single third-party test confirms that the submitted sample met specifications; it does not replace the manufacturer&apos;s process validation.
          </p>
        </section>

        {/* Section 10 */}
        <section id="batch-representativeness" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Batch Representativeness &amp; Statistical Limits
          </h2>
          <p className="text-ash leading-relaxed">
            When researchers review batch documentation, they should confirm:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-ash text-sm sm:text-base">
            <li>The batch code on the report matches the container in hand.</li>
            <li>The sample was submitted from the active commercial lot, not a legacy pilot run.</li>
            <li>The report includes both chromatographic purity and quantitative net mass when available.</li>
          </ul>
          <p className="text-ash leading-relaxed">
            Review our detailed analysis on{" "}
            <Link
              href="/guides/batch-specific-vs-generic-coa"
              className="font-medium text-accent underline underline-offset-4 hover:opacity-80"
            >
              Batch-Specific COAs vs Generic COAs: Why Lot Traceability Matters
            </Link>.
          </p>
        </section>

        {/* Section 11 */}
        <section id="what-testing-cannot-prove" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            What Analytical Testing Does NOT Establish
          </h2>
          <p className="text-ash leading-relaxed">
            To preserve research compliance and scientific accuracy, researchers must recognize the absolute limits of chemical documentation. Third-party analytical testing does NOT establish:
          </p>
          <div className="space-y-3 pt-1">
            <div className="rounded-xl border border-signal/30 bg-signal/5 p-5 text-sm space-y-1">
              <span className="font-mono text-xs font-bold text-signal uppercase">NON-CONCLUSION 1</span>
              <p className="font-bold text-ink">Biological Safety or Pharmacological Efficacy</p>
              <p className="text-xs text-ash">Chemical verification of identity and purity provides zero data regarding pharmacokinetics, cellular toxicity, or biological activity in biological systems.</p>
            </div>
            <div className="rounded-xl border border-signal/30 bg-signal/5 p-5 text-sm space-y-1">
              <span className="font-mono text-xs font-bold text-signal uppercase">NON-CONCLUSION 2</span>
              <p className="font-bold text-ink">Suitability for In Vivo Administration</p>
              <p className="text-xs text-ash">All materials are supplied strictly for in vitro laboratory research and analytical calibration. Chemical reports do not authorize or establish suitability for human or animal administration.</p>
            </div>
            <div className="rounded-xl border border-signal/30 bg-signal/5 p-5 text-sm space-y-1">
              <span className="font-mono text-xs font-bold text-signal uppercase">NON-CONCLUSION 3</span>
              <p className="font-bold text-ink">Regulatory Approval</p>
              <p className="text-xs text-ash">Third-party analytical testing from private laboratories does not constitute FDA approval, cGMP drug substance certification, or medical device registration.</p>
            </div>
          </div>
        </section>

        {/* Section 12 */}
        <section id="psl-transparency" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            How PSL Labs Presents Laboratory Documentation
          </h2>
          <p className="text-ash leading-relaxed">
            PSL Labs is engineered around verifiable operating standards:
          </p>
          <div className="rounded-xl border border-linen bg-surface p-6 space-y-3 text-sm leading-relaxed text-ash">
            <p>
              <strong className="text-ink">1. Unaltered Primary Data:</strong> We publish complete, original laboratory reports from Janoshik Analytical—including chromatograms, integration baselines, and mass spectra—rather than retyped vendor summaries.
            </p>
            <p>
              <strong className="text-ink">2. Independent Digital Verification:</strong> Every report displays an authentic Task Number and Verification Key queryable on verify.janoshik.com.
            </p>
            <p>
              <strong className="text-ink">3. Explicit Scope Transparency:</strong> We state plainly what each report establishes (identity, purity %, net mass) and what it does not establish.
            </p>
          </div>
        </section>

        {/* Section 13 */}
        <section id="analytical-checklist" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            The Researcher&apos;s Analytical Evaluation Checklist
          </h2>
          <p className="text-ash leading-relaxed">
            Follow this 8-point checklist before accepting research documentation into institutional laboratory records:
          </p>
          <VerificationChecklist />
          <p className="text-ash leading-relaxed pt-2">
            To explore specific published batch reports across our catalog, visit our{" "}
            <Link
              href="/coa"
              className="font-medium text-accent underline underline-offset-4 hover:opacity-80"
            >
              COA / Batch Lookup
            </Link>{" "}
            or review our{" "}
            <Link
              href="/testing"
              className="font-medium text-accent underline underline-offset-4 hover:opacity-80"
            >
              Testing Methodology
            </Link>.
          </p>
        </section>
      </GuideLayout>
    </>
  );
}
