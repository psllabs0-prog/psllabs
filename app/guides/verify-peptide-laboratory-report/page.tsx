import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, ShieldCheck } from "lucide-react";

import { JsonLd } from "@/components/seo/json-ld";
import { GuideLayout } from "@/components/guides/guide-layout";
import { VerificationChecklist } from "@/components/guides/verification-checklist";
import { AnalyticalCallout } from "@/components/guides/analytical-callout";
import { getGuideBySlug } from "@/lib/content/guides-data";
import { batchReports } from "@/lib/batch-reports";
import { LEGAL_ENTITY_NAME } from "@/lib/content/testing-scope";
import { createPageMetadata, SITE_URL } from "@/lib/seo";

const guide = getGuideBySlug("verify-peptide-laboratory-report")!;

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
  { id: "before-purity", label: "Verification Starts Before Interpreting Purity" },
  { id: "issuing-lab", label: "1. Identify the Issuing Laboratory" },
  { id: "task-identifier", label: "2. Locate the Task / Report Identifier" },
  { id: "independent-verification", label: "3. Verify Independently via Direct Lab Portal" },
  { id: "compound-identity", label: "4. Match Compound & Sample Identity" },
  { id: "batch-lot-match", label: "5. Match Batch & Lot Identifiers" },
  { id: "analysis-date", label: "6. Check the Analysis Date" },
  { id: "methods-performed", label: "7. Identify Which Analytical Tests Were Performed" },
  { id: "reading-results", label: "8. Reading the Reported Results Accurately" },
  { id: "what-was-not-tested", label: "9. Identify What Was NOT Tested" },
  { id: "sample-limitations", label: "10. Sample and Batch Limitations" },
  { id: "checklist", label: "11. Full Verification Checklist" },
  { id: "psl-workflow", label: "12. The PSL Labs Verification Workflow" },
];

