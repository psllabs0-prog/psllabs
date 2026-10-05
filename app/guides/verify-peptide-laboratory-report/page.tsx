import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, ShieldCheck } from "lucide-react";

import { JsonLd } from "@/components/seo/json-ld";
import { GuideLayout } from "@/components/guides/guide-layout";
import { VerificationChecklist } from "@/components/guides/verification-checklist";
import { AnalyticalCallout } from "@/components/guides/analytical-callout";
import { getGuideBySlug } from "@/lib/content/guides-data";
import { getAvailableBatchReports, tesamorelin10mgReport } from "@/lib/batch-reports";
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
  { id: "reading-results", label: "A real report, field by field" },
  { id: "what-was-not-tested", label: "Note what was left out" },
  { id: "sample-limitations", label: "Sample and batch limits" },
  { id: "checklist", label: "Full verification checklist" },
  { id: "psl-workflow", label: "How PSL Labs verification works" },
];

const recordChecklist = [
  { step: 1, title: "Identify the material", description: "Record the product, labeled strength, supplier, and batch or lot on the package." },
  { step: 2, title: "Keep the original report", description: "Save the complete file, the laboratory, report or task ID, and verification link." },
  { step: 3, title: "Record the match", description: "Compare the laboratory record with your copy. Note missing or different fields and who resolved them." },
  { step: 4, title: "Keep each result with its unit", description: "Record purity, amount, or concentration separately. Use ‘not reported’ when a field is absent." },
  { step: 5, title: "Keep dates separate", description: "Record the analysis date and the date you checked the report. Neither is automatically the product’s expiry date." },
  { step: 6, title: "Leave a review note", description: "List the tests your work requires, missing information, and the person responsible for accepting the material for that work." },
];

