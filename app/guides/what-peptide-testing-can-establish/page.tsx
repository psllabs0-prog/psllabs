import type { Metadata } from "next";
import Link from "next/link";

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
  { id: "incomplete-statement", label: "'Third-party tested' needs follow-ups" },
  { id: "specific-questions", label: "Each test answers one question" },
  { id: "identity-testing", label: "Identity testing" },
  { id: "purity-testing", label: "Purity testing" },
  { id: "content-testing", label: "Content / mass assay" },
  { id: "capstone-matrix", label: "Scope matrix" },
  { id: "separate-tests", label: "Attributes that need other assays" },
  { id: "no-substitutes", label: "Methods that do not replace each other" },
  { id: "tested-sample-limits", label: "Tested-sample boundaries" },
  { id: "batch-representativeness", label: "Batch matching in practice" },
  { id: "what-testing-cannot-prove", label: "What chemical data cannot prove" },
  { id: "psl-transparency", label: "How PSL Labs presents docs" },
  { id: "analytical-checklist", label: "Evaluation checklist" },
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
        <section className="flex flex-col gap-4">
          <p className="text-ash leading-relaxed">
            &ldquo;Third-party tested&rdquo; shows up everywhere in research biochemical marketing. As a chemistry statement, it is incomplete on its own.
          </p>
          <p className="text-ash leading-relaxed">
            Testing is not a single quality stamp. It is a set of assays, each aimed at one property under defined instrument conditions. Identity, purity, and mass content answer different questions. None of those chemical checks by themselves establish sterility or clinical safety.
          </p>
          <p className="text-ash leading-relaxed">
            This guide maps the boundaries: what standard peptide lab tests establish, what needs separate assays, and what chemical data simply cannot prove.
          </p>
        </section>

        <section id="incomplete-statement" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            &ldquo;Third-party tested&rdquo; needs follow-ups
          </h2>
          <p className="text-ash leading-relaxed">
            When a supplier says a compound is third-party tested, ask:
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 pt-1">
            <div className="rounded-xl border border-linen bg-surface p-5 text-sm space-y-1">
              <span className="font-mono text-xs font-bold text-accent">QUESTION 1</span>
              <p className="font-bold text-ink">What was tested?</p>
              <p className="text-xs text-ash">Identity, purity area %, quantitative mass fill, or a combination?</p>
            </div>
            <div className="rounded-xl border border-linen bg-surface p-5 text-sm space-y-1">
              <span className="font-mono text-xs font-bold text-accent">QUESTION 2</span>
              <p className="font-bold text-ink">How was it tested?</p>
              <p className="text-xs text-ash">Which instruments, columns, and detector wavelengths?</p>
            </div>
            <div className="rounded-xl border border-linen bg-surface p-5 text-sm space-y-1">
              <span className="font-mono text-xs font-bold text-accent">QUESTION 3</span>
              <p className="font-bold text-ink">Can it be verified?</p>
              <p className="text-xs text-ash">Does the lab host the original record under a task ID you can look up?</p>
            </div>
          </div>
          <p className="text-ash leading-relaxed pt-2">
            Without those answers, &ldquo;third-party tested&rdquo; is reassurance, not documentation.
          </p>
        </section>

        <section id="specific-questions" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Each test answers one question
          </h2>
          <p className="text-ash leading-relaxed">
            Analytical methods work through specific physical readouts: mass-to-charge ratios, light absorption, retention time, culture growth. Each assay is built to answer one question well. Stretching an HPLC purity scan into claims about sterility or biological effect is not valid chemistry.
          </p>
        </section>

        <section id="identity-testing" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Identity testing
          </h2>
          <p className="text-ash leading-relaxed">
            <strong>Question:</strong> Does the sample contain molecules matching the target formula and mass?
          </p>
          <p className="text-ash leading-relaxed">
            Labs typically use liquid chromatography-mass spectrometry (LC-MS) or MALDI-TOF. Mass spectrometry (MS) measures mass-to-charge ratios and checks whether the main ionizing species matches the theoretical molecular weight from the amino acid sequence. That confirms presence of the expected mass. It does not by itself give net milligrams, purity percentage, or salt content, and without specialized chiral methods it does not separate L- and D-enantiomers.
          </p>
        </section>

        <section id="purity-testing" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Purity testing
          </h2>
          <p className="text-ash leading-relaxed">
            <strong>Question:</strong> What share of detectable UV-absorbing material sits under the main retention peak?
          </p>
          <p className="text-ash leading-relaxed">
            Reversed-phase high-performance liquid chromatography (HPLC) with UV detection (often 214 nm or 220 nm) produces a chromatogram of absorbance versus time. The purity percentage is usually relative peak area of the target versus other UV-active related substances. It does not name the molecule, measure absolute vial mass, or see UV-transparent salts and water. More detail is in{" "}
            <Link
              href="/guides/peptide-purity-vs-content"
              className="text-accent underline underline-offset-2"
            >
              What Does 99% Peptide Purity Actually Mean?
            </Link>.
          </p>
        </section>

        <section id="content-testing" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Content / mass assay
          </h2>
          <p className="text-ash leading-relaxed">
            <strong>Question:</strong> How many milligrams of active peptide are in the submitted vial?
          </p>
          <p className="text-ash leading-relaxed">
            An assay here means a quantitative measurement, typically HPLC against a calibration curve of an authentic standard, or total nitrogen elemental analysis. That gives net peptide mass (for example, 10.34 mg on a nominal 10 mg vial) without guessing from gross powder weight. It still does not speak to sterility, endotoxins, or receptor binding.
          </p>
        </section>

        <section id="capstone-matrix" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Scope matrix
          </h2>
          <p className="text-ash leading-relaxed">
            The table below is the compact reference for what each major category covers:
          </p>
          <ComparisonTable
            columns={scopeMatrixColumns}
            rows={scopeMatrixRows}
            caption="Comprehensive matrix of analytical testing capabilities and limitations"
          />
        </section>

        <section id="separate-tests" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Attributes that need other assays
          </h2>
          <p className="text-ash leading-relaxed">
            Beyond identity, purity, and net mass, several parameters need their own protocols:
          </p>
          <div className="space-y-3 pt-1 text-sm">
            <div className="rounded-xl border border-linen bg-surface p-5 space-y-1.5">
              <span className="font-mono text-xs font-bold text-accent uppercase">
                Microbiological sterility (USP &lt;71&gt;)
              </span>
              <p className="text-ash leading-relaxed">
                Multi-day incubation in growth media to detect viable bacteria and fungi. HPLC and MS do not detect living organisms.
              </p>
            </div>
            <div className="rounded-xl border border-linen bg-surface p-5 space-y-1.5">
              <span className="font-mono text-xs font-bold text-accent uppercase">
                Bacterial endotoxins (USP &lt;85&gt;)
              </span>
              <p className="text-ash leading-relaxed">
                Limulus Amebocyte Lysate (LAL) testing for lipopolysaccharides from Gram-negative bacteria. Pyrogens can matter at very low levels and still be invisible on a standard HPLC chromatogram.
              </p>
            </div>
            <div className="rounded-xl border border-linen bg-surface p-5 space-y-1.5">
              <span className="font-mono text-xs font-bold text-accent uppercase">
                Residual solvents (USP &lt;467&gt;)
              </span>
              <p className="text-ash leading-relaxed">
                Headspace GC-MS for volatile synthesis reagents such as DMF, dichloromethane, piperidine, and acetonitrile.
              </p>
            </div>
          </div>
        </section>

        <section id="no-substitutes" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Methods that do not replace each other
          </h2>
          <p className="text-ash leading-relaxed">
            UV absorbance cannot identify structure the way mass spectrometry can. Ionization response in MS is not a reliable substitute for a calibrated quantitative assay. And a chemically clean chromatogram does not replace microbiological testing. Keep each method in its lane.
          </p>
        </section>

        <section id="tested-sample-limits" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Tested-sample boundaries
          </h2>
          <AnalyticalCallout title="Destructive assays describe the submitted vial" variant="limitation">
            Chromatography and mass spectrometry consume the analyzed sample. Results apply to that vial. They do not prove every other unit in the lot is chemically identical.
          </AnalyticalCallout>
          <p className="text-ash leading-relaxed">
            Confidence across a lot comes from manufacturing controls and fill consistency. One third-party test confirms the submitted sample met the reported specs. It does not replace process validation.
          </p>
        </section>

        <section id="batch-representativeness" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Batch matching in practice
          </h2>
          <p className="text-ash leading-relaxed">
            When you review documentation, confirm the batch code matches the container, the sample came from the active commercial lot (not only a legacy pilot), and the report includes purity and quantitative mass when those were performed. See{" "}
            <Link
              href="/guides/batch-specific-vs-generic-coa"
              className="font-medium text-accent underline underline-offset-4 hover:opacity-80"
            >
              Batch-Specific COAs vs Generic COAs: Why Lot Traceability Matters
            </Link>.
          </p>
        </section>

        <section id="what-testing-cannot-prove" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            What chemical data cannot prove
          </h2>
          <p className="text-ash leading-relaxed">
            Third-party chemical testing does not establish biological safety or pharmacological efficacy, suitability for in vivo administration, or regulatory approval such as FDA clearance or cGMP drug certification. PSL Labs materials are for laboratory research and analytical calibration only.
          </p>
        </section>

        <section id="psl-transparency" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            How PSL Labs presents docs
          </h2>
          <div className="rounded-xl border border-linen bg-surface p-6 space-y-3 text-sm leading-relaxed text-ash">
            <p>
              <strong className="text-ink">1. Primary data:</strong> We publish original Janoshik reports with chromatograms, integration baselines, and mass spectra, not retyped summaries.
            </p>
            <p>
              <strong className="text-ink">2. Independent verification:</strong> Each report has a Task Number and Verification Key you can check on verify.janoshik.com.
            </p>
            <p>
              <strong className="text-ink">3. Clear scope:</strong> We state what each report covers (identity, purity %, net mass) and where the record stops.
            </p>
          </div>
        </section>

        <section id="analytical-checklist" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Evaluation checklist
          </h2>
          <p className="text-ash leading-relaxed">
            Use this checklist before accepting documentation into lab records:
          </p>
          <VerificationChecklist />
          <p className="text-ash leading-relaxed pt-2">
            Explore published reports via{" "}
            <Link
              href="/coa"
              className="font-medium text-accent underline underline-offset-4 hover:opacity-80"
            >
              View Batch Reports
            </Link>{" "}
            or{" "}
            <Link
              href="/testing"
              className="font-medium text-accent underline underline-offset-4 hover:opacity-80"
            >
              See Testing Details
            </Link>.
          </p>
        </section>
      </GuideLayout>
    </>
  );
}