export default function VerifyPeptideLaboratoryReportPage() {
  return (
    <>
      <JsonLd data={articleLd} />
      <JsonLd data={breadcrumbLd} />

      <GuideLayout guide={guide} tocItems={tocItems}>
        {/* Intro */}
        <section className="flex flex-col gap-4">
          <p className="text-ash leading-relaxed">
            When evaluating third-party testing documentation for research biochemicals, many buyers look straight at the purity percentage, see &ldquo;99%&rdquo;, and assume the material is verified. In rigorous laboratory procurement, that number is the <em>last</em> detail you evaluate—not the first.
          </p>
          <p className="text-ash leading-relaxed">
            A laboratory report is only as reliable as its provenance. If a document cannot be independently verified on the testing laboratory&apos;s server, if the batch identifier does not match the physical container, or if the test method does not actually measure what is claimed, the purity percentage is scientifically meaningless.
          </p>
          <p className="text-ash leading-relaxed">
            This guide outlines a systematic methodology for verifying third-party peptide laboratory reports, spotting fraudulent or misleading documentation, and auditing analytical records before integrating research materials into experimental protocols.
          </p>
        </section>

        {/* Section 1 */}
        <section id="before-purity" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Verification Starts Before Interpreting Purity
          </h2>
          <p className="text-ash leading-relaxed">
            Fraudulent, altered, or recycled laboratory reports are common across the research chemical landscape. Common distortions include:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-ash text-sm sm:text-base">
            <li><strong>Photoshopped PDFs:</strong> Altering dates, customer names, or purity percentages on legitimate historic documents.</li>
            <li><strong>Batch Disconnects:</strong> Displaying an authentic test from a high-quality pilot batch to represent subsequent untested production runs.</li>
            <li><strong>Vendor Summaries:</strong> Replacing original laboratory chromatograms with a styled table that strips out method caveats, contaminant peaks, or task numbers.</li>
            <li><strong>Borrowed Reports:</strong> Circulating reports belonging to third-party manufacturers without proof that the vendor&apos;s stock originated from that specific lot.</li>
          </ul>
          <p className="text-ash leading-relaxed">
            Because a visual document can be altered in seconds, true verification requires checking the document directly against the issuing laboratory&apos;s immutable database.
          </p>
        </section>

        {/* Section 2 */}
        <section id="issuing-lab" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            1. Identify the Issuing Laboratory
          </h2>
          <p className="text-ash leading-relaxed">
            The first step is determining who performed the analysis. A legitimate Certificate of Analysis clearly states:
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 pt-1">
            <div className="rounded-xl border border-linen bg-surface p-5 text-sm space-y-2">
              <span className="font-mono text-xs font-semibold uppercase text-accent">
                Required Laboratory Credentials
              </span>
              <ul className="list-disc pl-4 space-y-1 text-ash text-xs sm:text-sm">
                <li>Legal company name and registered business entity</li>
                <li>Physical laboratory location / mailing address</li>
                <li>Direct contact channel (email / website domain)</li>
                <li>Public verification tool or designated inquiry system</li>
              </ul>
            </div>
            <div className="rounded-xl border border-linen bg-surface p-5 text-sm space-y-2">
              <span className="font-mono text-xs font-semibold uppercase text-signal">
                Red Flags to Avoid
              </span>
              <ul className="list-disc pl-4 space-y-1 text-ash text-xs sm:text-sm">
                <li>Vague titles like &ldquo;Quality Control Laboratory&rdquo; with no legal name</li>
                <li>Cropped headers removing laboratory contact details</li>
                <li>Reports issued solely by the vendor&apos;s own sales department</li>
                <li>Unverifiable domain names with no public laboratory footprint</li>
              </ul>
            </div>
          </div>
          <p className="text-ash leading-relaxed">
            All analytical testing for PSL Labs active catalog products is performed by <strong>Janoshik Analytical</strong>, an independent third-party analytical facility specializing in chromatographic and mass spectrometric analysis of synthetic peptides.
          </p>
        </section>

        {/* Section 3 */}
        <section id="task-identifier" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            2. Locate the Task / Report Identifier
          </h2>
          <p className="text-ash leading-relaxed">
            Reputable testing laboratories index every sample submittal under an immutable unique identifier. On Janoshik reports, this is designated as the <strong>Task Number</strong> (e.g., Task #199788 or Task #226456).
          </p>
          <p className="text-ash leading-relaxed">
            The task number serves as the cryptographic anchor for the report. It allows any independent third party to locate the raw analytical data, instrument sequence files, and original signed PDF on the laboratory&apos;s server without relying on files transmitted by the vendor.
          </p>
          <AnalyticalCallout title="Missing Identifier Rule" variant="limitation">
            If a document labeled &ldquo;Certificate of Analysis&rdquo; lacks an individual task, job, or report tracking number, it is impossible to independently verify. Treat unindexed documents as vendor assertions rather than verifiable laboratory records.
          </AnalyticalCallout>
        </section>

        {/* Section 4 */}
        <section id="independent-verification" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            3. Verify Independently via Direct Lab Portal
          </h2>
          <p className="text-ash leading-relaxed">
            Independent verification means querying the issuing laboratory&apos;s own system directly, bypassing the vendor&apos;s website entirely.
          </p>
          <div className="rounded-xl border border-linen bg-surface p-6 space-y-3">
            <h3 className="font-display text-lg font-bold text-ink">
              The Janoshik Verification Mechanism:
            </h3>
            <ol className="list-decimal pl-5 space-y-2 text-ash text-sm sm:text-base">
              <li>
                Navigate to the laboratory&apos;s verification portal at{" "}
                <a
                  href="https://verify.janoshik.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-accent underline underline-offset-4 hover:opacity-80 inline-flex items-center gap-1"
                >
                  verify.janoshik.com
                  <ExternalLink className="size-3.5" aria-hidden />
                </a>.
              </li>
              <li>
                Enter the unique <strong>Task Number</strong> and corresponding <strong>Verification Key</strong> printed directly on the COA.
              </li>
              <li>
                The server displays the authentic original document directly from the laboratory database.
              </li>
              <li>
                Compare every numerical value, compound name, batch code, and chromatogram against the copy provided by the seller.
              </li>
            </ol>
            <p className="text-xs text-stone pt-2 border-t border-linen">
              Every published batch report in PSL Labs&apos;{" "}
              <Link href="/coa" className="text-accent underline underline-offset-2">
                COA Lookup
              </Link>{" "}
              includes a direct, pre-formatted verification link so researchers can execute this verification in a single click.
            </p>
          </div>
        </section>

        {/* Section 5 */}
        <section id="compound-identity" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            4. Match Compound &amp; Sample Identity
          </h2>
          <p className="text-ash leading-relaxed">
            Confirm that the sample name on the report matches your research requirement. More importantly, verify that the laboratory performed an analytical identity test rather than simply accepting the client&apos;s self-reported label.
          </p>
          <p className="text-ash leading-relaxed">
            Look for explicit notation such as &ldquo;Identity confirmed via Mass Spectrometry&rdquo; or &ldquo;Observed MW matches theoretical average MW&rdquo;. Review our foundational guide on{" "}
            <Link
              href="/guides/peptide-identity-vs-purity-vs-content"
              className="font-medium text-accent underline underline-offset-4 hover:opacity-80"
            >
              Peptide Identity vs Purity vs Content
            </Link>{" "}
            to understand why identity cannot be established from a single HPLC chromatogram without mass confirmation or authentic reference standards.
          </p>
        </section>

        {/* Section 6 */}
        <section id="batch-lot-match" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            5. Match Batch &amp; Lot Identifiers
          </h2>
          <p className="text-ash leading-relaxed">
            The batch or lot number on the report must correspond precisely to the identifier printed on your physical vial label and packing slip.
          </p>
          <p className="text-ash leading-relaxed">
            If the vial is labeled &ldquo;Lot PSL-TESA-10MG&rdquo; but the vendor supplies a report for &ldquo;Lot TESA-2024-A&rdquo;, the document does not establish the properties of the material in your hands. Synthesis runs vary in crude purity, peptide salt content, and side-product profiles. A report from a previous lot cannot be grandfathered to validate a new lot.
          </p>
          <p className="text-ash leading-relaxed">
            For detailed analysis of batch traceability, see{" "}
            <Link
              href="/guides/batch-specific-vs-generic-coa"
              className="font-medium text-accent underline underline-offset-4 hover:opacity-80"
            >
              Batch-Specific COAs vs Generic COAs: Why Lot Traceability Matters
            </Link>.
          </p>
        </section>

        {/* Section 7 */}
        <section id="analysis-date" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            6. Check the Analysis Date
          </h2>
          <p className="text-ash leading-relaxed">
            Examine both the <strong>Date of Receipt</strong> and the <strong>Date of Analysis</strong>.
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-ash text-sm sm:text-base">
            <li>
              <strong>Document Freshness:</strong> Research peptide batches are typically distributed within months of synthesis and testing. A report dated three years prior for a fast-moving research catalog suggests either stale inventory or a recycled legacy document.
            </li>
            <li>
              <strong>Degradation Considerations:</strong> Lyophilized peptides degrade over time if stored improperly. Even under -20°C storage, atmospheric moisture exposure or repeated thermal excursions can alter purity profiles. An analysis date should correspond to the active inventory cycle.
            </li>
          </ul>
        </section>

        {/* Section 8 */}
        <section id="methods-performed" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            7. Identify Which Analytical Tests Were Performed
          </h2>
          <p className="text-ash leading-relaxed">
            A comprehensive report itemizes each analytical method used. Look for specific technical details:
          </p>
          <div className="rounded-xl border border-linen bg-surface p-5 space-y-3 text-sm">
            <div className="flex items-start gap-2">
              <span className="font-mono text-accent text-xs pt-0.5">•</span>
              <p className="text-ash">
                <strong className="text-ink">Chromatographic Method:</strong> Reversed-Phase HPLC column type (e.g., C18, 4.6 × 150 mm), mobile phase solvents (water/acetonitrile with 0.1% TFA), flow rate, gradient program, and detection wavelength (214 nm or 220 nm).
              </p>
            </div>
            <div className="flex items-start gap-2">
              <span className="font-mono text-accent text-xs pt-0.5">•</span>
              <p className="text-ash">
                <strong className="text-ink">Mass Spectrometric Method:</strong> Ionization mode (ESI-MS positive mode), mass range, and observed molecular ion peaks.
              </p>
            </div>
            <div className="flex items-start gap-2">
              <span className="font-mono text-accent text-xs pt-0.5">•</span>
              <p className="text-ash">
                <strong className="text-ink">Quantitative Mass Assay:</strong> Method used to measure net mass (e.g., external standard calibration curve or nitrogen elemental assay).
              </p>
            </div>
          </div>
        </section>

        {/* Section 9 */}
        <section id="reading-results" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            8. Reading the Reported Results Accurately
          </h2>
          <p className="text-ash leading-relaxed">
            When reviewing the final results section, distinguish between primary reported values:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-ash text-sm sm:text-base">
            <li>
              <strong>Purity Area Percentage:</strong> The proportion of integrated UV peak area assigned to the target compound relative to total detectable peaks. (Review{" "}
              <Link
                href="/guides/peptide-purity-vs-content"
                className="text-accent underline underline-offset-2"
              >
                What Does 99% Peptide Purity Actually Mean?
              </Link>).
            </li>
            <li>
              <strong>Reported Net Mass:</strong> The absolute weight of active compound detected in the vial (e.g., 11.75 mg on a nominal 10 mg vial of BPC-157).
            </li>
            <li>
              <strong>Chromatogram Inspection:</strong> Inspect the chromatogram plot directly. Look for baseline drift, fronting or tailing peaks, co-eluting shoulders, and integration threshold cutoffs that might hide minor impurities.
            </li>
          </ul>
        </section>

        {/* Section 10 */}
        <section id="what-was-not-tested" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            9. Identify What Was NOT Tested
          </h2>
          <p className="text-ash leading-relaxed">
            Equally vital to reading what is on the page is cataloging what is <em>absent</em>. Unless explicitly documented by a separate specialized assay, standard HPLC/MS peptide reports do not evaluate:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-ash text-sm sm:text-base">
            <li>Microbiological sterility</li>
            <li>Bacterial endotoxin / pyrogen levels</li>
            <li>Residual heavy metals or synthesis catalysts</li>
            <li>Trifluoroacetic acid (TFA) counterion percentages</li>
            <li>Biological potency or receptor affinity kinetics</li>
          </ul>
          <p className="text-ash leading-relaxed">
            For an exhaustive analysis of testing boundaries, read our capstone guide on{" "}
            <Link
              href="/guides/what-peptide-testing-can-establish"
              className="font-medium text-accent underline underline-offset-4 hover:opacity-80"
            >
              What Peptide Analytical Testing Can—and Cannot—Establish
            </Link>.
          </p>
        </section>

        {/* Section 11 */}
        <section id="sample-limitations" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            10. Sample and Batch Limitations
          </h2>
          <p className="text-ash leading-relaxed">
            Always observe the fundamental axiom of analytical testing:
          </p>
          <AnalyticalCallout title="The Single-Vial Boundary" variant="limitation">
            A Certificate of Analysis reports data for the specific physical vial submitted to and consumed by the testing laboratory. It does not establish that every individual vial produced in that manufacturing run possesses identical mass fill, counterion ratio, or moisture content.
          </AnalyticalCallout>
        </section>

        {/* Section 12: Checklist */}
        <section id="checklist" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            11. Full Verification Checklist
          </h2>
          <p className="text-ash leading-relaxed">
            Use this 8-point checklist before accepting research documentation into institutional laboratory records:
          </p>
          <VerificationChecklist />
        </section>

        {/* Section 13: PSL Workflow */}
        <section id="psl-workflow" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            12. The PSL Labs Verification Workflow
          </h2>
          <p className="text-ash leading-relaxed">
            At PSL Labs, our documentation pipeline is designed to eliminate ambiguity and enable frictionless independent auditing:
          </p>
          <div className="rounded-xl border border-linen bg-surface p-6 space-y-4">
            <div className="flex items-center gap-2 text-accent font-mono text-xs uppercase tracking-wider">
              <ShieldCheck className="size-4 shrink-0" aria-hidden />
              <span>PSL Labs Active Catalog Verification Registry</span>
            </div>
            <p className="text-ash text-sm leading-relaxed">
              Every released batch in our active catalog is paired with a published Janoshik report. You can review the active records below directly in our system:
            </p>
            <div className="divide-y divide-linen/70 border-y border-linen text-xs font-mono">
              {batchReports.map((report) => (
                <div
                  key={report.taskNumber}
                  className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                >
                  <div className="flex flex-col">
                    <span className="font-bold text-ink text-sm">
                      {report.product} ({report.nominalStrength})
                    </span>
                    <span className="text-stone">
                      Batch: {report.batch} · Task #{report.taskNumber} · Analyzed {report.analysisDate}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-accent font-semibold">
                      {report.purityPercent
                        ? `${report.purityPercent}% HPLC`
                        : report.reportedResult?.value ?? "Assay Verified"}
                    </span>
                    <a
                      href={report.verificationUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded border border-border-strong bg-paper px-2.5 py-1 text-ink hover:text-accent hover:border-accent/40 transition-colors"
                    >
                      Verify on Janoshik
                      <ExternalLink className="size-3" aria-hidden />
                    </a>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-stone leading-relaxed">
              To query reports by lot number, task number, or product SKU, use our self-service{" "}
              <Link href="/coa" className="text-accent underline underline-offset-2">
                COA Lookup page
              </Link>.
            </p>
          </div>
        </section>
      </GuideLayout>
    </>
  );
}
