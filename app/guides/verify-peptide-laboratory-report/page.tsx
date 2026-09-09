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
  { id: "before-purity", label: "Start before the purity number" },
  { id: "issuing-lab", label: "Who issued the report?" },
  { id: "task-identifier", label: "Find the task or report ID" },
  { id: "independent-verification", label: "Check it on the lab's site" },
  { id: "compound-identity", label: "Match the compound" },
  { id: "batch-lot-match", label: "Match the batch" },
  { id: "analysis-date", label: "Check the analysis date" },
  { id: "methods-performed", label: "See which tests were run" },
  { id: "reading-results", label: "Read the results carefully" },
  { id: "what-was-not-tested", label: "Note what was left out" },
  { id: "sample-limitations", label: "Sample and batch limits" },
  { id: "checklist", label: "Full verification checklist" },
  { id: "psl-workflow", label: "How PSL Labs verification works" },
];

export default function VerifyPeptideLaboratoryReportPage() {
  return (
    <>
      <JsonLd data={articleLd} />
      <JsonLd data={breadcrumbLd} />

      <GuideLayout guide={guide} tocItems={tocItems}>
        <section className="flex flex-col gap-4">
          <p className="text-ash leading-relaxed">
            To verify a peptide lab report, check the batch number, confirm the testing lab, and look up the report on the lab&apos;s own website before you trust the purity number.
          </p>
          <p className="text-ash leading-relaxed">
            A report is only as strong as where it came from. If you cannot open it on the lab&apos;s server, if the batch ID does not match your vial, or if the test method does not match the claim, the purity figure is not reliable evidence.
          </p>
          <p className="text-ash leading-relaxed">
            This guide walks through each step: how to verify third-party reports, spot weak or recycled paperwork, and check records before you rely on them.
          </p>
        </section>

        <section id="before-purity" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Start before the purity number
          </h2>
          <p className="text-ash leading-relaxed">
            Altered or recycled reports are common. Watch for these patterns:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-ash text-sm sm:text-base">
            <li><strong>Edited PDFs:</strong> Dates, names, or purity values changed on an older real file.</li>
            <li><strong>Batch mismatches:</strong> A real test from one lot reused for later untested runs.</li>
            <li><strong>Vendor summaries:</strong> Styled tables that leave out test graphs, method notes, or task numbers.</li>
            <li><strong>Borrowed reports:</strong> Documents from another source with no proof your stock came from that lot.</li>
          </ul>
          <p className="text-ash leading-relaxed">
            A screenshot can be changed quickly. Real verification means checking the lab&apos;s live record.
          </p>
        </section>

        <section id="issuing-lab" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Who issued the report?
          </h2>
          <p className="text-ash leading-relaxed">
            First, identify who actually ran the analysis. A solid Certificate of Analysis should make that obvious:
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 pt-1">
            <div className="rounded-xl border border-linen bg-surface p-5 text-sm space-y-2">
              <span className="font-mono text-xs font-semibold uppercase text-accent">
                What you want to see
              </span>
              <ul className="list-disc pl-4 space-y-1 text-ash text-xs sm:text-sm">
                <li>Legal company name</li>
                <li>Laboratory address</li>
                <li>Direct contact channel or website</li>
                <li>A public verification tool or inquiry path</li>
              </ul>
            </div>
            <div className="rounded-xl border border-linen bg-surface p-5 text-sm space-y-2">
              <span className="font-mono text-xs font-semibold uppercase text-signal">
                Red flags
              </span>
              <ul className="list-disc pl-4 space-y-1 text-ash text-xs sm:text-sm">
                <li>Vague titles like &ldquo;Quality Control Laboratory&rdquo; with no legal name</li>
                <li>Cropped headers that remove contact details</li>
                <li>Reports issued only by the vendor&apos;s sales team</li>
                <li>Domains with no public laboratory footprint</li>
              </ul>
            </div>
          </div>
          <p className="text-ash leading-relaxed">
            Testing for PSL Labs active catalog products is performed by <strong>Janoshik Analytical</strong>, an independent lab focused on peptide testing.
          </p>
        </section>

        <section id="task-identifier" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Find the task or report ID
          </h2>
          <p className="text-ash leading-relaxed">
            Reputable labs index each submission under a unique ID. On Janoshik reports, that is the <strong>Task Number</strong> (for example, Task #199788 or Task #226456).
          </p>
          <p className="text-ash leading-relaxed">
            That ID is the anchor. Anyone can use it to find the original signed PDF and related lab data without depending on a file the vendor emailed you.
          </p>
          <AnalyticalCallout title="No identifier, no independent check" variant="limitation">
            If a document called a Certificate of Analysis has no task, job, or report tracking number, you cannot verify it independently. Treat it as a vendor claim, not a lab record.
          </AnalyticalCallout>
        </section>

        <section id="independent-verification" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Check it on the lab&apos;s site
          </h2>
          <p className="text-ash leading-relaxed">
            Independent verification means querying the lab&apos;s own system, not only the seller&apos;s website.
          </p>
          <div className="rounded-xl border border-linen bg-surface p-6 space-y-3">
            <h3 className="font-display text-lg font-bold text-ink">
              Janoshik verification, step by step
            </h3>
            <ol className="list-decimal pl-5 space-y-2 text-ash text-sm sm:text-base">
              <li>
                Open{" "}
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
                Enter the <strong>Task Number</strong> and <strong>Verification Key</strong> printed on the COA.
              </li>
              <li>
                Confirm the server returns the original document from the lab database.
              </li>
              <li>
                Compare numbers, compound name, batch code, and chromatogram with the copy you received.
              </li>
            </ol>
            <p className="text-xs text-stone pt-2 border-t border-linen">
              Every published batch report in PSL Labs&apos;{" "}
              <Link href="/coa" className="text-accent underline underline-offset-2">
                COA Lookup
              </Link>{" "}
              includes a direct verification link so you can do this in one click.
            </p>
          </div>
        </section>

        <section id="compound-identity" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Match the compound
          </h2>
          <p className="text-ash leading-relaxed">
            Confirm the sample name matches what you ordered. More importantly, look for an actual identity test, not just the client&apos;s label accepted at face value.
          </p>
          <p className="text-ash leading-relaxed">
            Useful wording includes &ldquo;Identity confirmed via Mass Spectrometry&rdquo; or &ldquo;Observed MW matches theoretical average MW.&rdquo; Identity testing measures molecular mass. A purity test alone does not confirm structure. For the fuller distinction, see{" "}
            <Link
              href="/guides/peptide-identity-vs-purity-vs-content"
              className="font-medium text-accent underline underline-offset-4 hover:opacity-80"
            >
              Peptide Identity vs Purity vs Content
            </Link>.
          </p>
        </section>

        <section id="batch-lot-match" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Match the batch
          </h2>
          <p className="text-ash leading-relaxed">
            The batch or lot on the report should match the vial label and packing slip.
          </p>
          <p className="text-ash leading-relaxed">
            If the vial says &ldquo;Lot PSL-TESA-10MG&rdquo; and the report says &ldquo;Lot TESA-2024-A,&rdquo; that document does not describe the material in your hands. Each production run can differ in purity, salt content, and byproducts. An older batch report does not cover a new batch.
          </p>
          <p className="text-ash leading-relaxed">
            More on that in{" "}
            <Link
              href="/guides/batch-specific-vs-generic-coa"
              className="font-medium text-accent underline underline-offset-4 hover:opacity-80"
            >
              Batch-Specific COAs vs Generic COAs: Why Lot Traceability Matters
            </Link>.
          </p>
        </section>

        <section id="analysis-date" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Check the analysis date
          </h2>
          <p className="text-ash leading-relaxed">
            Look at both the receipt date and the analysis date.
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-ash text-sm sm:text-base">
            <li>
              <strong>Document freshness:</strong> Research peptide lots are usually sold within months of testing. A report from years ago on a fast-moving product can mean stale stock or a recycled file.
            </li>
            <li>
              <strong>Storage context:</strong> Freeze-dried peptides can degrade with moisture or temperature swings. The analysis date should still make sense for the stock you are buying.
            </li>
          </ul>
        </section>

        <section id="methods-performed" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            See which tests were run
          </h2>
          <p className="text-ash leading-relaxed">
            A useful report names each method. Look for specifics like these:
          </p>
          <div className="rounded-xl border border-linen bg-surface p-5 space-y-3 text-sm">
            <div className="flex items-start gap-2">
              <span className="font-mono text-accent text-xs pt-0.5">•</span>
              <p className="text-ash">
                <strong className="text-ink">Purity test:</strong> Column type, solvents, flow rate, gradient, and detection wavelength.
              </p>
            </div>
            <div className="flex items-start gap-2">
              <span className="font-mono text-accent text-xs pt-0.5">•</span>
              <p className="text-ash">
                <strong className="text-ink">Identity testing:</strong> How molecular mass was measured and what ions were observed.
              </p>
            </div>
            <div className="flex items-start gap-2">
              <span className="font-mono text-accent text-xs pt-0.5">•</span>
              <p className="text-ash">
                <strong className="text-ink">Quantitative assay:</strong> How net mass was measured (standard curve or elemental assay).
              </p>
            </div>
          </div>
        </section>

        <section id="reading-results" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Read the results carefully
          </h2>
          <p className="text-ash leading-relaxed">
            In the results section, keep these values distinct:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-ash text-sm sm:text-base">
            <li>
              <strong>Purity percentage:</strong> Share of the test signal assigned to the target versus other detected peaks. See{" "}
              <Link
                href="/guides/peptide-purity-vs-content"
                className="text-accent underline underline-offset-2"
              >
                What Does 99% Peptide Purity Actually Mean?
              </Link>.
            </li>
            <li>
              <strong>Reported net mass:</strong> Absolute weight of active compound found in the vial (for example, 11.75 mg on a nominal 10 mg BPC-157 vial).
            </li>
            <li>
              <strong>Chromatogram:</strong> The test graph over time. Check for a stable baseline, clean peak shapes, and whether small peaks were counted or cut off.
            </li>
          </ul>
        </section>

        <section id="what-was-not-tested" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Note what was left out
          </h2>
          <p className="text-ash leading-relaxed">
            The report only covers the tests shown on the original laboratory file. A standard peptide report typically does not cover sterility, endotoxins, heavy metals, or biological potency unless listed. For more detail, see{" "}
            <Link
              href="/guides/what-peptide-testing-can-establish"
              className="font-medium text-accent underline underline-offset-4 hover:opacity-80"
            >
              What Peptide Analytical Testing Can, and Cannot, Establish
            </Link>.
          </p>
        </section>

        <section id="sample-limitations" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Sample and batch limits
          </h2>
          <AnalyticalCallout title="One vial was tested" variant="limitation">
            A Certificate of Analysis describes the vial the lab received and tested. It does not prove every vial from that run is identical.
          </AnalyticalCallout>
        </section>

        <section id="checklist" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Full verification checklist
          </h2>
          <p className="text-ash leading-relaxed">
            Use this checklist before filing a report into lab records:
          </p>
          <VerificationChecklist />
        </section>

        <section id="psl-workflow" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            How PSL Labs verification works
          </h2>
          <p className="text-ash leading-relaxed">
            Our documentation pipeline is built so you can audit without guesswork:
          </p>
          <div className="rounded-xl border border-linen bg-surface p-6 space-y-4">
            <div className="flex items-center gap-2 text-accent font-mono text-xs uppercase tracking-wider">
              <ShieldCheck className="size-4 shrink-0" aria-hidden />
              <span>PSL Labs Active Catalog Verification Registry</span>
            </div>
            <p className="text-ash text-sm leading-relaxed">
              Every released batch in our active catalog is paired with a published Janoshik report. Current records:
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
                        ? `${report.purityPercent}% purity`
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
              To search by lot, task number, or SKU, use{" "}
              <Link href="/coa" className="text-accent underline underline-offset-2">
                View Batch Reports
              </Link>
              . For method detail, see{" "}
              <Link href="/testing" className="text-accent underline underline-offset-2">
                See Testing Details
              </Link>.
            </p>
          </div>
        </section>
      </GuideLayout>
    </>
  );
}
