import type { Metadata } from "next";

import { AnimateIn } from "@/components/product/animate-in";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "How to Verify a Peptide Certificate of Analysis",
  description:
    "Learn how to independently verify third-party peptide testing reports. Understand what a legitimate COA includes, common red flags, and how to confirm results directly with the testing laboratory.",
  path: "/guides/verify-peptide-coa",
  type: "article",
});

export default function VerifyPeptideCoaGuidePage() {
  return (
    <main className="section-surface-ice min-h-screen">
      <article className="mx-auto max-w-[720px] px-6 py-16 md:px-12 md:py-20 lg:px-24 lg:py-24">
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
              A practical checklist for reading third-party laboratory reports,
              spotting unreliable documents, and confirming results with the
              testing lab—before you rely on a batch for research work.
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
                A Certificate of Analysis (COA) is a laboratory report for a
                specific sample from a specific batch or lot. It documents what
                was measured—typically identity and purity—using analytical
                methods chosen by the laboratory. Results apply only to the
                tested sample identified in that report, not to every vial that
                might share a similar label elsewhere.
              </p>
            </section>
          </AnimateIn>

          <AnimateIn delay={0.14}>
            <section className="flex flex-col gap-4">
              <h2 className="font-[family-name:var(--font-display)] text-xl font-bold text-ink md:text-2xl">
                What a legitimate COA should include
              </h2>
              <p className="text-ash">
                Not every PDF labeled “COA” is equally useful. A report that
                supports careful research documentation usually includes the
                following elements. If several of them are missing, treat the
                document as incomplete until you can confirm the details another
                way.
              </p>
              <ol className="list-decimal space-y-4 pl-5 text-ash">
                <li>
                  <strong className="font-medium text-ink">
                    The testing laboratory’s full name and contact information.
                  </strong>{" "}
                  You should be able to identify who performed the analysis and
                  how to reach that organization. A logo alone is not enough;
                  look for a clear legal or trade name and contact details.
                </li>
                <li>
                  <strong className="font-medium text-ink">
                    A batch or lot number that matches the vial.
                  </strong>{" "}
                  The identifier on the report should correspond to the lot
                  marked on your container. If the numbers do not match—or if
                  the report has no lot identifier—you cannot connect the data
                  to the material in hand.
                </li>
                <li>
                  <strong className="font-medium text-ink">
                    The analytical method used.
                  </strong>{" "}
                  For peptide purity work, that is often HPLC (high-performance
                  liquid chromatography), which separates compounds in a sample
                  so each can be detected and measured. Useful reports note the
                  method and, when available, column specifications so another
                  chemist can understand how the measurement was made.
                </li>
                <li>
                  <strong className="font-medium text-ink">
                    A full chromatogram graph, not only a summary number.
                  </strong>{" "}
                  A chromatogram is the plot produced by the instrument over
                  time. It shows peaks that correspond to detected components.
                  A purity percentage without the underlying graph leaves out
                  context that trained readers use to judge whether the run
                  looks clean and complete.
                </li>
                <li>
                  <strong className="font-medium text-ink">
                    A specific quantitative purity result.
                  </strong>{" "}
                  Prefer a precise figure such as 99.8% over rounded ranges like
                  “greater than 98%” or vague claims of “high purity.” Exact
                  values are easier to compare across reports and to archive in
                  laboratory records.
                </li>
                <li>
                  <strong className="font-medium text-ink">
                    A report date and an analyst identifier.
                  </strong>{" "}
                  Dates establish when the work was performed. An analyst name,
                  initials, or other identifier shows that a person was
                  associated with the release of the result. Together they make
                  the document easier to audit later.
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
                these warning signs when you review a report:
              </p>
              <ul className="list-disc space-y-3 pl-5 text-ash">
                <li>
                  <strong className="font-medium text-ink">No lab name</strong>{" "}
                  — or only a generic phrase such as “independent laboratory”
                  with no organization you can look up.
                </li>
                <li>
                  <strong className="font-medium text-ink">
                    Summary-only pages with no graph
                  </strong>{" "}
                  — a purity figure without a chromatogram or other primary
                  data is easy to fabricate and hard to evaluate.
                </li>
                <li>
                  <strong className="font-medium text-ink">
                    Batch number mismatch or a missing batch number
                  </strong>{" "}
                  — if you cannot match the report to your vial, the numbers do
                  not support that specific material.
                </li>
                <li>
                  <strong className="font-medium text-ink">
                    Old or missing dates
                  </strong>{" "}
                  — undated reports, or dates that look unrelated to the lot you
                  received, weaken the trail from sample to result.
                </li>
                <li>
                  <strong className="font-medium text-ink">
                    Cropped or blurry images
                  </strong>{" "}
                  — heavy cropping, low resolution, or obvious editing can hide
                  headers, footers, task numbers, or other fields needed for
                  verification.
                </li>
                <li>
                  <strong className="font-medium text-ink">
                    No way to verify with the lab
                  </strong>{" "}
                  — if there is no task number, report ID, or public
                  verification path, you are left trusting a file that cannot be
                  checked at the source.
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
                Reading a PDF on a supplier’s website is not the same as
                confirming that the laboratory still hosts the original record.
                Independent verification means checking the report against the
                lab’s own system whenever that option exists.
              </p>
              <p className="text-ash">
                One example is Janoshik’s verification tool at{" "}
                <a
                  href="https://janoshik.com/verify"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-petrol underline underline-offset-4 transition-opacity hover:opacity-80"
                >
                  janoshik.com/verify
                </a>
                . When a Janoshik report lists a task number, you can enter that
                number on the verification page. The tool retrieves the original
                report from the laboratory’s server rather than from a copy
                stored only by a reseller. If the task number is valid, you see
                the same underlying record the lab issued—not a retyped summary.
              </p>
              <p className="text-ash">
                This step matters because screenshots and downloaded files can
                be altered, renamed, or attached to the wrong lot. Pulling the
                report directly from the lab reduces that risk. If verification
                fails, or if the online report does not match the file you were
                given, pause and resolve the discrepancy before you treat the
                batch as documented.
              </p>
              <p className="text-ash">
                Other laboratories may use different portals or require email
                confirmation. The principle is the same: prefer a path that
                returns the original report from the testing organization, and
                keep a copy of what you verified with your research records.
              </p>
            </section>
          </AnimateIn>

          <AnimateIn delay={0.2}>
            <section className="flex flex-col gap-4">
              <h2 className="font-[family-name:var(--font-display)] text-xl font-bold text-ink md:text-2xl">
                Why third-party testing matters
              </h2>
              <p className="text-ash">
                Third-party testing means an independent laboratory—not the
                seller’s own quality desk alone—performed the analysis and
                issued the report. Independence is the key factor. When the same
                organization both sells the material and writes the only
                available test summary, conflicts of interest are harder to rule
                out, even when the staff are careful and competent.
              </p>
              <p className="text-ash">
                In-house vendor testing can still be useful for internal
                process control. It is a weaker substitute for an external COA
                when the goal is documentation that another party can scrutinize.
                US-based suppliers that publish third-party reports make it
                easier for research buyers to compare lots against original lab
                data rather than against marketing copy.
              </p>
              <p className="text-ash">
                Equally important is the difference between a full original
                report and a vendor summary. A summary may list purity in a
                sentence or table without chromatograms, method details, or
                verification IDs. An original report from the laboratory
                includes the primary data and identifiers needed for
                independent checks. When both exist, archive the original; treat
                the summary as a pointer, not a replacement.
              </p>
            </section>
          </AnimateIn>

          <AnimateIn delay={0.22}>
            <section className="flex flex-col gap-4">
              <h2 className="font-[family-name:var(--font-display)] text-xl font-bold text-ink md:text-2xl">
                Make batch verification part of procurement
              </h2>
              <p className="text-ash">
                Build a simple habit: match the lot on the vial, open the full
                laboratory report, confirm the method and purity figures, and
                verify the record with the lab when a tool such as Janoshik’s
                portal is available. Doing this for every batch takes little
                time and keeps research documentation tied to primary data
                instead of unverified files.
              </p>
            </section>
          </AnimateIn>
        </div>
      </article>
    </main>
  );
}
