import { TESTING_SCOPE_STATEMENT } from "@/lib/content/testing-scope";
import {
  formatReportedAmount,
  formatReportedPurity,
  ghkCu50mgReport,
} from "@/lib/batch-reports";
import { getProductImage } from "../images";
import type { Product } from "../types";

const report = ghkCu50mgReport;
const amount = formatReportedAmount(report.reportedAmountMg!);
const purity = formatReportedPurity(report.purityPercent!);
const image = getProductImage("ghk-cu");

export const ghkCu: Product = {
  handle: "ghk-cu",
  tag: "RESEARCH PEPTIDE",
  name: "GHK-Cu",
  shortDescription:
    "GHK-Cu copper peptide reference standard for laboratory research. Third-party COA lists purity for the published batch. Not for human or animal use.",
  price: 24.99,
  stockStatus: "in_stock",
  imageSrc: image.src,
  imageAlt: image.alt,
  stackRole: "Research peptide · laboratory use only",
  whyThisExists:
    "GHK-Cu is a copper-binding tripeptide reference standard, sold as lyophilized powder for laboratory research. Lot purity comes from independent HPLC. See Batch Testing for published numbers.\n\nIt is a reference standard for analytical and in vitro lab work. Not for use in humans or animals.\n\nMatch your vial lot to the Certificate of Analysis in Batch Testing below.",
  bullets: [
    "Lyophilized research peptide",
    "Independent batch documentation for published lots",
    "Laboratory report available for published lots",
    "For laboratory and research use only",
  ],
  ingredients: [
    {
      name: "GHK-Cu",
      dose: "50mg nominal (see COA for laboratory-reported amount)",
      mechanism: "Copper peptide for in vitro and laboratory work.",
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
        "Store lyophilized material at -20°C. Avoid repeated freeze-thaw cycles.",
    },
    {
      step: 3,
      title: "Documentation",
      description:
        "Match the lot on your vial to the published lab report on this page or in COA Lookup.",
    },
  ],
  citations: [],
  faqs: [
    {
      question: "Is GHK-Cu for human consumption?",
      answer:
        "No. GHK-Cu is for laboratory research only. Not for human or animal consumption.",
    },
    {
      question: "Where is the COA for my batch?",
      answer:
        "If a third-party lab report is published for your lot, you will find it under Testing & Quality on this page and in COA Lookup. Results apply only to the sample and batch named on that report.",
    },
    {
      question:
        "What is the difference between nominal strength and the laboratory-reported amount?",
      answer:
        "The vial label shows a nominal strength of 50mg. The laboratory-reported amount on the original report is for the sample that was tested and may differ. Check the published report for the batch you received.",
    },
  ],
  testing: {
    description: `We publish an independent third-party lab report for active lots. ${TESTING_SCOPE_STATEMENT}`,
  },
  stackBlurb:
    "GHK-Cu is a standalone research peptide with lot-specific documentation when published.",
  specifications: [
    { label: "SKU", value: "PSL-GHKCU-50MG" },
    { label: "Compound", value: "GHK-Cu" },
    { label: "Class", value: "Copper peptide" },
    { label: "Format", value: "Lyophilized powder" },
    { label: "Nominal Strength", value: "50mg" },
    {
      label: `Laboratory-Reported Amount (Batch ${report.batch})`,
      value: amount,
    },
    {
      label: `Laboratory-Reported Purity (Batch ${report.batch})`,
      value: purity,
    },
    { label: "Testing", value: "Per original laboratory report for published lots" },
    { label: "COA Status", value: "Third-Party Report Available" },
    { label: "Intended Use", value: "Laboratory research only" },
    { label: "Human Use", value: "Not for human or animal use" },
  ],
  researchDisclaimer:
    "This product is for laboratory research use only. Not for human or animal administration, diagnostic use, or any therapeutic application.",
};
