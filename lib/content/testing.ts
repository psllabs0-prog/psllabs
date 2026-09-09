import type { ContentPageMeta, ContentSection } from "./types";
import { TESTING_SCOPE_STATEMENT } from "./testing-scope";

export const testingPageMeta: ContentPageMeta = {
  label: "TESTING & QUALITY",
  title: "Tested by a lab we don't own.",
  description:
    "How PSL Labs publishes third party lab reports, and how to review them.",
  intro: [
    "PSL Labs does not create the lab reports shown on the site. Our published reports come from Janoshik Analytical, an independent laboratory. For our peptide batches, the report shows the material identified by the lab, the reported purity, and the amount measured in the tested sample.",
    TESTING_SCOPE_STATEMENT,
  ],
};

export const testingSections: ContentSection[] = [
  {
    id: "identity",
    title: "Identity",
    paragraphs: [
      "Identity testing helps confirm what material the lab identified in the tested sample. Look for this on the original report when it is published.",
    ],
  },
  {
    id: "purity",
    title: "Purity",
    paragraphs: [
      "Purity describes how clean the sample looked in the lab's purity test. If a purity percentage appears on the report, it applies to that tested sample and test method only.",
    ],
  },
  {
    id: "amount",
    title: "Amount",
    paragraphs: [
      "Amount testing shows how much target material the lab measured in the tested sample. For a solution, the report may show concentration instead.",
    ],
  },
  {
    id: "batch-documentation",
    title: "Batch documentation",
    paragraphs: [
      "Each published report is tied to a specific batch. You can review the lab report for that batch, not a generic product claim.",
    ],
  },
  {
    id: "coa-review",
    title: "Reading a COA",
    paragraphs: [
      "A Certificate of Analysis summarizes what the lab reported for the named sample. Use it as lab documentation, not as medical or usage advice.",
      TESTING_SCOPE_STATEMENT,
    ],
  },
];
