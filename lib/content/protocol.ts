import type { ContentPageMeta, ContentSection } from "./types";

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
      "The PSL catalog includes compound reference profiles organized by research area: Foundation (multi-compound base profile), Cellular Energy (NAD+ pathway materials), and Recovery (mitochondrial research compounds). Each profile lists disclosed actives, published citations, and batch-matched testing records.",
      "Products can be reviewed independently. Select materials based on your laboratory requirements and verify lot documentation before use.",
    ],
  },
  {
    id: "foundation",
    title: "Foundation — compound profile",
    paragraphs: [
      "Foundation documents trans-resveratrol, spermidine, fisetin, and methylated B vitamins at disclosed doses with per-ingredient mechanisms and batch COAs.",
      "Review the lot-specific Certificate of Analysis and reference citations before integrating into any research workflow.",
    ],
  },
  {
    id: "cellular-energy",
    title: "Cellular Energy — NAD+ pathway",
    paragraphs: [
      "Cellular Energy documents NMN, NR, and TMG at disclosed doses referenced in NAD+ pathway research literature.",
      "Batch identity, potency, and contaminant results are published per lot on the product page and in the Testing section.",
    ],
  },
  {
    id: "recovery",
    title: "Recovery — mitochondrial compounds",
    paragraphs: [
      "Recovery documents urolithin A, ubiquinol, and PQQ at disclosed doses cited in mitochondrial research publications.",
      "Match your lot number to the published COA and confirm specifications meet your laboratory requirements.",
    ],
  },
  {
    id: "documentation",
    title: "Documentation standards",
    paragraphs: [
      "Every batch receives independent third-party testing before release. Full Certificates of Analysis are published within 48 hours of batch release—linked from each product page.",
      "For institutional requests or documentation questions, contact support@psllabs.org with your lot number.",
    ],
  },
];
