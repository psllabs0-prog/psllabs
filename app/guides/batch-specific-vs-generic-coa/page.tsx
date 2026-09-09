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

const guide = getGuideBySlug("batch-specific-vs-generic-coa")!;

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
  { id: "batch-vs-generic", label: "What batch-specific really means" },
  { id: "generic-coa-anatomy", label: "How to spot a generic 'COA'" },
  { id: "why-identifiers-matter", label: "Why lot numbers matter" },
  { id: "documentation-chain", label: "From product to published report" },
  { id: "identifiers-to-compare", label: "Identifiers to compare" },
  { id: "analysis-dates", label: "Old reports vs current stock" },
  { id: "sampling-limitations", label: "Sampling limits" },
  { id: "what-it-does-not-mean", label: "What batch reports do not prove" },
  { id: "psl-approach", label: "How PSL Labs documents lots" },
  { id: "checklist", label: "Batch traceability checklist" },
];

const batchVsGenericColumns = [
  { key: "feature", header: "Feature / Attribute" },
  { key: "batchSpecific", header: "Batch-Specific Report (Authentic COA)" },
  { key: "genericDoc", header: "Generic Specification Document" },
];

const batchVsGenericRows = [
  {
    feature: "Lot / Batch Identifier",
    batchSpecific: "Matches physical vial label and invoice exactly (e.g. PSL-BPC157-10MG).",
    genericDoc: "Absent, blank, or generic placeholder ('Batch: N/A' or 'Batch: All').",
  },
  {
    feature: "Analytical Results",
    batchSpecific: "Reports specific empirical numbers (e.g. 99.748% purity, 11.75 mg mass).",
    genericDoc: "Reports broad specification ranges (e.g. '≥98.0%' or 'Conforms').",
  },
  {
    feature: "Analysis Date",
    batchSpecific: "Exact date of laboratory receipt and testing corresponding to production run.",
    genericDoc: "Static date or absent entirely; reused across years of manufacturing.",
  },
  {
    feature: "Primary Raw Data",
    batchSpecific: "Full HPLC chromatogram plot with integration table, baseline, and retention times.",
    genericDoc: "Summary table only; no raw instrument data or spectra provided.",
  },
  {
    feature: "Independent Verification",
    batchSpecific: "Unique task number queryable directly on laboratory's server (verify.janoshik.com).",
    genericDoc: "Unverifiable; no unique laboratory task number or direct portal record.",
  },
];

