import type { Metadata } from "next";
import Link from "next/link";

import { JsonLd } from "@/components/seo/json-ld";
import { GuideLayout } from "@/components/guides/guide-layout";
import { AnalyticalCallout } from "@/components/guides/analytical-callout";
import { ComparisonTable } from "@/components/guides/comparison-table";
import { getGuideBySlug } from "@/lib/content/guides-data";
import { ghkCu50mgReport, tesamorelin10mgReport, reconstitutionSolution5mlReport } from "@/lib/batch-reports";
import { LEGAL_ENTITY_NAME } from "@/lib/content/testing-scope";
import { createPageMetadata, SITE_URL } from "@/lib/seo";
import { productPathFromHandle } from "@/lib/products/catalog";

const guide = getGuideBySlug("peptide-purity-vs-content")!;

export const metadata: Metadata = createPageMetadata({
  title: guide.seoTitle ?? guide.title,
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
  { id: "what-people-mean", label: "What people usually hear in '99%'" },
  { id: "chromatographic-purity", label: "What a purity test measures" },
  { id: "area-percentage", label: "What peak area percentage measures" },
  { id: "method-dependence", label: "Why the method changes the number" },
  { id: "purity-not-content", label: "Purity vs net peptide content" },
  { id: "purity-not-identity", label: "Purity vs identity" },
  { id: "chromatogram-context", label: "Why the chromatogram matters" },
  { id: "questions-to-ask", label: "Five questions to ask about '99%+'" },
  { id: "empirical-example", label: "Three published report examples" },
  { id: "analytical-limitations", label: "Boundaries worth remembering" },
];

const purityVsContentColumns = [
  { key: "metric", header: "Metric" },
  { key: "units", header: "Units" },
  { key: "whatItMeasures", header: "What it measures" },
  { key: "whatItIgnores", header: "What it ignores" },
];

const purityVsContentRows = [
  {
    metric: "Purity",
    units: "Percentage (%)",
    whatItMeasures: "For an HPLC area result, the target peak’s share of the integrated signal under that method.",
    whatItIgnores: "Total milligrams and anything the method does not detect or separate.",
  },
  {
    metric: "Reported amount",
    units: "Milligrams (mg)",
    whatItMeasures: "The amount of the named material reported for the tested sample.",
    whatItIgnores: "It is not itself a purity, sterility, or stability result.",
  },
  {
    metric: "Gross powder weight",
    units: "Milligrams (mg)",
    whatItMeasures: "Total weight of the freeze-dried powder including salts and moisture.",
    whatItIgnores: "It does not separate the target material from other components by weight.",
  },
  {
    metric: "Reported concentration",
    units: "For example, mg/ml",
    whatItMeasures: "The amount of a named substance per volume of solution.",
    whatItIgnores: "It is not a percentage purity or the total contents of a vial.",
  },
];

export default function PeptidePurityVsContentPage() {
  return (
    <>
      <JsonLd data={articleLd} />
      <JsonLd data={breadcrumbLd} />

      <GuideLayout guide={guide} tocItems={tocItems}>
        <section className="flex flex-col gap-4">
          <p className="text-ash leading-relaxed">
            A purity percentage and a milligram result answer different questions. When purity is reported as an HPLC peak-area percentage, 99% describes the target peak&apos;s share of the integrated signal under that test. It does not establish the number of milligrams in a vial.
          </p>
          <p className="text-ash leading-relaxed">
            Read the result label and unit together: purity in %, an amount in mg, or a concentration such as mg/ml. Keep each in its own field when comparing batches.
          </p>
          <p className="text-ash leading-relaxed">
            Below are three published PSL Labs examples: GHK-Cu, Tesamorelin, and a solution report. They show why a single &ldquo;99%+&rdquo; statement cannot replace the original results.
          </p>
        </section>

        <section id="what-people-mean" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            What people usually hear in &ldquo;99%&rdquo;
          </h2>
          <p className="text-ash leading-relaxed">
            A purity percentage alone does not support these conclusions:
          </p>
          <div className="rounded-xl border border-linen bg-surface p-5 text-sm space-y-2 text-ash">
            <p className="text-ink font-medium">Common (incorrect) assumptions:</p>
            <ul className="list-disc pl-5 space-y-1 text-xs sm:text-sm">
              <li>&ldquo;99% of the powder&apos;s weight is the target peptide.&rdquo;</li>
              <li>&ldquo;The labeled vial amount was independently measured.&rdquo;</li>
              <li>&ldquo;Every vial in the batch has identical results.&rdquo;</li>
              <li>&ldquo;Sterility, endotoxin, and every other contaminant were tested.&rdquo;</li>
            </ul>
          </div>
          <p className="text-ash leading-relaxed">
            Those are separate questions. Keep them open unless the documentation contains the relevant evidence.
          </p>
        </section>

        <section id="chromatographic-purity" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            What a purity test measures
          </h2>
          <p className="text-ash leading-relaxed">
            High-performance liquid chromatography (HPLC) separates components as a sample passes through a column. In an HPLC-UV method, a detector records light absorption over time, producing a chromatogram.
          </p>
          <p className="text-ash leading-relaxed">
            Bachem&apos;s <a href="https://www.bachem.com/knowledge-center/quality-control-of-amino-acids-peptides-a-guide/" target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-4">quality-control guide</a> describes peptide purity using the main peak&apos;s area relative to all integrated peaks. The percentage describes that measurement, not every component in the powder.
          </p>
        </section>

        <section id="area-percentage" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            How the percentage is calculated
          </h2>
          <p className="text-ash leading-relaxed">
            For an uncorrected area-percentage result, the calculation is:
          </p>
          <div className="rounded-xl border border-linen bg-surface p-5 text-sm space-y-2">
            <p className="font-mono text-xs font-semibold uppercase tracking-wider text-accent">
              Peak area calculation
            </p>
            <p className="font-mono text-ink text-sm sm:text-base">
              Area (%) = (target peak area / total integrated peak area) × 100
            </p>
          </div>
          <p className="text-ash leading-relaxed">
            Two details matter:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-ash text-sm sm:text-base">
            <li>
              <strong>Area and mass are different measurements.</strong> Detector responses can differ between compounds; a signal percentage is not automatically a weight percentage.
            </li>
            <li>
              <strong>The calculation has a defined scope.</strong> It uses peaks included by the method. It cannot account for material the method does not detect or separate.
            </li>
          </ul>
          <p className="text-sm text-ash">Waters documents the distinction between <a href="https://support.waters.com/KB_Inf/Empower_Breeze/WKB14718_How_is_the_Impurity_RRF_field_in_the_components_tab_in_the_processing_method_within_Empower_used" target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-4">area percentages and response-corrected calculations</a>. Ask which basis a report uses before comparing values.</p>
        </section>

        <section id="method-dependence" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Why the method changes the number
          </h2>
          <p className="text-ash leading-relaxed">
            Compare like with like. Column conditions, detection settings, and integration rules can affect what is separated and counted. A difference in the last decimal place is not, by itself, a ranking of two suppliers.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 pt-1 text-sm">
            <div className="rounded-xl border border-linen bg-surface p-5 space-y-2">
              <span className="font-mono text-xs font-semibold text-accent uppercase">
                Method choices
              </span>
              <ul className="list-disc pl-4 space-y-1.5 text-ash text-xs sm:text-sm">
                <li>Which separation method and detection settings were used?</li>
                <li>Which peaks were included in the reported percentage?</li>
              </ul>
            </div>
            <div className="rounded-xl border border-linen bg-surface p-5 space-y-2">
              <span className="font-mono text-xs font-semibold text-accent uppercase">
                What that does to the number
              </span>
              <ul className="list-disc pl-4 space-y-1.5 text-ash text-xs sm:text-sm">
                <li>Were the reports produced on a comparable basis?</li>
                <li>What uncertainty or reporting limits matter for your comparison?</li>
              </ul>
            </div>
          </div>
          <AnalyticalCallout title="Ask for method conditions" variant="method">
            A summary certificate may not include the full method. Ask the laboratory for the detail your work needs. Do not assume missing conditions from another report.
          </AnalyticalCallout>
        </section>

        <section id="purity-not-content" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Purity, measured amount, and powder weight
          </h2>
          <p className="text-ash leading-relaxed">
            Start with the units. These fields should not be used interchangeably:
          </p>
          <ComparisonTable
            columns={purityVsContentColumns}
            rows={purityVsContentRows}
            caption="Differences between purity, reported amount, gross powder weight, and concentration"
          />
          <p className="text-ash leading-relaxed pt-3">
            The term <strong>net peptide content</strong> also needs a definition. Bachem uses it for the fraction of peptidic material relative to non-peptidic material such as counterions and residual water. It may be expressed as a percentage, and it is not the same as HPLC purity or a vial&apos;s reported milligrams.
          </p>
          <p className="text-ash leading-relaxed">
            Do not apply a generic &ldquo;usual content&rdquo; correction to a PSL Labs report. Keep the lab&apos;s named result and unit, and ask what its assay includes if that is unclear. Source: <a href="https://www.bachem.com/knowledge-center/faq-frequently-asked-questions/" target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-4">Bachem&apos;s definitions of purity, gross weight, and net peptide content</a>.
          </p>
        </section>

        <section id="purity-not-identity" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Purity vs identity
          </h2>
          <p className="text-ash leading-relaxed">
            An HPLC area percentage describes the distribution of the measured signal. It is not, on its own, an identity result.
          </p>
          <p className="text-ash leading-relaxed">
            Read the identity evidence and method separately. A single prominent peak does not by itself establish the expected sequence or structure.
          </p>
          <p className="text-ash leading-relaxed">
            Ask the issuing laboratory how it established the named result if your work requires that detail. See{" "}
            <Link
              href="/guides/peptide-identity-vs-purity-vs-content"
              className="font-medium text-accent underline underline-offset-4 hover:opacity-80"
            >
              Peptide Identity vs Purity vs Content
            </Link>.
          </p>
        </section>

        <section id="chromatogram-context" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Why the chromatogram matters
          </h2>
          <p className="text-ash leading-relaxed">
            If you need to review the chromatogram, request the complete trace and the laboratory&apos;s explanation. A summary certificate may not include it. Useful questions include:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-ash text-sm sm:text-base">
            <li>Which peak was assigned to the target material?</li>
            <li>Which other peaks were included in the calculation?</li>
            <li>Does the image show the full run and readable axes?</li>
            <li>Are there method or integration notes needed to interpret the result?</li>
          </ul>
        </section>

        <section id="questions-to-ask" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Five questions to ask about &ldquo;99%+&rdquo;
          </h2>
          <div className="space-y-3 pt-1">
            <div className="rounded-xl border border-linen bg-surface p-4 text-sm">
              <span className="font-mono text-xs font-bold text-accent">QUESTION 1</span>
              <p className="text-ink font-semibold mt-1">What detection wavelength was used?</p>
              <p className="text-xs text-ash mt-0.5">Keep the method and detection settings with any comparison.</p>
            </div>
            <div className="rounded-xl border border-linen bg-surface p-4 text-sm">
              <span className="font-mono text-xs font-bold text-accent">QUESTION 2</span>
              <p className="text-ink font-semibold mt-1">What evidence supports identity?</p>
              <p className="text-xs text-ash mt-0.5">Read the stated identity method rather than inferring it from purity.</p>
            </div>
            <div className="rounded-xl border border-linen bg-surface p-4 text-sm">
              <span className="font-mono text-xs font-bold text-accent">QUESTION 3</span>
              <p className="text-ink font-semibold mt-1">Was an amount measured?</p>
              <p className="text-xs text-ash mt-0.5">Distinguish the lab&apos;s result from the nominal product label.</p>
            </div>
            <div className="rounded-xl border border-linen bg-surface p-4 text-sm">
              <span className="font-mono text-xs font-bold text-accent">QUESTION 4</span>
              <p className="text-ink font-semibold mt-1">Can you verify the report on the lab&apos;s server?</p>
              <p className="text-xs text-ash mt-0.5">Use the task number and unique key on Janoshik&apos;s verification form.</p>
            </div>
            <div className="rounded-xl border border-linen bg-surface p-4 text-sm">
              <span className="font-mono text-xs font-bold text-accent">QUESTION 5</span>
              <p className="text-ink font-semibold mt-1">What else was not tested?</p>
              <p className="text-xs text-ash mt-0.5">Keep missing required results marked as not reported until supporting data is available.</p>
            </div>
          </div>
        </section>

        <section id="empirical-example" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Three published report examples
          </h2>
          <p className="text-ash leading-relaxed">
            These values come from the named PSL Labs batch reports. Open each file to compare the fields yourself. The results describe the tested sample; they are not blanket claims about every product or batch.
          </p>
          <div className="flex flex-col gap-4">
            {[ghkCu50mgReport, tesamorelin10mgReport].map((report) => (
              <article key={report.taskNumber} className="public-section-card p-6 sm:p-8">
                <h3 className="font-display text-xl font-bold text-ink">{report.product} · {report.nominalStrength} label</h3>
                <p className="mt-2 break-words text-xs text-ash">Batch {report.batch} · Task #{report.taskNumber} · {report.analysisDate}</p>
                <dl className="mt-5 grid gap-4 sm:grid-cols-2">
                  <div><dt className="text-xs text-ash">Reported purity</dt><dd className="mt-1 font-mono text-2xl text-ink">{report.purityPercent}%</dd></div>
                  <div><dt className="text-xs text-ash">Reported {report.product} amount</dt><dd className="mt-1 font-mono text-2xl text-ink">{report.reportedAmountMg} mg</dd></div>
                </dl>
                <p className="mt-5 border-t border-linen pt-4 text-sm leading-relaxed text-ash">
                  {report.productHandle === "tesamorelin"
                    ? "This purity result is below 99%. Keep the exact percentage with this batch; do not replace it with a general ‘99%+’ claim. The amount is a separate result."
                    : "The amount line names GHK-Cu, and the original file also lists GHK and copper content. Keep those labels intact. Subtracting purity from 100 does not identify the remaining material or turn it into a mass measurement."}
                </p>
                <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
                  <a href={report.reportUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-accent underline underline-offset-4">Open report file</a>
                  <a href={report.verificationUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-accent underline underline-offset-4">Verify with Janoshik</a>
                  <Link href={productPathFromHandle(report.productHandle)} className="inline-flex min-h-11 items-center text-accent underline underline-offset-4">Product details</Link>
                </div>
              </article>
            ))}
            <article className="public-section-card p-6 sm:p-8">
              <h3 className="font-display text-xl font-bold text-ink">Reconstitution Solution · {reconstitutionSolution5mlReport.nominalStrength} label</h3>
              <p className="mt-2 break-words text-xs text-ash">Batch {reconstitutionSolution5mlReport.batch} · Task #{reconstitutionSolution5mlReport.taskNumber}</p>
              <dl className="mt-5">
                <dt className="text-xs text-ash">Reported {reconstitutionSolution5mlReport.reportedResult?.label} concentration</dt>
                <dd className="mt-1 font-mono text-2xl text-ink">{reconstitutionSolution5mlReport.reportedResult?.value}</dd>
              </dl>
              <p className="mt-4 text-sm leading-relaxed text-ash">This file reports benzyl alcohol concentration. It contains no peptide purity percentage. The concentration result alone does not establish sterility or an endotoxin result.</p>
              <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
                <a href={reconstitutionSolution5mlReport.reportUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-accent underline underline-offset-4">Open report file</a>
                <a href={reconstitutionSolution5mlReport.verificationUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-accent underline underline-offset-4">Verify with Janoshik</a>
              </div>
            </article>
          </div>
        </section>

        <section id="analytical-limitations" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Boundaries worth remembering
          </h2>
          <div className="space-y-3">
            <AnalyticalCallout title="Keep the scope of each result" variant="limitation">
              A report supports the measurements it includes. It does not establish suitability for human or veterinary use. These materials are for laboratory research only.
            </AnalyticalCallout>
            <AnalyticalCallout title="Marketing phrases are not test results" variant="limitation">
              Keep the product, batch, task number, result label, value, and unit together when sharing a result. A broad purity slogan loses that context.
            </AnalyticalCallout>
          </div>
          <p className="text-ash leading-relaxed pt-2">
            To verify original reports, continue with{" "}
            <Link
              href="/guides/verify-peptide-laboratory-report"
              className="font-medium text-accent underline underline-offset-4 hover:opacity-80"
            >
              How to Verify a Peptide Laboratory Report
            </Link>{" "}
            or{" "}
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
