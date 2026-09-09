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
  { key: "attribute", header: "Test type" },
  { key: "addresses", header: "What it shows" },
  { key: "notEstablished", header: "What it does not show" },
];

const scopeMatrixRows = [
  {
    attribute: "Identity",
    addresses: "Whether the sample matches the expected molecular weight and sequence.",
    notEstablished: "Purity %, net vial mass, shortened sequences, salt content, or sterility.",
  },
  {
    attribute: "Purity",
    addresses: "How much of the detected material is the main peptide.",
    notEstablished: "Molecular identity, net milligrams, or salts that do not show on the test.",
  },
  {
    attribute: "Content / assay",
    addresses: "How many milligrams of active peptide are in the tested vial.",
    notEstablished: "Sterility, endotoxins, or biological activity.",
  },
  {
    attribute: "Sterility",
    addresses: "Whether live bacteria or fungi are present after culture testing.",
    notEstablished: "Identity, purity, mass content, or non-living toxins.",
  },
  {
    attribute: "Endotoxins",
    addresses: "Level of bacterial toxins (LAL test, reported in EU/mg).",
    notEstablished: "Chemical purity, peptide identity, or sterility.",
  },
  {
    attribute: "Residual solvents",
    addresses: "Leftover volatile chemicals from synthesis.",
    notEstablished: "Peptide sequence, amino acid fidelity, or peptide content.",
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
            &ldquo;Third-party tested&rdquo; does not tell you much on its own. Each lab test answers one specific question.
          </p>
          <p className="text-ash leading-relaxed">
            Identity, purity, and content are separate results. None of them by themselves prove sterility or clinical safety.
          </p>
          <p className="text-ash leading-relaxed">
            This guide explains what standard peptide lab tests can show, what needs a separate test, and what a chemical report alone cannot prove.
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
            Each test is built to answer one question. A purity test cannot speak to sterility. An identity test cannot tell you how many milligrams are in the vial. Use each result for what it actually measures.
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
            Labs typically use identity testing (mass spectrometry). The test checks whether the measured weight matches the expected weight from the amino acid sequence. That confirms the expected compound is present. It does not by itself give net milligrams, purity percentage, or salt content.
          </p>
        </section>

        <section id="purity-testing" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Purity testing
          </h2>
          <p className="text-ash leading-relaxed">
            <strong>Question:</strong> How much of the detected material is the main peptide?
          </p>
          <p className="text-ash leading-relaxed">
            A laboratory purity test produces a graph over time. The purity percentage is usually the main peak compared with other detected peaks. It does not name the molecule, measure vial mass, or see salts and water that do not show on the test. More detail is in{" "}
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
            An assay is a quantitative measurement, typically against a reference standard. That gives net peptide mass (for example, 10.34 mg on a nominal 10 mg vial) without guessing from gross powder weight. It still does not speak to sterility or endotoxins.
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
                Sterility
              </span>
              <p className="text-ash leading-relaxed">
                Growth media tests over several days to detect live bacteria and fungi. A standard peptide report does not detect these.
              </p>
            </div>
            <div className="rounded-xl border border-linen bg-surface p-5 space-y-1.5">
              <span className="font-mono text-xs font-bold text-accent uppercase">
                Endotoxins
              </span>
              <p className="text-ash leading-relaxed">
                LAL testing for bacterial toxins. They can be present at low levels and still not show on a standard purity graph.
              </p>
            </div>
            <div className="rounded-xl border border-linen bg-surface p-5 space-y-1.5">
              <span className="font-mono text-xs font-bold text-accent uppercase">
                Residual solvents
              </span>
              <p className="text-ash leading-relaxed">
                Separate tests for leftover volatile chemicals from synthesis.
              </p>
            </div>
          </div>
        </section>

        <section id="no-substitutes" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Methods that do not replace each other
          </h2>
          <p className="text-ash leading-relaxed">
            A purity test cannot identify structure. Identity testing cannot replace a quantitative assay for milligrams. A clean purity result does not replace a sterility test. Keep each result in its lane.
          </p>
        </section>

        <section id="tested-sample-limits" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Tested-sample boundaries
          </h2>
          <AnalyticalCallout title="Results apply to the tested vial" variant="limitation">
            Lab testing uses up the sample. Results apply to that vial. They do not prove every other unit in the lot is identical.
          </AnalyticalCallout>
          <p className="text-ash leading-relaxed">
            One third-party test confirms the submitted sample met the reported specs. It does not prove the whole lot is identical.
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
            The report only covers the tests shown on the original laboratory file. Chemical testing does not establish biological safety, medical suitability, or regulatory approval. PSL Labs materials are for laboratory research only.
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
