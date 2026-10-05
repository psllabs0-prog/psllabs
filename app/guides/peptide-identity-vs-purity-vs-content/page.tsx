import type { Metadata } from "next";
import Link from "next/link";

import { JsonLd } from "@/components/seo/json-ld";
import { GuideLayout } from "@/components/guides/guide-layout";
import { ComparisonTable } from "@/components/guides/comparison-table";
import { AnalyticalCallout } from "@/components/guides/analytical-callout";
import { getGuideBySlug } from "@/lib/content/guides-data";
import { retatrutideBlackTopReport } from "@/lib/batch-reports";
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
  { id: "three-questions", label: "Three questions, not one number" },
  { id: "identity", label: "What does identity tell you?" },
  { id: "purity", label: "What does purity tell you?" },
  { id: "content", label: "What does content tell you?" },
  { id: "comparison-matrix", label: "Side-by-side comparison" },
  { id: "how-they-relate", label: "How the three results relate" },
  { id: "report-example", label: "Reading a real report" },
  { id: "untested-attributes", label: "What needs separate tests" },
  { id: "analytical-limitations", label: "Practical limits" },
];

const comparisonColumns = [
  { key: "attribute", header: "Test type" },
  { key: "question", header: "Question it answers" },
  { key: "method", header: "Common method" },
  { key: "notEstablished", header: "What it does not show" },
];

const comparisonRows = [
  {
    attribute: "Identity",
    question: "Is the expected peptide present in the sample?",
    method: "Identity testing (mass spectrometry) and retention time matching",
    notEstablished: "Purity %, net vial mass, sterility, or shortened sequences.",
  },
  {
    attribute: "Purity",
    question: "For an HPLC area result, what share of the integrated signal belongs to the target peak?",
    method: "Laboratory purity test (HPLC) with UV detection",
    notEstablished: "Molecular identity by itself, net milligrams, or salts that do not absorb UV.",
  },
  {
    attribute: "Reported amount / assay",
    question: "What quantity did the lab measure, using the result's stated unit and method?",
    method: "Quantitative method identified by the laboratory",
    notEstablished: "Sterility, endotoxins, counterion ratios, or biological activity.",
  },
  {
    attribute: "Sterility and endotoxins",
    question: "Is the vial free of live microbes and bacterial toxins?",
    method: "Microbial culture and LAL endotoxin test",
    notEstablished: "Identity, purity, or content from a standard peptide report.",
  },
];

