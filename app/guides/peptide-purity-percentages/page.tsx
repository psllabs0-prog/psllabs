import type { Metadata } from "next";
import Link from "next/link";

import { JsonLd } from "@/components/seo/json-ld";
import { GuideLayout } from "@/components/guides/guide-layout";
import { getGuideBySlug } from "@/lib/content/guides-data";
import { createPageMetadata } from "@/lib/seo";
import { createArticleData, createBreadcrumbData } from "@/lib/structured-data";

const guide = getGuideBySlug("peptide-purity-percentages")!;
export const metadata: Metadata = createPageMetadata({ title: guide.seoTitle ?? guide.title, description: guide.description, path: `/guides/${guide.slug}`, type: "article" });

export default function PeptidePurityPercentagesGuidePage() {
  return (
    <>
      <JsonLd data={createArticleData({ ...guide, path: `/guides/${guide.slug}` })} />
      <JsonLd data={createBreadcrumbData([{ name: "Home", path: "" }, { name: "Guides", path: "/guides" }, { name: guide.shortTitle, path: `/guides/${guide.slug}` }])} />
      <GuideLayout guide={guide} tocItems={[{ id: "basis", label: "Find the calculation basis" }, { id: "trace", label: "Read the trace before comparing" }, { id: "comparison", label: "Compare percentages carefully" }, { id: "record", label: "What to keep with the number" }]}>
        <section className="space-y-4 text-ash">
          <p>This guide is about the percentage and the chromatogram behind it. For the separate question of how much material was reported in a vial, use <Link href="/guides/peptide-purity-vs-content" className="text-accent underline underline-offset-4">purity versus amount</Link>.</p>
          <p>Begin with the laboratory’s result label and method. Do not assume every value called “purity” uses the same calculation.</p>
        </section>
        <section id="basis" className="scroll-mt-24 space-y-4 text-ash">
          <h2 className="font-display text-2xl font-bold text-ink">Find the calculation basis</h2>
          <p>For an uncorrected HPLC area percentage, divide the target peak area by the total integrated peak area and multiply by 100. Waters distinguishes this from calculations using response-corrected areas. Ask which result the laboratory reports.</p>
          <div className="public-section-card p-5">
            <p className="font-mono text-sm text-ink">Area % = target peak area ÷ total integrated peak area × 100</p>
            <p className="mt-3 text-sm">This is a signal ratio under a stated method. It is not a weight measurement or a vial’s milligram amount.</p>
          </div>
          <p className="text-sm">Calculation reference: <a href="https://support.waters.com/KB_Inf/Empower_Breeze/WKB14718_How_is_the_Impurity_RRF_field_in_the_components_tab_in_the_processing_method_within_Empower_used" target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-4">Waters: area and adjusted-area calculations</a>.</p>
        </section>
        <section id="trace" className="scroll-mt-24 space-y-4 text-ash">
          <h2 className="font-display text-2xl font-bold text-ink">Read the trace before comparing</h2>
          <p>Bachem describes analytical HPLC as a common peptide-purity method, with the main peak area compared with integrated peak areas. The displayed trace and method help explain what was counted.</p>
          <ol className="list-decimal space-y-3 pl-5">
            <li>Locate the assigned target peak and the laboratory’s result table.</li>
            <li>Check that axes, the run interval, and labels are readable. Ask for the complete trace if a crop removes useful context.</li>
            <li>Ask what detection settings and integration rules were used when you need to compare methods.</li>
            <li>Keep unresolved peaks unresolved. A small peak is not an identified compound merely because it appears on a graph.</li>
          </ol>
          <p className="text-sm">Method reference: <a href="https://www.bachem.com/knowledge-center/quality-control-of-amino-acids-peptides-a-guide/" target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-4">Bachem: peptide quality control</a>. This explains a general method; it is not a test report for PSL stock.</p>
        </section>
        <section id="comparison" className="scroll-mt-24 space-y-4 text-ash">
          <h2 className="font-display text-2xl font-bold text-ink">Compare percentages carefully</h2>
          <p>The remainder of an area-percentage calculation concerns the other integrated signals. It is not a complete inventory of the vial. Anything undetected, unresolved, or excluded from integration is outside that calculation.</p>
          <p>More decimal places do not establish greater accuracy. Before ranking two batches, check whether their methods, calculation bases, and relevant reporting limits are comparable. If you lack that information, keep the results as separate reported values.</p>
          <p>Identity, reported amount, and other tests answer different questions. See the <Link href="/guides/peptide-identity-vs-purity-vs-content" className="text-accent underline underline-offset-4">three-result comparison</Link> and <Link href="/guides/what-peptide-testing-can-establish" className="text-accent underline underline-offset-4">testing-scope guide</Link>.</p>
        </section>
        <section id="record" className="scroll-mt-24 space-y-4 text-ash">
          <h2 className="font-display text-2xl font-bold text-ink">What to keep with the number</h2>
          <p>Save the full original file, sample and batch name, task number, analysis date, result label, percentage, and available method notes. Keep unanswered questions in the same record.</p>
          <p>For PSL’s published values, use the matching <Link href="/coa" className="text-accent underline underline-offset-4">batch report</Link>. A reported value belongs to the tested sample; do not extend it to untested vials or later batches.</p>
        </section>
      </GuideLayout>
    </>
  );
}
