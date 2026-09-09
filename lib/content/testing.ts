import type { ContentPageMeta, ContentSection } from "./types";
import { TESTING_SCOPE_STATEMENT } from "./testing-scope";

export const testingPageMeta: ContentPageMeta = {
  label: "TESTING & QUALITY",
  title: "Tested by a lab we don't own.",
  description:
    "How PSL Labs publishes third-party lab reports, and how to review them.",
  intro: [
    "We publish third-party lab reports for released lots. When a report is available, you can see the identity, purity, and measured amount for the sample the lab tested.",
    TESTING_SCOPE_STATEMENT,
  ],
};

export const testingSections: ContentSection[] = [
  {
    id: "identity",
    title: "Identity",
    paragraphs: [
      "Identity testing helps confirm what material the lab detected in the tested sample. Look for this on the original report when it is published.",
      TESTING_SCOPE_STATEMENT,
    ],
  },
  {
    id: "purity",
    title: "Purity",
    paragraphs: [
      "Purity describes how clean the sample looked under the lab's test method. If a purity percentage appears on the report, it applies to that tested sample and method only.",
    ],
  },
  {
    id: "batch-documentation",
    title: "Batch documentation",
    paragraphs: [
      "Each published report is tied to a specific lot. You can review the documentation for that batch, not a generic product claim.",
    ],
  },
  {
    id: "coa-review",
    title: "Reading a COA",
    paragraphs: [
      "A Certificate of Analysis summarizes what the lab reported for the named sample. Use it as lab documentation, not as medical or usage advice.",
    ],
  },
  {
    id: "quality-standard",
    title: "Our standard",
    paragraphs: [
      "We focus on publishing clear, checkable reports for active lots so you can review the data yourself.",
      TESTING_SCOPE_STATEMENT,
    ],
  },
];
