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
      "Third-party verification is non-negotiable. We use ISO 17025-accredited laboratories we do not own, control, or invest in. Results are published in full for every lot number.",
      "We test for what matters: identity (is it the right compound?), potency (is it at label claim?), and contaminants (heavy metals, microbes).",
    ],
  },
  {
    id: "panels",
    title: "What we test for",
    paragraphs: [
      "Identity: HPLC against reference standards for each active ingredient.\n\nPotency: Verified at label claim within established tolerance.\n\nHeavy metals: Lead, arsenic, cadmium, mercury via ICP-MS.\n\nMicrobial limits: Total plate count, yeast and mold, pathogens per USP guidelines.",
    ],
  },
  {
    id: "coa",
    title: "How to read your COA",
    paragraphs: [
      "Find the lot number printed on your bottle label. Match it to the COA on the product page or below. Each COA lists the testing lab, test methods, results, and pass/fail against our specifications.",
      "If your lot number is not yet published, contact support@psllabs.com—we publish within 48 hours of batch release.",
    ],
  },
  {
    id: "manufacturing",
    title: "Manufacturing standards",
    paragraphs: [
      "Products are manufactured in the United States in cGMP-certified facilities registered with the FDA. We audit manufacturing partners annually and require batch records for every lot we sell.",
    ],
  },
  {
    id: "limitations",
    title: "What testing does not mean",
    paragraphs: [
      "Passing a COA means the batch meets our specifications for identity, potency, and contaminants. It does not mean the product treats, cures, or prevents any disease. Structure/function claims on this site are subject to the FDA disclaimer on product pages.",
    ],
  },
];
