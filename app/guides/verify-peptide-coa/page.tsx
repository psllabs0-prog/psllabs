import type { Metadata } from "next";

import { AnimateIn } from "@/components/product/animate-in";
import { JsonLd } from "@/components/seo/json-ld";
import { RelatedGuides } from "@/components/guides/related-guides";
import { BatchDocumentationCTA } from "@/components/guides/batch-documentation-cta";
import { getGuideBySlug } from "@/lib/content/guides-data";
import { createPageMetadata } from "@/lib/seo";
import { createArticleData, createBreadcrumbData } from "@/lib/structured-data";

const guide = getGuideBySlug("verify-peptide-coa")!;

export const metadata: Metadata = createPageMetadata({
  title: guide.seoTitle ?? guide.title,
  description: guide.description,
  path: "/guides/verify-peptide-coa",
  type: "article",
});

const articleLd = createArticleData({ ...guide, path: `/guides/${guide.slug}` });
const breadcrumbLd = createBreadcrumbData([
  { name: "Home", path: "" },
  { name: "Guides", path: "/guides" },
  { name: guide.shortTitle, path: `/guides/${guide.slug}` },
]);

export default function VerifyPeptideCoaGuidePage() {
  return (
    <main className="public-page-surface min-h-screen">
      {/* Validate Article markup: https://search.google.com/test/rich-results */}
      <JsonLd data={articleLd} />
      <JsonLd data={breadcrumbLd} />
      <article className="mx-auto max-w-[840px] px-6 py-16 md:px-12 md:py-20 lg:py-24">
        <header className="mb-10 border-b border-linen pb-10 md:mb-12 md:pb-12">
          <AnimateIn>
            <p className="mono text-ash">GUIDE</p>
          </AnimateIn>
          <AnimateIn delay={0.06}>
            <h1 className="mt-4 font-[family-name:var(--font-display)] text-[clamp(2rem,4vw,2.5rem)] leading-[1.15] tracking-[-0.02em] text-ink">
              How to Verify a Peptide Certificate of Analysis
            </h1>
          </AnimateIn>
          <AnimateIn delay={0.1}>
            <p className="mt-5 text-base leading-relaxed text-ash md:text-[1.0625rem]">
              A Certificate of Analysis (COA) is a lab report for one specific
              sample. This guide shows you what to look for, how to spot weak
              documents, and how to confirm results with the testing lab.
            </p>
          </AnimateIn>
        </header>

        <div className="flex flex-col gap-10 text-base leading-relaxed text-ink md:gap-12 md:text-[1.0625rem]">
          <AnimateIn delay={0.12}>
            <section className="flex flex-col gap-4">
              <h2 className="font-[family-name:var(--font-display)] text-xl font-bold text-ink md:text-2xl">
                What a Certificate of Analysis is
              </h2>
              <p className="text-ash">
                A COA is a lab report for one sample from one batch. It records
                what the lab measured, usually identity and purity, and which
                test methods they used. The results apply only to that sample,
                not to every vial with a similar label.
              </p>
            </section>
          </AnimateIn>

          <AnimateIn delay={0.14}>
            <section className="flex flex-col gap-4">
              <h2 className="font-[family-name:var(--font-display)] text-xl font-bold text-ink md:text-2xl">
                What a legitimate COA should include
              </h2>
              <p className="text-ash">
                Not every PDF labeled &ldquo;COA&rdquo; is useful. A solid
                report usually includes the items below. If several are missing,
                treat the document as incomplete until you can confirm the
                details another way.
              </p>
              <ol className="list-decimal space-y-4 pl-5 text-ash">
                <li>
                  <strong className="font-medium text-ink">
                    The testing laboratory&apos;s full name and contact information.
                  </strong>{" "}
                  You should be able to identify who ran the tests and how to
                  reach them. A logo alone is not enough. Look for a clear legal
                  or trade name and contact details.
                </li>
                <li>
                  <strong className="font-medium text-ink">
                    A batch or lot number that matches the vial.
                  </strong>{" "}
                  The number on the report should match the lot on your
                  container. If they do not match, or if the report has no lot
                  number, you cannot connect the data to your material.
                </li>
                <li>
                  <strong className="font-medium text-ink">
                    The test method used.
                  </strong>{" "}
                  For peptide purity, that is often a laboratory purity test
                  (HPLC). The report should name the method and, when available,
                  enough detail for another chemist to understand how the
                  measurement was made.
                </li>
                <li>
                  <strong className="font-medium text-ink">
                    The full original report and supporting data when available.
                  </strong>{" "}
                  A chromatogram is the graph the instrument produces over time.
                  It shows peaks for components the method detects and separates.
                  If a graph or method detail is absent from a laboratory-issued
                  summary, ask the lab what supporting information is available.
                  Its absence alone does not prove the report is unreliable.
                </li>
                <li>
                  <strong className="font-medium text-ink">
                    A specific purity result.
                  </strong>{" "}
                  Record the value and units exactly as the lab reports them.
                  More decimal places do not prove greater accuracy. Compare
                  results only with suitable method details, detection limits
                  and measurement uncertainty when those are available.
                </li>
                <li>
                  <strong className="font-medium text-ink">
                    A report date and an analyst identifier.
                  </strong>{" "}
                  Dates show when the work was done. An analyst name, initials,
                  or other ID shows a person was linked to the result. Together
                  they make the document easier to audit later.
                </li>
              </ol>
            </section>
          </AnimateIn>

          <AnimateIn delay={0.16}>
            <section className="flex flex-col gap-4">
              <h2 className="font-[family-name:var(--font-display)] text-xl font-bold text-ink md:text-2xl">
                Common red flags in fake or unreliable COAs
              </h2>
              <p className="text-ash">
                Unreliable documents often fail in predictable ways. Watch for
                these warning signs:
              </p>
              <ul className="list-disc space-y-3 pl-5 text-ash">
                <li>
                  <strong className="font-medium text-ink">No lab name</strong>{" "}
                  or only a generic phrase such as &ldquo;independent
                  laboratory&rdquo; with no organization you can look up.
                </li>
                <li>
                  <strong className="font-medium text-ink">
                    A vendor summary presented as a laboratory report
                  </strong>
                  : ask for the original laboratory-issued record and confirm
                  it at the source. An original lab summary can be genuine even
                  when supporting chromatograms are supplied separately.
                </li>
                <li>
                  <strong className="font-medium text-ink">
                    Batch number mismatch or a missing batch number
                  </strong>
                  : if you cannot match the report to your vial, the numbers do
                  not support that specific material.
                </li>
                <li>
                  <strong className="font-medium text-ink">
                    Old or missing dates
                  </strong>
                  : undated reports, or dates that look unrelated to the lot you
                  received, weaken the link from sample to result.
                </li>
                <li>
                  <strong className="font-medium text-ink">
                    Cropped or blurry images
                  </strong>
                  : heavy cropping, low resolution, or obvious editing can hide
                  headers, footers, task numbers, or other fields needed for
                  verification.
                </li>
                <li>
                  <strong className="font-medium text-ink">
                    No way to verify with the lab
                  </strong>
                  : if there is no task number, report ID, or public check
                  path, you are left trusting a file that cannot be confirmed at
                  the source.
                </li>
              </ul>
            </section>
          </AnimateIn>

          <AnimateIn delay={0.18}>
            <section className="flex flex-col gap-4">
              <h2 className="font-[family-name:var(--font-display)] text-xl font-bold text-ink md:text-2xl">
                How to independently verify a COA
              </h2>
              <p className="text-ash">
                Reading a PDF on a supplier&apos;s website is not the same as
                confirming the lab still hosts the original record. Independent
                verification means checking the report against the lab&apos;s
                own system when that option exists.
              </p>
              <p className="text-ash">
                One example is Janoshik&apos;s verification tool at{" "}
                <a
                  href="https://verify.janoshik.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-petrol underline underline-offset-4 transition-opacity hover:opacity-80"
                >
                  verify.janoshik.com
                </a>
                . Enter the task number and verification key as printed on the
                original report, following the laboratory&apos;s instructions.
                The tool pulls the original report
                from the laboratory&apos;s server, not from a copy stored only
                by a reseller. If the task number is valid, you see the same
                record the lab issued, not a retyped summary.
              </p>
              <p className="text-ash">
                This step matters because screenshots and downloaded files can
                be altered, renamed, or attached to the wrong lot. Pulling the
                report directly from the lab reduces that risk. If verification
                fails, or if the online report does not match the file you were
                given, pause and resolve the mismatch before you treat the batch
                as documented.
              </p>
              <p className="text-ash">
                Other labs may use different portals or require email
                confirmation. The idea is the same: prefer a path that returns
                the original report from the testing organization, and keep a
                copy of what you verified with your research records.
              </p>
            </section>
          </AnimateIn>

          <AnimateIn delay={0.2}>
            <section className="flex flex-col gap-4">
              <h2 className="font-[family-name:var(--font-display)] text-xl font-bold text-ink md:text-2xl">
                Why third-party testing matters
              </h2>
              <p className="text-ash">
                Third-party testing means an independent lab, not only the
                seller&apos;s own quality desk, ran the analysis and issued the
                report. When the same organization both sells the material and
                writes the only available test summary, conflicts of interest
                are harder to rule out, even when the staff are careful.
              </p>
              <p className="text-ash">
                In-house vendor testing can still help with process control. It
                is a weaker stand-in for an external COA when you need
                documentation another party can review. Suppliers that publish
                third-party reports make it easier to compare lots against
                original lab data rather than marketing copy.
              </p>
              <p className="text-ash">
                Also watch the gap between a full original report and a vendor
                summary. A summary may list purity in a sentence without test
                graphs, method details, or verification IDs. An original lab
                report includes the primary data and identifiers needed for
                independent checks. When both exist, archive the original. Treat
                the summary as a pointer, not a replacement.
              </p>
            </section>
          </AnimateIn>

          <AnimateIn delay={0.22}>
            <section className="flex flex-col gap-4">
              <h2 className="font-[family-name:var(--font-display)] text-xl font-bold text-ink md:text-2xl">
                Make batch checks part of buying
              </h2>
              <p className="text-ash">
                Build a simple habit: match the lot on the vial, open the full
                lab report, confirm the method and purity figures, and verify
                the record with the lab when a tool such as Janoshik&apos;s
                portal is available. Doing this for every batch takes little
                time and keeps your records tied to primary data instead of
                unverified files.
              </p>
            </section>
          </AnimateIn>

          <AnimateIn delay={0.24}>
            <BatchDocumentationCTA guideSlug="verify-peptide-coa" />
          </AnimateIn>

          <AnimateIn delay={0.26}>
            <RelatedGuides currentSlug="verify-peptide-coa" />
          </AnimateIn>
        </div>
      </article>
    </main>
  );
}
