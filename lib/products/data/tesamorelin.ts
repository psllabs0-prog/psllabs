import { TESTING_SCOPE_STATEMENT } from "@/lib/content/testing-scope";
import {
  formatReportedAmount,
  formatReportedPurity,
  tesamorelin10mgReport,
} from "@/lib/batch-reports";
import { getProductImage } from "../images";
import type { Product } from "../types";

const report = tesamorelin10mgReport;
const amount = formatReportedAmount(report.reportedAmountMg!);
const purity = formatReportedPurity(report.purityPercent!);
const image = getProductImage("tesamorelin");

export const tesamorelin: Product = {
  handle: "tesamorelin",
  tag: "RESEARCH PEPTIDE",
  name: "Tesamorelin",
  shortDescription:
    "Tesamorelin — synthetic peptide reference standard for laboratory research. Laboratory-reported purity on third-party COA. Batch-specific Certificate of Analysis available. Not for human or animal use.",
  price: 89.99,
  stockStatus: "in_stock",
  imageSrc: image.src,
  imageAlt: image.alt,
  stackRole: "Research peptide · laboratory use only",
  whyThisExists:
    "Tesamorelin is a synthetic peptide reference standard supplied as a lyophilized powder for laboratory research. Purity: lot-specific by independent HPLC (see Batch Testing section for published data).\n\nThis product is supplied as a reference standard for analytical and in vitro laboratory applications. It is not intended for administration to humans or animals.\n\nFor lot-specific analytical data, refer to the Certificate of Analysis in the Batch Testing section below.",
  bullets: [
    "Lyophilized research peptide",
    "Independent batch documentation for selected lots",
    "Laboratory report available for published lots",
    "For laboratory and research use only",
  ],
  ingredients: [
    {
      name: "Tesamorelin",
      dose: "10mg nominal (see COA for laboratory-reported amount)",
      mechanism:
        "Research peptide supplied for in vitro and laboratory research applications.",
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
        "Match the lot number on your vial to the published laboratory report on this page or via COA / Batch Lookup before use in your workflow.",
    },
  ],
  citations: [],
  faqs: [
    {
      question: "Is Tesamorelin for human consumption?",
      answer:
        "No. Tesamorelin is sold strictly for laboratory and research use only. It is not intended for human or animal consumption.",
    },
    {
      question: "Where is the COA for my batch?",
      answer:
        "When a third-party laboratory report is published for your lot, it appears on this product page under Testing & Quality and in COA / Batch Lookup. Results apply only to the tested sample and batch identified in that report.",
    },
    {
      question:
        "What is the difference between nominal strength and the laboratory-reported amount?",
      answer:
        "The vial is labeled at a nominal strength of 10mg. The laboratory-reported amount on the original report reflects the specific sample tested and may differ. Review the published report for the batch you received.",
    },
  ],
  testing: {
    description: `Independent third-party laboratory documentation is published for selected lots when available. ${TESTING_SCOPE_STATEMENT}`,
  },
  stackBlurb:
    "Tesamorelin is supplied as a standalone research peptide with lot-specific documentation when published.",
  specifications: [
    { label: "SKU", value: "PSL-TESA-10MG" },
    { label: "Compound", value: "Tesamorelin" },
    { label: "Class", value: "Synthetic peptide" },
    { label: "Format", value: "Lyophilized powder" },
    { label: "Nominal Strength", value: "10mg" },
    {
      label: `Laboratory-Reported Amount — Batch ${report.batch}`,
      value: amount,
    },
    {
      label: `Laboratory-Reported Purity — Batch ${report.batch}`,
      value: purity,
    },
    { label: "Testing", value: "Per original laboratory report (selected lots)" },
    { label: "COA Status", value: "Third-Party Report Available" },
    { label: "Intended Use", value: "Laboratory research only" },
    { label: "Human Use", value: "Not for human or animal use" },
  ],
  researchDisclaimer:
    "This product is supplied for laboratory research use only. Not intended for human or animal administration, diagnostic use, or any therapeutic application.",
};
