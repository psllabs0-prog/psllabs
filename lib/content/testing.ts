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
      "Each tested batch is tied to a specific report so customers can review the available documentation connected to that lot. Batch-level documentation helps make quality easier to verify instead of relying on claims alone.",
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
