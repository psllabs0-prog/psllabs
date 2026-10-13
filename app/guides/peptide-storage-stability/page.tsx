import type { Metadata } from "next";
import Link from "next/link";

import { JsonLd } from "@/components/seo/json-ld";
import { GuideLayout } from "@/components/guides/guide-layout";
import { getGuideBySlug } from "@/lib/content/guides-data";
import { createPageMetadata } from "@/lib/seo";
import { createArticleData, createBreadcrumbData } from "@/lib/structured-data";

const guide = getGuideBySlug("peptide-storage-stability")!;
export const metadata: Metadata = createPageMetadata({ title: guide.seoTitle ?? guide.title, description: guide.description, path: `/guides/${guide.slug}`, type: "article" });

export default function PeptideStorageStabilityGuidePage() {
  return (
    <>
      <JsonLd data={createArticleData({ ...guide, path: `/guides/${guide.slug}` })} />
      <JsonLd data={createBreadcrumbData([{ name: "Home", path: "" }, { name: "Guides", path: "/guides" }, { name: guide.shortTitle, path: `/guides/${guide.slug}` }])} />
      <GuideLayout guide={guide} tocItems={[{ id: "instructions", label: "Start with material-specific instructions" }, { id: "handling", label: "Moisture and handling context" }, { id: "records", label: "A receiving and storage record" }, { id: "shelf-life", label: "What establishes shelf life" }]}>
        <section className="space-y-4 text-ash">
          <p>A storage record should tell you which material was received, which instructions apply, and what happened to it afterward. A high purity percentage or a test date does not supply those answers.</p>
          <p>This is a documentation guide for laboratory materials. It does not set a universal storage temperature, expiry date, or stability period for PSL’s products.</p>
        </section>
        <section id="instructions" className="scroll-mt-24 space-y-4 text-ash">
          <h2 className="font-display text-2xl font-bold text-ink">Start with material-specific instructions</h2>
          <p>Check the supplied label and applicable supplier documentation for physical form, storage conditions, and any stated expiry or retest date. A lyophilized powder and a solution are different forms; do not transfer instructions between them.</p>
          <p>If the needed conditions or stability records are not provided, <Link href="/contact" className="text-accent underline underline-offset-4">ask PSL support</Link> with the product and batch identifier. Keep the answer with your laboratory’s own handling procedure.</p>
          <p>General manufacturer guidance is useful context, not evidence that PSL completed a stability study or validated a shipping temperature range.</p>
        </section>
        <section id="handling" className="scroll-mt-24 space-y-4 text-ash">
          <h2 className="font-display text-2xl font-bold text-ink">Moisture and handling context</h2>
          <p>Bachem’s handling guidance discusses moisture uptake in lyophilized peptides and allowing a closed container to reach ambient temperature before opening to reduce condensation. It also distinguishes dry-material storage from solution storage and notes that peptide-specific properties matter.</p>
          <p className="text-sm">Reference: <a href="https://www.bachem.com/knowledge-center/handling-and-storage-guidelines-for-peptides/" target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-4">Bachem’s handling and storage guide</a>. Follow your material-specific instructions and laboratory procedures; this reference does not validate PSL shelf life.</p>
        </section>
        <section id="records" className="scroll-mt-24 space-y-4 text-ash">
          <h2 className="font-display text-2xl font-bold text-ink">A receiving and storage record</h2>
          <ul className="list-disc space-y-3 pl-5">
            <li><strong className="text-ink">Identity of the material:</strong> product, SKU, supplied batch code, nominal label amount, and physical form.</li>
            <li><strong className="text-ink">Receiving check:</strong> date, package condition, and any visible damage or discrepancy.</li>
            <li><strong className="text-ink">Instructions:</strong> source and version of the applicable storage information, with any unanswered question.</li>
            <li><strong className="text-ink">Location and handling:</strong> storage location, handling dates, and relevant temperature records under your lab’s procedure.</li>
            <li><strong className="text-ink">Exceptions:</strong> any suspected exposure or condition departure and how it was assessed. Do not silently reset a storage clock.</li>
          </ul>
          <p>Use the <Link href="/science/how-to-read-a-coa" className="text-accent underline underline-offset-4">report-field worksheet</Link> for analytical documentation. Our <Link href="/shipping" className="text-accent underline underline-offset-4">shipping page</Link> describes fulfillment; it should not be read as a stability study.</p>
        </section>
        <section id="shelf-life" className="scroll-mt-24 space-y-4 text-ash">
          <h2 className="font-display text-2xl font-bold text-ink">What establishes shelf life?</h2>
          <p>A laboratory report records tests on the named sample at the time shown. It does not, by itself, establish how results change after shipping, repeated handling, or long storage. Ask for the relevant stability evidence if your work requires a defined period.</p>
          <p>Record missing information as missing. Do not invent an expiry date, reuse another supplier’s claimed duration, or treat unchanged appearance as a fresh analytical result. Read <Link href="/guides/what-peptide-testing-can-establish" className="text-accent underline underline-offset-4">what analytical testing can establish</Link> for the distinction between a reported measurement and an unanswered question.</p>
        </section>
      </GuideLayout>
    </>
  );
}
