import type { Metadata } from "next";
import Link from "next/link";

import { JsonLd } from "@/components/seo/json-ld";
import { GuideLayout } from "@/components/guides/guide-layout";
import { getGuideBySlug } from "@/lib/content/guides-data";
import { createPageMetadata } from "@/lib/seo";
import { createArticleData, createBreadcrumbData } from "@/lib/structured-data";

import { ComparisonTable } from "@/components/guides/comparison-table";

const guide = getGuideBySlug("verify-peptide-coa")!;
export const metadata: Metadata = createPageMetadata({ title: guide.seoTitle ?? guide.title, description: guide.description, path: `/guides/${guide.slug}`, type: "article" });

const fields = [
  { field: "Issuing laboratory", record: "Name and an independently located contact or verification channel.", question: "Can the laboratory confirm it issued this record?" },
  { field: "Report / task identifier", record: "The report number and any verification key, copied from the full file.", question: "Does the lab record match the copy supplied?" },
  { field: "Sample and lot", record: "Sample name, batch code, and the supplier’s documented link to the supplied lot.", question: "Is this the report for this material, rather than a similarly named product?" },
  { field: "Dates", record: "Sample-received and analysis dates where present.", question: "What do the dates actually describe? They are not expiry dates." },
  { field: "Results", record: "Every relevant result label, value, unit, and comments as printed.", question: "Are percentage, milligrams, and concentration kept separate?" },
  { field: "Method and scope", record: "Tests named on the report; supporting method information when available.", question: "Which questions remain unanswered by this document?" },
];

export default function VerifyPeptideCoaGuidePage() {
  return (
    <>
      <JsonLd data={createArticleData({ ...guide, path: `/guides/${guide.slug}` })} />
      <JsonLd data={createBreadcrumbData([{ name: "Home", path: "" }, { name: "Guides", path: "/guides" }, { name: guide.shortTitle, path: `/guides/${guide.slug}` }])} />
      <GuideLayout guide={guide} tocItems={[{ id: "fields", label: "Six fields to record" }, { id: "gaps", label: "What to do when something is missing" }, { id: "before-ordering", label: "Questions before ordering" }, { id: "next-step", label: "Next: verify the original report" }]}>
        <section className="space-y-4 text-ash">
          <p>Use this short checklist to decide whether a Certificate of Analysis gives you enough information to begin a documentation review. It checks completeness; it does not authenticate a file or certify a supplier.</p>
          <p>Keep the complete document open. A crop, a product badge, or a percentage quoted in a listing can omit the fields needed to connect a result to a sample.</p>
        </section>
        <section id="fields" className="scroll-mt-24 space-y-4">
          <h2 className="font-display text-2xl font-bold text-ink">Six fields to record</h2>
          <ComparisonTable columns={[{ key: "field", header: "Field" }, { key: "record", header: "Record" }, { key: "question", header: "Question to resolve" }]} rows={fields} caption="A COA completeness check, not a certification of the material" />
        </section>
        <section id="gaps" className="scroll-mt-24 space-y-4 text-ash">
          <h2 className="font-display text-2xl font-bold text-ink">A missing field is a question, not a verdict</h2>
          <p>A laboratory-issued summary can be genuine without containing a full chromatogram or every method setting. Ask which supporting records exist. Likewise, a lab without a public portal may confirm a report through its own contact channel.</p>
          <ul className="list-disc space-y-3 pl-5">
            <li><strong className="text-ink">Unreadable or cropped file:</strong> request the complete, legible original.</li>
            <li><strong className="text-ink">No clear lot match:</strong> ask the supplier to document the link. A product name or SKU alone does not identify a production lot.</li>
            <li><strong className="text-ink">Different results in two copies:</strong> ask the issuing laboratory to identify the applicable record. Do not average the numbers.</li>
            <li><strong className="text-ink">A needed test is absent:</strong> record it as not reported on this document. Do not infer sterility, stability, or another property from purity.</li>
          </ul>
        </section>
        <section id="before-ordering" className="scroll-mt-24 space-y-4 text-ash">
          <h2 className="font-display text-2xl font-bold text-ink">Questions before ordering</h2>
          <p>Ask which batch will be supplied and whether its report is published. If a listing uses a generic specification, ask for the sample-specific report rather than treating the specification as a test result. See <Link href="/guides/batch-specific-vs-generic-coa" className="text-accent underline underline-offset-4">batch-specific reports versus generic COAs</Link>.</p>
          <p>For PSL materials, open <Link href="/coa" className="text-accent underline underline-offset-4">Batch Reports</Link> and review <Link href="/disclaimer#product-label-information" className="text-accent underline underline-offset-4">product-label disclosures</Link> alongside the original file.</p>
        </section>
        <section id="next-step" className="scroll-mt-24 space-y-4 text-ash">
          <h2 className="font-display text-2xl font-bold text-ink">Next: verify the original report</h2>
          <p>Janoshik’s <a href="https://janoshik.com/verification/" target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-4">official verification form</a> asks for a task number and unique key. Both must come from the original document; a task number alone is insufficient for that form.</p>
          <p>The <Link href="/guides/verify-peptide-laboratory-report" className="text-accent underline underline-offset-4">worked laboratory-report verification guide</Link> covers source verification and batch matching in detail. Once the file is located, use the <Link href="/science/how-to-read-a-coa" className="text-accent underline underline-offset-4">PSL receiving-record worksheet</Link> to keep its fields with your laboratory records.</p>
        </section>
      </GuideLayout>
    </>
  );
}
