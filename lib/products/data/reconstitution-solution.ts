import { TESTING_SCOPE_STATEMENT } from "@/lib/content/testing-scope";
import { reconstitutionSolution5mlReport } from "@/lib/batch-reports";
import { getProductImage } from "../images";
import type { Product } from "../types";

const report = reconstitutionSolution5mlReport;
const image = getProductImage("reconstitution-solution");

export const reconstitutionSolution: Product = {
  handle: "reconstitution-solution",
  tag: "LABORATORY REAGENT",
  name: "Reconstitution Solution",
  shortDescription:
    "Laboratory reconstitution solution for preparing research compounds. Batch-specific Certificate of Analysis available. Not for human or animal use.",
  price: 12.99,
  stockStatus: "in_stock",
  imageSrc: image.src,
  imageAlt: image.alt,
  stackRole: "Laboratory reagent · research use only",
  whyThisExists:
    "Reconstitution Solution is a laboratory reagent supplied for preparing research compounds in in vitro workflows. Benzyl alcohol concentration is reported on published lot-specific laboratory reports when available.\n\nThis product is supplied for laboratory research applications only. It is not intended for administration to humans or animals.\n\nFor lot-specific analytical data, refer to the Certificate of Analysis in the Batch Testing section below.",
  bullets: [
    "Laboratory reagent",
    "Independent batch documentation for published lots",
    "Laboratory report available for published lots",
    "For laboratory and research use only",
  ],
  ingredients: [
    {
      name: "Reconstitution Solution",
      dose: "5ml",
      mechanism:
        "Aqueous laboratory solution with benzyl alcohol for reconstitution of research compounds in vitro.",
    },
  ],
  howToUse: [
    {
      step: 1,
      title: "Research use only",
      description:
        "For laboratory and research use only. Not for human or animal consumption.",
    },
    {
      step: 2,
      title: "Storage",
      description:
        "Store according to label guidance. Keep sealed when not in use.",
    },
    {
      step: 3,
      title: "Documentation",
      description:
        "Match the lot number on your vial to the published laboratory report on this page or via COA / Batch Lookup before use in your workflow.",
    },
  ],
  citations: [],
  faqs: [
    {
      question: "Is Reconstitution Solution for human consumption?",
      answer:
        "No. Reconstitution Solution is sold strictly for laboratory and research use only. It is not intended for human or animal consumption.",
    },
    {
      question: "Where is the COA for my batch?",
      answer:
        "When a third-party laboratory report is published for your lot, it appears on this product page under Testing & Quality and in COA / Batch Lookup. Results apply only to the tested sample and batch identified in that report.",
    },
    {
      question: "What does the laboratory report measure?",
      answer:
        "The published Janoshik report for this lot identifies the sample as bacteriostatic water and reports benzyl alcohol concentration for the tested sample. Review the original report for full details.",
    },
  ],
  testing: {
    description: `Independent third-party laboratory documentation is published for active lots. ${TESTING_SCOPE_STATEMENT}`,
  },
  stackBlurb:
    "Reconstitution Solution is supplied as a laboratory reagent with lot-specific documentation when published.",
  specifications: [
    { label: "SKU", value: "PSL-RS-5ML" },
    { label: "Product", value: "Reconstitution Solution" },
    { label: "Class", value: "Laboratory reagent" },
    { label: "Format", value: "Liquid solution" },
    { label: "Nominal Strength", value: "5ml" },
    {
      label: `${report.reportedResult!.label} (Batch ${report.batch})`,
      value: report.reportedResult!.value,
    },
    { label: "Testing", value: "Per original laboratory report for published lots" },
    { label: "COA Status", value: "Third-Party Report Available" },
    { label: "Intended Use", value: "Laboratory research only" },
    { label: "Human Use", value: "Not for human or animal use" },
  ],
  researchDisclaimer:
    "This product is supplied for laboratory research use only. Not intended for human or animal administration, diagnostic use, or any therapeutic application.",
};