export default function VerifyPeptideLaboratoryReportPage() {
  const reports = getAvailableBatchReports();
  const example = tesamorelin10mgReport;
  return (
    <>
      <JsonLd data={articleLd} />
      <JsonLd data={breadcrumbLd} />

      <GuideLayout guide={guide} tocItems={tocItems}>
        <section className="flex flex-col gap-4">
          <p className="text-ash leading-relaxed">
            Open the laboratory record, match the batch, then read the results with their units. Those three checks are a useful starting point before adding a report to your research records.
          </p>
          <p className="text-ash leading-relaxed">
            Have the full report and the batch or lot on the product ready. If you have not ordered yet, ask which documented batch is being supplied.
          </p>
          <p className="text-ash leading-relaxed">
            Below, a published PSL Labs report shows what to compare. You can use the same record checks when reviewing another supplier or preparing documentation for a research partner.
          </p>
        </section>

        <section id="before-purity" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Start before the purity number
          </h2>
          <p className="text-ash leading-relaxed">
            Ask three questions before comparing percentages:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-ash text-sm sm:text-base">
            <li><strong>Source:</strong> Can the issuing lab confirm the report?</li>
            <li><strong>Match:</strong> Does it cover the product and batch you are reviewing?</li>
            <li><strong>Scope:</strong> Does it contain the measurements your work requires?</li>
          </ul>
          <p className="text-ash leading-relaxed">
            A genuine report can still be the wrong report for your order. A matching report can still leave a required test unanswered.
          </p>
        </section>

        <section id="issuing-lab" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Who issued the report?
          </h2>
          <p className="text-ash leading-relaxed">
            Find the laboratory name and its own website or contact details. Use the issuing lab&apos;s verification or inquiry process.
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
            PSL Labs&apos; published catalog reports name <strong>Janoshik</strong>. If another lab has no public lookup, contact it through an independently checked channel. A missing online lookup is a reason to ask, not proof that a report is false.
          </p>
        </section>

        <section id="task-identifier" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Find the task number and unique key
          </h2>
          <p className="text-ash leading-relaxed">
            Janoshik&apos;s verification form asks for the <strong>task number</strong> and the <strong>unique key</strong>. Both appear on the published report. The task number alone is not enough for that form.
          </p>
          <p className="text-ash leading-relaxed">
            Our example is task #{example.taskNumber}. Open the complete file for its key; do not try to reconstruct a key from the product name.
          </p>
          <p className="text-sm text-ash">Source: <a href="https://janoshik.com/verification/" target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-4">Janoshik&apos;s verification form</a>.</p>
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
                  href="https://janoshik.com/verification/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-accent underline underline-offset-4 hover:opacity-80 inline-flex items-center gap-1"
                >
                  Janoshik&apos;s verification page
                  <ExternalLink className="size-3.5" aria-hidden />
                </a>.
              </li>
              <li>
                Enter the <strong>Task Number</strong> and <strong>Verification Key</strong> printed on the COA.
              </li>
              <li>
                Check that you are on the laboratory&apos;s domain, then compare its record with your copy.
              </li>
              <li>
                Compare sample name, batch, task number, dates, result labels, values, and units. Save the file and link with the date of your check.
              </li>
            </ol>
            <p className="text-xs text-stone pt-2 border-t border-linen">
              PSL Labs&apos;{" "}
              <Link href="/coa" className="text-accent underline underline-offset-2">
                Batch Reports
              </Link>{" "}
              includes report files and verification links. A link may open a particular result or the lookup form; have the full report available for either path. If lookup fails or fields differ, ask the lab or supplier to resolve the difference before relying on the file.
            </p>
          </div>
        </section>

        <section id="compound-identity" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Match the compound
          </h2>
          <p className="text-ash leading-relaxed">
            Compare the submitted sample name with the named result. A sample label identifies what was submitted; it does not, by itself, tell you how identity was assessed.
          </p>
          <p className="text-ash leading-relaxed">
            If identity confirmation is needed for your work, check the method and evidence or ask the lab. Do not infer a specific identity method just because a purity percentage appears. See{" "}
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
            Compare the report&apos;s batch field with the package, label, and available order documentation. Product names and strength alone do not establish a batch match.
          </p>
          <p className="text-ash leading-relaxed">
            For our Tesamorelin example, the report&apos;s batch field is <strong className="break-words">{example.batch}</strong>. If your package has a different code or no readable code, request the supplier&apos;s documented link to the tested batch. Keep the discrepancy open until it is resolved.
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
            Keep the sample-received and analysis dates with the report. In our example, the analysis date is {example.analysisDate}.
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-ash text-sm sm:text-base">
            <li>
              <strong>Different dates answer different questions:</strong> A test date is not a manufacturing date, expiry date, or stability study.
            </li>
            <li>
              <strong>Keep the batch match:</strong> A more recent report for another batch does not replace the report for the batch you have. Ask separately for any storage or stability information your work requires.
            </li>
          </ul>
        </section>

        <section id="methods-performed" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            See which tests were run
          </h2>
          <p className="text-ash leading-relaxed">
            Read the requested tests, results, and comments. A summary report may not include the full method. When your work requires more detail, ask about:
          </p>
          <div className="rounded-xl border border-linen bg-surface p-5 space-y-3 text-sm">
            <div className="flex items-start gap-2">
              <span className="font-mono text-accent text-xs pt-0.5">•</span>
              <p className="text-ash">
                <strong className="text-ink">Purity:</strong> The method, detection wavelength, and how peaks were counted.
              </p>
            </div>
            <div className="flex items-start gap-2">
              <span className="font-mono text-accent text-xs pt-0.5">•</span>
              <p className="text-ash">
                <strong className="text-ink">Identity:</strong> What evidence supports the named result and how it was obtained.
              </p>
            </div>
            <div className="flex items-start gap-2">
              <span className="font-mono text-accent text-xs pt-0.5">•</span>
              <p className="text-ash">
                <strong className="text-ink">Reported amount:</strong> What the value measures, its units, calibration basis, and uncertainty if needed.
              </p>
            </div>
          </div>
        </section>

        <section id="reading-results" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            A real report, field by field
          </h2>
          <div className="public-section-card p-6 sm:p-8">
            <p className="mono text-accent">{example.product} · Task #{example.taskNumber}</p>
            <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
              <div><dt className="text-ash">Batch</dt><dd className="mt-1 break-words font-semibold text-ink">{example.batch}</dd></div>
              <div><dt className="text-ash">Analysis date</dt><dd className="mt-1 font-semibold text-ink">{example.analysisDate}</dd></div>
              <div><dt className="text-ash">Reported purity</dt><dd className="mt-1 font-mono text-xl text-ink">{example.purityPercent}%</dd></div>
              <div><dt className="text-ash">Reported Tesamorelin amount</dt><dd className="mt-1 font-mono text-xl text-ink">{example.reportedAmountMg} mg</dd></div>
            </dl>
            <p className="mt-5 border-t border-linen pt-4 text-sm leading-relaxed text-ash">Record both results as printed. This is not a &ldquo;99%+&rdquo; result, and the milligram value is a separate measurement. The product&apos;s {example.nominalStrength} label is the nominal strength, not the laboratory result.</p>
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
              <a href={example.reportUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-accent underline underline-offset-4">Open report file</a>
              <a href={example.verificationUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 text-accent underline underline-offset-4">Verify with Janoshik <ExternalLink className="size-3.5" aria-hidden /></a>
            </div>
          </div>
          <p className="text-ash leading-relaxed">For the distinction between percentage, milligrams, and concentration, see <Link href="/guides/peptide-purity-vs-content" className="text-accent underline underline-offset-4">purity versus amount</Link>.</p>
        </section>

        <section id="what-was-not-tested" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Note what was left out
          </h2>
          <p className="text-ash leading-relaxed">
            The report supports the results it contains. If sterility, endotoxin, residual-solvent, or another required result is absent, record it as not reported on that file. Request a separate result when needed rather than treating a high purity percentage as an answer. See{" "}
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
          <AnalyticalCallout title="A report describes the tested sample" variant="limitation">
            The result belongs to the sample identified by the laboratory. The report alone does not establish that every vial is identical, document the full supply chain, or establish suitability for a particular experiment.
          </AnalyticalCallout>
        </section>

        <section id="checklist" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Save a useful verification record
          </h2>
          <p className="text-ash leading-relaxed">
            Use these fields in your lab&apos;s receiving record or a partner&apos;s documentation review. Keep unanswered questions alongside the results.
          </p>
          <VerificationChecklist items={recordChecklist} />
        </section>

        <section id="psl-workflow" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            How PSL Labs verification works
          </h2>
          <p className="text-ash leading-relaxed">
            Open the matching file below, then confirm it with the laboratory. Results apply to the sample and batch named on that report.
          </p>
          <div className="rounded-xl border border-linen bg-surface p-6 space-y-4">
            <div className="flex items-center gap-2 text-accent font-mono text-xs uppercase tracking-wider">
              <ShieldCheck className="size-4 shrink-0" aria-hidden />
              <span>Published batch records</span>
            </div>
            <p className="text-ash text-sm leading-relaxed">
              Keep the report&apos;s result labels with its values. A concentration result for a solution is not a peptide purity percentage.
            </p>
            <div className="divide-y divide-linen/70 border-y border-linen text-xs font-mono">
              {reports.map((report) => (
                <div
                  key={report.taskNumber}
                  className="py-4 flex flex-col gap-2"
                >
                  <div className="flex flex-col">
                    <span className="font-bold text-ink text-sm">
                      {report.product} ({report.nominalStrength})
                    </span>
                    <span className="break-words text-stone">
                      Batch: {report.batch} · Task #{report.taskNumber} · Analyzed {report.analysisDate}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <span className="text-accent font-semibold">
                      {report.purityPercent !== undefined
                        ? `${report.purityPercent}% purity`
                        : report.reportedResult
                          ? `${report.reportedResult.label}: ${report.reportedResult.value}`
                          : "See report for results"}
                    </span>
                    <a href={report.reportUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-accent underline underline-offset-4">Open report</a>
                    <a
                      href={report.verificationUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-11 items-center gap-1 rounded border border-border-strong bg-paper px-3 py-2 text-ink hover:text-accent hover:border-accent/40 transition-colors"
                    >
                      Laboratory verification
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
            <p className="text-sm leading-relaxed text-ash">Need help matching a package? <Link href="/contact" className="text-accent underline underline-offset-4">Contact PSL Labs</Link> with the product, batch code, and task number. Include your order reference privately if it concerns an existing order.</p>
          </div>
        </section>
      </GuideLayout>
    </>
  );
}
