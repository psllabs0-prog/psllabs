import type { ContentPageMeta, ContentSection } from "./types";

export const testingPageMeta: ContentPageMeta = {
  label: "TESTING & QUALITY",
  title: "Verified by a lab we don't own.",
  description:
    "How PSL Labs approaches third-party testing—and how to review published batch documentation.",
  intro: [
    "Independent batch documentation is published for selected lots. When a third-party laboratory report is available, we show the laboratory-reported identity, amount, and purity for the specific sample tested—not a marketing summary.",
  ],
};

export const testingSections: ContentSection[] = [
  {
    id: "identity",
    title: "Identity Verification",
    paragraphs: [
      "Every batch is reviewed to confirm the submitted material matches the expected compound profile. Identity testing helps verify that the sample aligns with the labeled compound before any purity result is interpreted.",
    ],
  },
  {
    id: "purity",
    title: "Purity Analysis",
    paragraphs: [
      "Samples are evaluated for estimated purity using laboratory analytical methods. The goal is to identify the main compound signal and screen for visible impurities, degradation products, or unexpected material.",
    ],
  },
  {
    id: "batch-documentation",
    title: "Batch Documentation",
    paragraphs: [
      "Selected batches are tied to a specific third-party report so researchers can review the documentation connected to that lot. Laboratory results apply only to the tested sample and batch identified in the report.",
    ],
  },
  {
    id: "coa-review",
    title: "COA Review",
    paragraphs: [
      "Certificates of Analysis summarize the reported testing results, including sample identification, testing method, purity result, and relevant notes. COAs should be reviewed as supporting documentation, not as medical or usage guidance.",
    ],
  },
  {
    id: "quality-standard",
    title: "Quality Standard",
    paragraphs: [
      "PSL Labs is built around documentation, transparency, and batch-level verification. Our goal is to make testing information easy to find, easy to understand, and clearly connected to each product batch.",
    ],
  },
];
