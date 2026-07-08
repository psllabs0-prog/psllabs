import type { ContentPageMeta, ContentSection } from "./types";
import { TESTING_SCOPE_STATEMENT } from "./testing-scope";

export const testingPageMeta: ContentPageMeta = {
  label: "TESTING & QUALITY",
  title: "Verified by a lab we don't own.",
  description:
    "How PSL Labs approaches third-party testing—and how to review published batch documentation.",
  intro: [
    "Independent batch documentation is published for selected lots. When a third-party laboratory report is available, we show the laboratory-reported identity, amount, and purity for the specific sample tested—not a marketing summary.",
    TESTING_SCOPE_STATEMENT,
  ],
};

export const testingSections: ContentSection[] = [
  {
    id: "identity",
    title: "Identity Verification",
    paragraphs: [
      `When an original laboratory report is published for a lot, identity results for the tested sample are shown on that report. ${TESTING_SCOPE_STATEMENT}`,
    ],
  },
  {
    id: "purity",
    title: "Purity Analysis",
    paragraphs: [
      "When purity results appear on a published report, they reflect the analytical methods and scope documented on that original laboratory report for the specific sample tested.",
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
      "Certificates of Analysis summarize the reported testing results for the sample identified in the report. COAs should be reviewed as supporting documentation, not as medical or usage guidance.",
    ],
  },
  {
    id: "quality-standard",
    title: "Quality Standard",
    paragraphs: [
      `PSL Labs is built around documentation, transparency, and batch-level verification when reports are published. ${TESTING_SCOPE_STATEMENT}`,
    ],
  },
];
