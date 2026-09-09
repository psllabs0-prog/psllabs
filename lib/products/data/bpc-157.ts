import { TESTING_SCOPE_STATEMENT } from "@/lib/content/testing-scope";
import {
  formatReportedAmount,
  formatReportedPurity,
  bpc15710mgReport,
} from "@/lib/batch-reports";
import { getProductImage } from "../images";
import type { Product } from "../types";

const report = bpc15710mgReport;
const amount = formatReportedAmount(report.reportedAmountMg!);
const purity = formatReportedPurity(report.purityPercent!);
const image = getProductImage("bpc-157");

export const bpc157: Product = {
  handle: "bpc-157",
  tag: "RESEARCH PEPTIDE",
  name: "BPC-157",
  shortDescription:
    "BPC-157 reference standard for laboratory research. Third party COA lists purity for the published batch. Not for human or animal use.",
  price: 49.99,
  stockStatus: "in_stock",
  imageSrc: image.src,
  imageAlt: image.alt,
  stackRole: "Research peptide · laboratory use only",
  whyThisExists:
    "BPC-157 is a synthetic peptide reference standard, sold as freeze dried powder for laboratory research. Lot purity comes from an independent lab purity test. See Batch Testing for published numbers.\n\nIt is a reference standard for analytical and in vitro lab work. Not for use in humans or animals.\n\nMatch your vial lot to the Certificate of Analysis in Batch Testing below.",
  bullets: [
    "Freeze dried research peptide",
    "Independent batch documentation for published lots",
    "Laboratory report available for published lots",
    "For laboratory and research use only",
  ],
  ingredients: [
    {
      name: "BPC-157",
      dose: "10mg nominal (see COA for laboratory-reported amount)",
      mechanism: "Research peptide for in vitro and laboratory work.",
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
        "Store freeze dried material at -20°C. Avoid repeated freeze thaw cycles.",
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
      question: "Is BPC-157 for human consumption?",
      answer:
        "No. BPC-157 is for laboratory research only. Not for human or animal consumption.",
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
        "The vial label shows a nominal strength of 10mg. The laboratory-reported amount on the original report is for the sample that was tested and may differ. Check the published report for the batch you received.",
    },
  ],
  testing: {
    description: `We publish an independent third party lab report for active batches. ${TESTING_SCOPE_STATEMENT}`,
  },
  stackBlurb:
    "BPC-157 is a standalone research peptide with lot-specific documentation when published.",
  specifications: [
    { label: "SKU", value: "PSL-BPC157-10MG" },
    { label: "Compound", value: "BPC-157" },
    { label: "Class", value: "Synthetic peptide" },
    { label: "Format", value: "Lyophilized powder" },
    { label: "Label amount", value: "10mg" },
    {
      label: `Amount measured by the lab (Batch ${report.batch})`,
      value: amount,
    },
    {
      label: `Reported purity (Batch ${report.batch})`,
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
