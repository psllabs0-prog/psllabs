import type { ContentPageMeta, ContentSection } from "./types";
import { TESTING_SCOPE_STATEMENT } from "./testing-scope";

export const protocolPageMeta: ContentPageMeta = {
  label: "CATALOG REFERENCE",
  title: "Compound profiles and documentation.",
  description:
    "How PSL Labs organizes research compound profiles, testing records, and batch documentation.",
  intro: [
    "PSL Labs groups related compound profiles for reference and documentation purposes. All materials are sold for laboratory research use only—not for human consumption or medical application.",
  ],
};

export const protocolSections: ContentSection[] = [
  {
    id: "overview",
    title: "Overview",
    paragraphs: [
      "The PSL catalog includes compound reference profiles organized by research area: Foundation (multi-compound base profile), Cellular Energy (NAD+ pathway materials), and Recovery (mitochondrial research compounds). Each profile lists disclosed actives, published citations, and batch documentation when published.",
      "Products can be reviewed independently. Select materials based on your laboratory requirements and verify lot documentation before use.",
    ],
  },
  {
    id: "foundation",
    title: "Foundation — compound profile",
    paragraphs: [
      "Foundation documents trans-resveratrol, spermidine, fisetin, and methylated B vitamins at disclosed doses with per-ingredient mechanisms and batch documentation when published.",
      "Review the lot-specific laboratory report and reference citations before integrating into any research workflow.",
    ],
  },
  {
    id: "cellular-energy",
    title: "Cellular Energy — NAD+ pathway",
    paragraphs: [
      "Cellular Energy documents NMN, NR, and TMG at disclosed doses referenced in NAD+ pathway research literature.",
      "When a laboratory report is published for your lot, review it on the product page or in COA / Batch Lookup.",
    ],
  },
  {
    id: "recovery",
    title: "Recovery — mitochondrial compounds",
    paragraphs: [
      "Recovery documents urolithin A, ubiquinol, and PQQ at disclosed doses cited in mitochondrial research publications.",
      "Match your lot number to any published report and confirm specifications meet your laboratory requirements.",
    ],
  },
  {
    id: "documentation",
    title: "Documentation standards",
    paragraphs: [
      `When third-party laboratory reports are published for a lot, they are linked from the product page and COA / Batch Lookup. ${TESTING_SCOPE_STATEMENT}`,
      "For institutional requests or documentation questions, contact support@psllabs.org with your lot number.",
    ],
  },
];
