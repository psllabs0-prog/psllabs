import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Layers, ShieldCheck } from "lucide-react";

import { JsonLd } from "@/components/seo/json-ld";
import { GuideLayout } from "@/components/guides/guide-layout";
import { AnalyticalCallout } from "@/components/guides/analytical-callout";
import { ComparisonTable } from "@/components/guides/comparison-table";
import { VerificationChecklist } from "@/components/guides/verification-checklist";
import { getGuideBySlug } from "@/lib/content/guides-data";
import { batchReports } from "@/lib/batch-reports";
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
  { id: "batch-vs-generic", label: "What Batch-Specific Documentation Actually Means" },
  { id: "generic-coa-anatomy", label: "Anatomy of a Generic 'Specification' COA" },
  { id: "why-identifiers-matter", label: "Why Lot and Batch Identifiers Matter" },
  { id: "documentation-chain", label: "The Traceability Chain: Product to Published Report" },
  { id: "identifiers-to-compare", label: "Critical Identifiers Researchers Must Compare" },
  { id: "analysis-dates", label: "Historical Reports vs Current Inventory" },
  { id: "sampling-limitations", label: "The Statistical Reality of Sampling Limitations" },
  { id: "what-it-does-not-mean", label: "What Batch-Specific Reporting Does NOT Mean" },
  { id: "psl-approach", label: "PSL Labs' Lot Documentation Approach" },
  { id: "checklist", label: "Batch Traceability Verification Checklist" },
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
        {/* Intro */}
        <section className="flex flex-col gap-4">
          <p className="text-ash leading-relaxed">
            In research biochemical supply, the term &ldquo;Certificate of Analysis&rdquo; (COA) is frequently applied to two fundamentally different types of documents: genuine, batch-specific third-party laboratory reports and generic manufacturer specification sheets.
          </p>
          <p className="text-ash leading-relaxed">
            A generic specification sheet merely restates what the supplier <em>intends</em> to synthesize. A batch-specific COA reports what an independent laboratory <em>empirically measured</em> on a designated sample from that specific production run.
          </p>
          <p className="text-ash leading-relaxed">
            When research documentation is decoupled from batch traceability, experimental reproducibility is compromised. This guide examines how the documentation chain functions, why batch numbers are the cornerstone of research procurement, and how to spot generic documents masquerading as analytical reports.
          </p>
        </section>

        {/* Section 1 */}
        <section id="batch-vs-generic" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            What Batch-Specific Documentation Actually Means
          </h2>
          <p className="text-ash leading-relaxed">
            A <strong>batch-specific Certificate of Analysis</strong> is an empirical laboratory record tied to one specific, unbroken production lot of compound. It documents:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-ash text-sm sm:text-base">
            <li>The unique batch code assigned to that synthesis and lyophilization run</li>
            <li>The specific sample vial delivered to the testing facility</li>
            <li>The date the analysis was executed on laboratory instrumentation</li>
            <li>The exact measured numerical findings (e.g., 99.805% HPLC purity, 13.03 mg net mass)</li>
            <li>The primary chromatogram and mass spectrum confirming the result</li>
          </ul>
          <p className="text-ash leading-relaxed">
            The defining characteristic of batch-specific reporting is non-transferability: the results belong exclusively to that lot. They cannot be used to certify past synthesis runs, subsequent production lots, or material sourced from different synthesis facilities.
          </p>
        </section>

        {/* Section 2 */}
        <section id="generic-coa-anatomy" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Anatomy of a Generic &ldquo;Specification&rdquo; COA
          </h2>
          <p className="text-ash leading-relaxed">
            Many websites display PDFs that look impressive at a distance but are actually static specification sheets. Common traits of generic documents include:
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 pt-1 text-sm">
            <div className="rounded-xl border border-linen bg-surface p-5 space-y-2">
              <span className="font-mono text-xs font-semibold uppercase text-signal">
                Generic Document Tell #1: Specification Targets
              </span>
              <p className="text-xs sm:text-sm text-ash leading-relaxed">
                Instead of reporting exact numbers (such as &ldquo;99.74%&rdquo;), the document lists targets like &ldquo;Purity: &gt;98.0%&rdquo; or simply writes &ldquo;Conforms&rdquo; next to every test row.
              </p>
            </div>
            <div className="rounded-xl border border-linen bg-surface p-5 space-y-2">
              <span className="font-mono text-xs font-semibold uppercase text-signal">
                Generic Document Tell #2: No Chromatograms
              </span>
              <p className="text-xs sm:text-sm text-ash leading-relaxed">
                The document contains only a typed table created in Word or Canva. There is no raw detector output, no HPLC chromatogram with integration baselines, and no mass spectrum.
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

        {/* Section 3 */}
        <section id="why-identifiers-matter" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Why Lot and Batch Identifiers Matter
          </h2>
          <p className="text-ash leading-relaxed">
            Solid-phase peptide synthesis is a multi-step chemical process involving dozens of coupling, deprotection, cleavage, and purification cycles. Even under strict manufacturing protocols, variation occurs between batches:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-ash text-sm sm:text-base">
            <li>Coupling efficiency varies, producing different deletion peptide side-products.</li>
            <li>Preparative HPLC fractions cut at slightly different retention windows yield distinct purity profiles.</li>
            <li>Lyophilization chamber pressure and cycle times alter residual moisture and counterion content.</li>
            <li>Vial fill automation can experience slight mass drift across different production runs.</li>
          </ul>
          <p className="text-ash leading-relaxed">
            Because two synthesis runs of the same peptide are never chemically identical, the lot number is the only anchor connecting the physical material on the lab bench to its historical analytical record.
          </p>
        </section>

        {/* Section 4: Documentation Chain */}
        <section id="documentation-chain" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            The Traceability Chain: Product to Published Report
          </h2>
          <p className="text-ash leading-relaxed">
            In verifiable research procurement, documentation follows an unbroken chain of custody:
          </p>

          <div className="rounded-xl border border-linen bg-surface p-6">
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-page font-mono text-xs font-bold">1</span>
                <div className="flex-1">
                  <p className="font-display font-bold text-ink text-sm sm:text-base">Commercial Product Released</p>
                  <p className="text-xs text-ash">Target compound formulated and assigned a unique synthesis lot identifier.</p>
                </div>
              </div>
              <div className="ml-3.5 h-4 w-px bg-linen" />
              <div className="flex items-center gap-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-page font-mono text-xs font-bold">2</span>
                <div className="flex-1">
                  <p className="font-display font-bold text-ink text-sm sm:text-base">Physical Lot / Batch Established</p>
                  <p className="text-xs text-ash">Printed directly onto physical vial labels and carton packaging.</p>
                </div>
              </div>
              <div className="ml-3.5 h-4 w-px bg-linen" />
              <div className="flex items-center gap-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-page font-mono text-xs font-bold">3</span>
                <div className="flex-1">
                  <p className="font-display font-bold text-ink text-sm sm:text-base">Sample Submitted to Third-Party Lab</p>
                  <p className="text-xs text-ash">Representative vial dispatched to an independent analytical facility (Janoshik).</p>
                </div>
              </div>
              <div className="ml-3.5 h-4 w-px bg-linen" />
              <div className="flex items-center gap-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-page font-mono text-xs font-bold">4</span>
                <div className="flex-1">
                  <p className="font-display font-bold text-ink text-sm sm:text-base">Laboratory Analyzes &amp; Issues Task ID</p>
                  <p className="text-xs text-ash">HPLC and mass assays executed; raw data logged under an immutable Task Number.</p>
                </div>
              </div>
              <div className="ml-3.5 h-4 w-px bg-linen" />
              <div className="flex items-center gap-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-page font-mono text-xs font-bold">5</span>
                <div className="flex-1">
                  <p className="font-display font-bold text-ink text-sm sm:text-base">Official Signed Report Published</p>
                  <p className="text-xs text-ash">Original report hosted on laboratory server and mirrored in PSL COA Lookup.</p>
                </div>
              </div>
            </div>
          </div>
          <p className="text-ash leading-relaxed pt-2">
            If any link in this chain is broken, such as a missing task number or an unlabelled vial, the chain of custody collapses, and the documentation cannot be verified.
          </p>
        </section>

        {/* Section 5 */}
        <section id="identifiers-to-compare" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Critical Identifiers Researchers Must Compare
          </h2>
          <p className="text-ash leading-relaxed">
            When receiving an order of research materials, compare these four data points across physical items and electronic records:
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 pt-1 text-sm">
            <div className="rounded-xl border border-linen bg-surface p-5 space-y-1">
              <span className="font-mono text-xs font-bold text-accent">IDENTIFIER 1</span>
              <p className="font-bold text-ink">Vial Label vs Report Batch Code</p>
              <p className="text-xs text-ash">Verify that the batch number printed on the vial cap or label matches the &ldquo;Batch&rdquo; header on the COA letterhead.</p>
            </div>
            <div className="rounded-xl border border-linen bg-surface p-5 space-y-1">
              <span className="font-mono text-xs font-bold text-accent">IDENTIFIER 2</span>
              <p className="font-bold text-ink">Task Number vs Laboratory Portal</p>
              <p className="text-xs text-ash">Input the task number into the lab verification system (verify.janoshik.com) to confirm the original PDF exists.</p>
            </div>
            <div className="rounded-xl border border-linen bg-surface p-5 space-y-1">
              <span className="font-mono text-xs font-bold text-accent">IDENTIFIER 3</span>
              <p className="font-bold text-ink">Nominal Strength vs Reported Mass</p>
              <p className="text-xs text-ash">Confirm whether the report quantifies net active mass (e.g., 10.34 mg) or only relative chromatographic purity.</p>
            </div>
            <div className="rounded-xl border border-linen bg-surface p-5 space-y-1">
              <span className="font-mono text-xs font-bold text-accent">IDENTIFIER 4</span>
              <p className="font-bold text-ink">Date of Analysis vs Order Date</p>
              <p className="text-xs text-ash">Confirm that the analysis was conducted within a reasonable timeframe corresponding to active production.</p>
            </div>
          </div>
        </section>

        {/* Section 6 */}
        <section id="analysis-dates" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Historical Reports vs Current Inventory
          </h2>
          <p className="text-ash leading-relaxed">
            One of the most frequent compromises in chemical supply is the use of <strong>historical reports</strong>. A supplier tests an initial pilot batch in 2024, receives a stellar 99.8% report, and continues displaying that exact same report for subsequent production runs in 2026.
          </p>
          <p className="text-ash leading-relaxed">
            This practice is scientifically indefensible. Synthesis reagents change, amino acid raw materials come from different lots, and equipment maintenance cycles introduce variability. When reviewing documentation, check the analysis date. If the report was issued years ago but the product is actively replenished, request current lot-specific testing records.
          </p>
        </section>

        {/* Section 7: Sampling Limitations */}
        <section id="sampling-limitations" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            The Statistical Reality of Sampling Limitations
          </h2>
          <p className="text-ash leading-relaxed">
            Even with an authentic, batch-matched third-party laboratory report, researchers must recognize an essential statistical truth:
          </p>
          <AnalyticalCallout title="A Batch-Matched Report Does Not Mean Every Vial Was Tested" variant="limitation">
            Analytical testing is destructive: the submitted sample is dissolved, filtered, and consumed during chromatography and mass spectrometry. Therefore, a batch-matched report represents the specific sample vial delivered to the laboratory, not every single individual vial in that production lot.
          </AnalyticalCallout>
          <p className="text-ash leading-relaxed">
            High-integrity production relies on homogeneous bulk synthesis and validated filling automation to ensure consistency across vials. However, no analytical testing facility can test 100% of finished units without destroying 100% of inventory.
          </p>
        </section>

        {/* Section 8 */}
        <section id="what-it-does-not-mean" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            What Batch-Specific Reporting Does NOT Mean
          </h2>
          <p className="text-ash leading-relaxed">
            To maintain strict compliance and scientific integrity, researchers must not over-interpret batch reports:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-ash text-sm sm:text-base">
            <li><strong>It does not mean the material is sterile:</strong> HPLC reports chemical purity, not microbiological sterility.</li>
            <li><strong>It does not establish bacterial endotoxin status:</strong> Pyrogen testing requires a separate LAL assay.</li>
            <li><strong>It does not imply human safety or efficacy:</strong> Chemical documentation provides zero assessment of biological activity in living systems.</li>
            <li><strong>It does not constitute regulatory approval:</strong> Third-party reports do not represent FDA clearance or cGMP drug certification.</li>
          </ul>
        </section>

        {/* Section 9: PSL Approach */}
        <section id="psl-approach" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            PSL Labs&apos; Lot Documentation Approach
          </h2>
          <p className="text-ash leading-relaxed">
            PSL Labs enforces a strict <strong>verification-before-release</strong> operational standard:
          </p>
          <div className="rounded-xl border border-linen bg-surface p-6 space-y-3 text-sm leading-relaxed text-ash">
            <p>
              <strong className="text-ink">1. Every Active SKU Has Published Documentation:</strong> We do not offer products for purchase under vague &ldquo;testing pending&rdquo; promises. Every active catalog item is paired with a published Janoshik COA before inventory is made available for fulfillment.
            </p>
            <p>
              <strong className="text-ink">2. Batch-Specific Scope:</strong> We do not extrapolate historical test data across different production runs. When a lot changes, new third-party analysis is completed and published.
            </p>
            <p>
              <strong className="text-ink">3. Pipeline Gating:</strong> Materials designated as &ldquo;Coming Soon&rdquo; are undergoing synthesis or analytical testing. They remain non-purchasable until third-party laboratory verification is finalized and indexed in our{" "}
              <Link href="/coa" className="text-accent underline underline-offset-2">
                COA Lookup
              </Link>.
            </p>
          </div>
        </section>

        {/* Section 10: Checklist */}
        <section id="checklist" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Batch Traceability Verification Checklist
          </h2>
          <p className="text-ash leading-relaxed">
            Follow this 8-step verification checklist whenever inspecting third-party documentation:
          </p>
          <VerificationChecklist />
          <p className="text-ash leading-relaxed pt-2">
            To continue exploring analytical standards, review our guide on{" "}
            <Link
              href="/guides/what-peptide-testing-can-establish"
              className="font-medium text-accent underline underline-offset-4 hover:opacity-80"
            >
              What Peptide Analytical Testing Can, and Cannot, Establish
            </Link>{" "}
            or inspect live reports in our{" "}
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
