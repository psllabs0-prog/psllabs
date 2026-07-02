import type { ContentPageMeta, ContentSection } from "./types";

export const testingPageMeta: ContentPageMeta = {
  label: "TESTING & QUALITY",
  title: "Verified by a lab we don't own.",
  description:
    "How PSL Labs tests every batch—and how to read your Certificate of Analysis.",
  intro: [
    "Every batch is third-party tested before it ships. We publish full COAs—not summaries, not marketing PDFs. If we wouldn't stake our name on the results, the batch doesn't ship.",
  ],
};

export const testingSections: ContentSection[] = [
  {
    id: "philosophy",
    title: "Our testing philosophy",
    paragraphs: [
      "[PLACEHOLDER: Confirm your third-party testing policy—e.g. independent lab, no ownership or operational control.] Third-party verification is the baseline for every lot we release, not an optional upgrade or a marketing line on the label.",
      "We publish complete Certificates of Analysis matched to lot numbers so you can review results before a compound enters your workflow—not summaries, not selective excerpts.",
      "[PLACEHOLDER: List the analytical categories you require per batch—e.g. identity, purity, contaminants—and what must pass before a lot ships.] We test for what researchers need to trust a batch in the lab: confirmed identity, documented purity, and contaminant screening against our published release criteria.",
    ],
  },
  {
    id: "panels",
    title: "What we test for",
    paragraphs: [
      "[PLACEHOLDER: Document each test panel required before release—identity method, purity assay, heavy metal screen, microbial limits, and any compound-specific panels.] Each batch is evaluated against a defined set of analytical panels before we consider it releasable.",
      "Results for each panel appear on the batch COA with the method used and a clear pass or fail against our documented specifications. We do not substitute supplier paperwork for independent verification.",
      "[PLACEHOLDER: Note whether panels differ by product or compound class, and where readers can find the specification sheet for a given product.]",
    ],
  },
  {
    id: "coa",
    title: "How to read your COA",
    paragraphs: [
      "Find the lot number printed on your vial label and match it to the corresponding COA on the product page. Each report should tie directly to that lot—not a generic product summary.",
      "A complete COA lists the testing laboratory, the methods run, numerical results, and whether the batch met our release specifications for identity, purity, and contaminants. [PLACEHOLDER: Add where else COAs are published if not only on product pages—e.g. a lot lookup tool or document archive.]",
      "If your lot number is not yet listed, contact support@psllabs.org before use in your workflow. [PLACEHOLDER: Add your confirmed COA publication timeline after batch release.]",
    ],
  },
  {
    id: "manufacturing",
    title: "Manufacturing standards",
    paragraphs: [
      "[PLACEHOLDER: Describe where and how your compounds are manufactured—facility type, quality system, and geographic region.] We source from manufacturing partners whose practices align with our documentation and traceability requirements.",
      "Every lot we sell must ship with traceable batch records we can reconcile to the published COA. [PLACEHOLDER: Add your partner qualification process—e.g. initial vetting, documentation review, recurring audits.]",
      "[PLACEHOLDER: Note any handling, storage, or chain-of-custody steps between manufacturing and fulfillment that researchers should know about.]",
    ],
  },
  {
    id: "limitations",
    title: "What testing does not mean",
    paragraphs: [
      "Passing a published COA means a batch met our documented specifications for identity, purity, and contaminants for that lot. It does not mean the compound is safe or effective for human or animal use.",
      "PSL Labs products are sold strictly for laboratory and research use. They are not intended for human or animal consumption, diagnosis, treatment, cure, or prevention of any disease.",
      "[PLACEHOLDER: Add regulatory disclaimers your counsel approves—e.g. FDA evaluation, structure/function claims, RUO labeling.] Testing results support research documentation; they do not replace your own laboratory validation.",
    ],
  },
];