export default function BatchSpecificVsGenericCoaPage() {
  return (
    <>
      <JsonLd data={articleLd} />
      <JsonLd data={breadcrumbLd} />

      <GuideLayout guide={guide} tocItems={tocItems}>
        <section className="flex flex-col gap-4">
          <p className="text-ash leading-relaxed">
            In research supply, &ldquo;Certificate of Analysis&rdquo; (COA) gets used for two different kinds of paperwork: a real batch-specific third-party lab report, and a generic manufacturer specification sheet.
          </p>
          <p className="text-ash leading-relaxed">
            A generic sheet says what the supplier aims to make. A batch-specific COA says what an independent lab measured on a sample from that production run.
          </p>
          <p className="text-ash leading-relaxed">
            When documentation is not tied to a lot, reproducibility suffers. This guide covers how the paper trail should work, why batch numbers matter, and how to spot a generic sheet dressed up as an analytical report.
          </p>
        </section>

        <section id="batch-vs-generic" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            What batch-specific really means
          </h2>
          <p className="text-ash leading-relaxed">
            A batch-specific COA is an empirical record for one production lot. It typically includes:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-ash text-sm sm:text-base">
            <li>The unique batch code for that synthesis and lyophilization run</li>
            <li>The sample vial sent to the testing lab</li>
            <li>The analysis date on laboratory instruments</li>
            <li>Measured results (for example, 99.805% HPLC purity and 13.03 mg net mass)</li>
            <li>The chromatogram and mass spectrum that support those numbers</li>
          </ul>
          <p className="text-ash leading-relaxed">
            Those results belong to that lot. They do not automatically cover earlier runs, later runs, or material from a different synthesis site.
          </p>
        </section>

        <section id="generic-coa-anatomy" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            How to spot a generic &ldquo;COA&rdquo;
          </h2>
          <p className="text-ash leading-relaxed">
            Some PDFs look polished but are really static specification sheets. Common tells:
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 pt-1 text-sm">
            <div className="rounded-xl border border-linen bg-surface p-5 space-y-2">
              <span className="font-mono text-xs font-semibold uppercase text-signal">
                Tell #1: Spec targets instead of measurements
              </span>
              <p className="text-xs sm:text-sm text-ash leading-relaxed">
                Instead of &ldquo;99.74%,&rdquo; you see &ldquo;Purity: &gt;98.0%&rdquo; or &ldquo;Conforms&rdquo; on every row.
              </p>
            </div>
            <div className="rounded-xl border border-linen bg-surface p-5 space-y-2">
              <span className="font-mono text-xs font-semibold uppercase text-signal">
                Tell #2: No chromatograms
              </span>
              <p className="text-xs sm:text-sm text-ash leading-relaxed">
                Only a typed table. No detector output, no HPLC chromatogram with integration baselines, no mass spectrum.
              </p>
            </div>
          </div>
          <ComparisonTable
            columns={batchVsGenericColumns}
            rows={batchVsGenericRows}
            caption="Key differences between Batch-Specific Reports and Generic Specification Sheets"
            className="mt-2"
          />
        </section>

        <section id="why-identifiers-matter" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Why lot numbers matter
          </h2>
          <p className="text-ash leading-relaxed">
            Solid-phase peptide synthesis involves many coupling, deprotection, cleavage, and purification steps. Even under controlled protocols, lots differ:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-ash text-sm sm:text-base">
            <li>Coupling efficiency shifts, which changes deletion peptide side-products.</li>
            <li>Preparative HPLC cuts at slightly different windows produce different purity profiles.</li>
            <li>Lyophilization conditions change residual moisture and counterion content.</li>
            <li>Fill automation can drift slightly between production runs.</li>
          </ul>
          <p className="text-ash leading-relaxed">
            Two runs of the same peptide are not chemically identical. The lot number is what connects the vial on the bench to its analytical record.
          </p>
        </section>

        <section id="documentation-chain" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            From product to published report
          </h2>
          <p className="text-ash leading-relaxed">
            In a verifiable setup, the paper trail looks like this:
          </p>

          <div className="rounded-xl border border-linen bg-surface p-6">
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-page font-mono text-xs font-bold">1</span>
                <div className="flex-1">
                  <p className="font-display font-bold text-ink text-sm sm:text-base">Product released</p>
                  <p className="text-xs text-ash">Compound is finished and assigned a unique synthesis lot ID.</p>
                </div>
              </div>
              <div className="ml-3.5 h-4 w-px bg-linen" />
              <div className="flex items-center gap-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-page font-mono text-xs font-bold">2</span>
                <div className="flex-1">
                  <p className="font-display font-bold text-ink text-sm sm:text-base">Lot printed on packaging</p>
                  <p className="text-xs text-ash">Same code appears on vial labels and cartons.</p>
                </div>
              </div>
              <div className="ml-3.5 h-4 w-px bg-linen" />
              <div className="flex items-center gap-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-page font-mono text-xs font-bold">3</span>
                <div className="flex-1">
                  <p className="font-display font-bold text-ink text-sm sm:text-base">Sample sent to a third-party lab</p>
                  <p className="text-xs text-ash">A representative vial goes to an independent facility (Janoshik).</p>
                </div>
              </div>
              <div className="ml-3.5 h-4 w-px bg-linen" />
              <div className="flex items-center gap-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-page font-mono text-xs font-bold">4</span>
                <div className="flex-1">
                  <p className="font-display font-bold text-ink text-sm sm:text-base">Lab analyzes and issues a task ID</p>
                  <p className="text-xs text-ash">HPLC and mass assays are logged under an immutable Task Number.</p>
                </div>
              </div>
              <div className="ml-3.5 h-4 w-px bg-linen" />
              <div className="flex items-center gap-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-page font-mono text-xs font-bold">5</span>
                <div className="flex-1">
                  <p className="font-display font-bold text-ink text-sm sm:text-base">Signed report published</p>
                  <p className="text-xs text-ash">Original report lives on the lab server and is mirrored in PSL COA Lookup.</p>
                </div>
              </div>
            </div>
          </div>
          <p className="text-ash leading-relaxed pt-2">
            Break any link (missing task number, unlabeled vial) and the chain is no longer verifiable.
          </p>
        </section>

        <section id="identifiers-to-compare" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Identifiers to compare
          </h2>
          <p className="text-ash leading-relaxed">
            When an order arrives, line up these four checks across the physical goods and the records:
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 pt-1 text-sm">
            <div className="rounded-xl border border-linen bg-surface p-5 space-y-1">
              <span className="font-mono text-xs font-bold text-accent">IDENTIFIER 1</span>
              <p className="font-bold text-ink">Vial label vs report batch code</p>
              <p className="text-xs text-ash">The batch on the vial should match the batch header on the COA.</p>
            </div>
            <div className="rounded-xl border border-linen bg-surface p-5 space-y-1">
              <span className="font-mono text-xs font-bold text-accent">IDENTIFIER 2</span>
              <p className="font-bold text-ink">Task number vs lab portal</p>
              <p className="text-xs text-ash">Enter the task number at verify.janoshik.com and confirm the original PDF.</p>
            </div>
            <div className="rounded-xl border border-linen bg-surface p-5 space-y-1">
              <span className="font-mono text-xs font-bold text-accent">IDENTIFIER 3</span>
              <p className="font-bold text-ink">Nominal strength vs reported mass</p>
              <p className="text-xs text-ash">See whether the report gives net active mass (for example 10.34 mg) or only relative purity.</p>
            </div>
            <div className="rounded-xl border border-linen bg-surface p-5 space-y-1">
              <span className="font-mono text-xs font-bold text-accent">IDENTIFIER 4</span>
              <p className="font-bold text-ink">Analysis date vs order timing</p>
              <p className="text-xs text-ash">The analysis should sit in a reasonable window for the active production you are buying.</p>
            </div>
          </div>
        </section>

        <section id="analysis-dates" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Old reports vs current stock
          </h2>
          <p className="text-ash leading-relaxed">
            A common shortcut is reusing a strong historical report. A supplier tests a pilot lot, gets 99.8%, then keeps showing that same PDF for later production years later.
          </p>
          <p className="text-ash leading-relaxed">
            That does not hold up scientifically. Reagents, amino acid lots, and equipment cycles change. If the analysis date is years old while the SKU is still being replenished, ask for current lot-specific testing.
          </p>
        </section>

        <section id="sampling-limitations" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Sampling limits
          </h2>
          <AnalyticalCallout title="Batch-matched does not mean every vial was tested" variant="limitation">
            Analytical testing is destructive. The submitted sample is dissolved and consumed. A batch-matched report describes that submitted vial, not every unit in the lot.
          </AnalyticalCallout>
          <p className="text-ash leading-relaxed">
            Consistency across vials depends on homogeneous bulk synthesis and controlled filling. No lab can test 100% of finished units without destroying the inventory.
          </p>
        </section>

        <section id="what-it-does-not-mean" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            What batch reports do not prove
          </h2>
          <p className="text-ash leading-relaxed">
            A solid batch report still has a clear scope. HPLC speaks to chemical purity under the method used. It does not cover sterility, endotoxin status, biological activity, or regulatory approval. Those need different assays or frameworks entirely.
          </p>
        </section>

        <section id="psl-approach" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            How PSL Labs documents lots
          </h2>
          <p className="text-ash leading-relaxed">
            We follow a verification-before-release standard:
          </p>
          <div className="rounded-xl border border-linen bg-surface p-6 space-y-3 text-sm leading-relaxed text-ash">
            <p>
              <strong className="text-ink">1. Published docs for active SKUs:</strong> We do not sell under vague &ldquo;testing pending&rdquo; promises. Active catalog items ship with a published Janoshik COA.
            </p>
            <p>
              <strong className="text-ink">2. Batch-specific scope:</strong> We do not stretch historical data across new production runs. When a lot changes, new third-party analysis is completed and published.
            </p>
            <p>
              <strong className="text-ink">3. Pipeline gating:</strong> &ldquo;Coming Soon&rdquo; items stay non-purchasable until verification is finalized and indexed in{" "}
              <Link href="/coa" className="text-accent underline underline-offset-2">
                View Batch Reports
              </Link>.
            </p>
          </div>
        </section>

        <section id="checklist" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Batch traceability checklist
          </h2>
          <p className="text-ash leading-relaxed">
            Use this checklist whenever you inspect third-party documentation:
          </p>
          <VerificationChecklist />
          <p className="text-ash leading-relaxed pt-2">
            Continue with{" "}
            <Link
              href="/guides/what-peptide-testing-can-establish"
              className="font-medium text-accent underline underline-offset-4 hover:opacity-80"
            >
              What Peptide Analytical Testing Can, and Cannot, Establish
            </Link>{" "}
            or open{" "}
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