export default function PeptideIdentityVsPurityVsContentPage() {
  return (
    <>
      <JsonLd data={articleLd} />
      <JsonLd data={breadcrumbLd} />

      <GuideLayout guide={guide} tocItems={tocItems}>
        <section className="flex flex-col gap-4">
          <p className="text-ash leading-relaxed">
            A lab report often gets reduced to one number, like 99.2% or 99.8% purity. That number is useful, but it answers only one of three different questions.
          </p>
          <p className="text-ash leading-relaxed">
            <strong>Identity</strong> asks whether the evidence matches the expected compound. <strong>Purity</strong> describes the result of a purity method, such as the target peak&apos;s share of an HPLC signal. <strong>Amount</strong> records a measured quantity. Terms such as content and assay need the lab&apos;s definition and unit.
          </p>
          <p className="text-ash leading-relaxed">
            Mixing these up can throw off your work. A correctly identified peptide can still carry other compounds. A high purity score can still sit in an underfilled vial. This guide walks through each result and how to read them together on reports in our{" "}
            <Link
              href="/coa"
              className="font-medium text-accent underline underline-offset-4 hover:opacity-80"
            >
              COA Lookup
            </Link>{" "}
            and{" "}
            <Link
              href="/testing"
              className="font-medium text-accent underline underline-offset-4 hover:opacity-80"
            >
              Testing Methodology
            </Link>{" "}
            pages.
          </p>
        </section>

        <section id="three-questions" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Three questions, not one number
          </h2>
          <p className="text-ash leading-relaxed">
            When reading a lab report, keep these three questions separate. Check which tests the lab actually performed:
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 pt-2">
            <div className="rounded-xl border border-linen bg-surface p-5">
              <span className="font-mono text-xs font-bold text-accent">QUESTION 1</span>
              <h3 className="mt-1 font-display text-lg font-bold text-ink">Identity</h3>
              <p className="mt-2 text-xs leading-relaxed text-ash">
                <em>&ldquo;Is this the correct peptide?&rdquo;</em> Checks molecular mass and how the sample behaves in the test.
              </p>
            </div>
            <div className="rounded-xl border border-linen bg-surface p-5">
              <span className="font-mono text-xs font-bold text-accent">QUESTION 2</span>
              <h3 className="mt-1 font-display text-lg font-bold text-ink">Purity</h3>
              <p className="mt-2 text-xs leading-relaxed text-ash">
                <em>&ldquo;What does the purity method measure?&rdquo;</em> For HPLC area results, compare integrated peak signals rather than assuming a weight percentage.
              </p>
            </div>
            <div className="rounded-xl border border-linen bg-surface p-5">
              <span className="font-mono text-xs font-bold text-accent">QUESTION 3</span>
              <h3 className="mt-1 font-display text-lg font-bold text-ink">Content</h3>
              <p className="mt-2 text-xs leading-relaxed text-ash">
                <em>&ldquo;What quantity or fraction is reported?&rdquo;</em> Keep the result&apos;s name, unit and method together. Milligrams, concentration and net peptide content are different measurements.
              </p>
            </div>
          </div>
          <p className="text-ash leading-relaxed pt-2">
            One routine test rarely answers all three unless the lab also runs a quantitative assay and identity testing.
          </p>
        </section>

        <section id="identity" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            What does identity tell you?
          </h2>
          <p className="text-ash leading-relaxed">
            Identity testing checks whether the sample matches the expected compound. For synthetic peptides, that comes first. If the sequence is wrong, purity and mass numbers are answering the wrong question.
          </p>
          <p className="text-ash leading-relaxed">
            Labs usually use identity testing (mass spectrometry), which measures the mass of peptide ions. The lab compares the measured weight with the expected weight from the amino acid sequence.
          </p>
          <p className="text-ash leading-relaxed">
            Retention time matching helps too. The sample&apos;s run time is compared with a reference standard on the same column and conditions.
          </p>
          <AnalyticalCallout title="Identity is not a purity score" variant="limitation">
            A matching mass supports an identity assessment, but its scope depends on the method and other evidence. It does not establish purity or the number of milligrams in the vial.
          </AnalyticalCallout>
        </section>

        <section id="purity" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            What does purity tell you?
          </h2>
          <p className="text-ash leading-relaxed">
            HPLC is commonly used to assess peptide purity. When a report gives an HPLC peak-area percentage, read it as a result under that method; confirm the method rather than assuming it from the number alone.
          </p>
          <p className="text-ash leading-relaxed">
            The dissolved sample runs through a column. Different compounds leave at different times and pass a light detector. The graph of that run over time is the chromatogram.
          </p>
          <div className="rounded-xl border border-linen bg-surface p-5 text-sm space-y-2">
            <p className="font-mono text-xs font-semibold uppercase tracking-wider text-accent">
              How the percentage is calculated
            </p>
            <p className="font-mono text-ink text-sm sm:text-base">
              Area (%) = [ Target Peak Area / Total Integrated Peak Area ] × 100
            </p>
            <p className="text-xs text-stone">
              This uncorrected area calculation includes peaks integrated by the method. It does not identify every other material or measure what the method does not detect.
            </p>
          </div>
          <p className="text-ash leading-relaxed">
            For more on how gradients, columns, and wavelengths change this number, see{" "}
            <Link
              href="/guides/peptide-purity-vs-content"
              className="font-medium text-accent underline underline-offset-4 hover:opacity-80"
            >
              What Does 99% Peptide Purity Actually Mean?
            </Link>.
          </p>
        </section>

        <section id="content" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            What does content tell you?
          </h2>
          <p className="text-ash leading-relaxed">
            A reported amount in milligrams is different from net peptide content. Bachem defines net peptide content as the fraction of peptidic material relative to non-peptidic material such as counterions and residual water. That fraction can include peptidic impurities and may be expressed as a percentage.
          </p>
          <p className="text-ash leading-relaxed">
            Gross powder weight can include peptide, counterions and residual water. A purity percentage does not tell you how much of each is present.
          </p>
          <p className="text-ash leading-relaxed">
            Keep the lab&apos;s result label and unit intact. Do not apply a generic adjustment to a nominal vial amount or rename a reported milligram result as net peptide content unless the lab defines it that way. See <a href="https://www.bachem.com/knowledge-center/faq-frequently-asked-questions/" target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-4">Bachem&apos;s definitions of gross weight, net peptide content and assay</a>.
          </p>
          <AnalyticalCallout title="Keep each result's meaning and unit" variant="key-point">
            Gross weight, HPLC purity, net peptide content and reported amount are not interchangeable. Ask the laboratory what its assay measures before using a result in quantitative research.
          </AnalyticalCallout>
        </section>

        <section id="comparison-matrix" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Side-by-side comparison
          </h2>
          <p className="text-ash leading-relaxed">
            Here is the short version of what each attribute covers and where it stops:
          </p>
          <ComparisonTable
            columns={comparisonColumns}
            rows={comparisonRows}
            caption="Comparison of Peptide Identity, Purity, and Content attributes"
          />
        </section>

        <section id="how-they-relate" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            How the three results relate
          </h2>
          <p className="text-ash leading-relaxed">
            Identity testing can confirm the expected weight is present without telling you the ratio of target to other material. A mixed sample can still show a clear target signal. Presence is not the same as purity.
          </p>
          <p className="text-ash leading-relaxed">
            An HPLC area percentage does not tell you the amount in the vial. A high purity result can accompany a measured amount below the label, while a different sample can have a lower purity result and a measured amount closer to the label. Neither number replaces the other.
          </p>
          <p className="text-ash leading-relaxed pt-2">
            Compare the original reported amount with the nominal label using the same units. A measured amount does not establish purity, sterility or endotoxin status. Those are separate results.
          </p>
        </section>

        <section id="report-example" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Reading a real report
          </h2>
          <p className="text-ash leading-relaxed">
            Here is how the three values show up on a published third-party report for PSL Labs Retatrutide (Batch &ldquo;Black Top&rdquo;, Task #{retatrutideBlackTopReport.taskNumber}) from Janoshik Analytical:
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
                <p className="font-mono text-xs text-stone uppercase">1. Named material</p>
                <p className="font-bold text-ink mt-0.5">Retatrutide</p>
                <p className="text-xs text-ash mt-1">Keep the material name from the report. Ask the lab for method details when identity evidence matters to your work.</p>
              </div>
              <div>
                <p className="font-mono text-xs text-stone uppercase">2. Purity</p>
                <p className="font-bold text-ink mt-0.5">{retatrutideBlackTopReport.purityPercent}% Purity</p>
                <p className="text-xs text-ash mt-1">The reported percentage applies to the tested sample and method. Subtracting it from 100 does not identify the remaining material.</p>
              </div>
              <div>
                <p className="font-mono text-xs text-stone uppercase">3. Reported amount</p>
                <p className="font-bold text-ink mt-0.5">{retatrutideBlackTopReport.reportedAmountMg} mg</p>
                <p className="text-xs text-ash mt-1">Amount reported for the tested sample, compared with the nominal 10 mg label. This is not a claim about every vial.</p>
              </div>
            </div>

            <p className="text-xs text-stone border-t border-linen pt-3">
              All three values are reported separately. You can open the document in our{" "}
              <Link
                href="/coa"
                className="text-accent underline underline-offset-2 hover:opacity-80"
              >
                COA Lookup
              </Link>{" "}
              or check it on Janoshik&apos;s server at{" "}
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

        <section id="untested-attributes" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            What needs separate tests
          </h2>
          <p className="text-ash leading-relaxed">
            Standard identity, purity, and mass tests do not cover everything. These need separate tests:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-ash text-sm sm:text-base">
            <li>
              <strong className="text-ink">Sterility:</strong> Growth media tests for live bacteria and fungi. A standard peptide report does not detect these.
            </li>
            <li>
              <strong className="text-ink">Endotoxins:</strong> LAL testing for bacterial toxins. They do not show up on a standard purity graph.
            </li>
            <li>
              <strong className="text-ink">Residual solvents and counterions:</strong> Separate tests for leftover synthesis chemicals and salt content.
            </li>
            <li>
              <strong className="text-ink">Water content:</strong> A moisture test for water trapped in the freeze-dried powder.
            </li>
          </ul>
        </section>

        <section id="analytical-limitations" className="flex flex-col gap-4 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Practical limits
          </h2>
          <p className="text-ash leading-relaxed">
            The report only covers the tests shown on the original laboratory file. Two other limits are worth remembering:
          </p>
          <div className="space-y-3">
            <AnalyticalCallout title="Results apply to the tested sample" variant="limitation">
              Numbers describe the vial the lab received and tested. They do not prove every vial in the lot is identical.
            </AnalyticalCallout>
            <AnalyticalCallout title="Lab data is not medical advice" variant="limitation">
              Identity and purity speak to chemical composition. They do not establish safety or suitability for human use. PSL Labs materials are for laboratory research only.
            </AnalyticalCallout>
          </div>
          <p className="text-ash leading-relaxed pt-2">
            Next, see{" "}
            <Link
              href="/guides/verify-peptide-laboratory-report"
              className="font-medium text-accent underline underline-offset-4 hover:opacity-80"
            >
              How to Verify a Peptide Laboratory Report
            </Link>{" "}
            or{" "}
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
