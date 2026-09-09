import { TESTING_SCOPE_STATEMENT } from "@/lib/content/testing-scope";
import {
  formatReportedAmount,
  formatReportedPurity,
  retatrutideBlackTopReport,
} from "@/lib/batch-reports";
import { getProductImage } from "../images";
import { retatrutideSource } from "../retatrutide-source";
import type { Product } from "../types";

const blackTop = retatrutideBlackTopReport;
const blackTopAmount = formatReportedAmount(blackTop.reportedAmountMg ?? 0);
const blackTopPurity = formatReportedPurity(blackTop.purityPercent ?? 0);
const image = getProductImage("retatrutide");

export const retatrutide: Product = {
  handle: retatrutideSource.handle,
  tag: retatrutideSource.tag,
  name: retatrutideSource.name,
  shortDescription: retatrutideSource.shortDescription,
  price: retatrutideSource.price,
  stockStatus: retatrutideSource.stockStatus,
  imageSrc: image.src,
  imageAlt: image.alt,
  stackRole: "Research peptide · laboratory use only",
  whyThisExists:
    "Retatrutide (CAS 2381089-83-2) is a synthetic peptide analogue studied in vitro at GLP-1, GIP, and glucagon receptors. Molecular formula: C223H330F3N57O68. Approximate molecular weight: 4845.4 g/mol. Lot purity comes from independent HPLC. See Batch Testing for published numbers. The lyophilized powder is soluble in aqueous buffer at pH 7.4. Store at -20°C and avoid repeated freeze-thaw cycles.\n\nIt is a reference standard for receptor-binding assays, cell-signaling studies, and pharmacokinetic research in appropriate model systems. Not for use in humans or animals.\n\nMatch your vial lot to the Certificate of Analysis in Batch Testing below.",
  bullets: [
    "Lyophilized research peptide",
    "Independent batch documentation for published lots",
    "Laboratory report available for published lots",
    "For laboratory and research use only",
  ],
  ingredients: [
    {
      name: "Retatrutide",
      dose: `${retatrutideSource.nominalStrength} nominal (see COA for laboratory-reported amount)`,
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
      question: "Is Retatrutide for human consumption?",
      answer:
        "No. Retatrutide is for laboratory research only. Not for human or animal consumption.",
    },
    {
      question: "Where is the COA for my batch?",
      answer:
        "If a third-party lab report is published for your lot, you will find it under Testing & Quality on this page and in COA Lookup. Results apply only to the sample and batch named on that report.",
    },
    {
      question: "What is the difference between nominal strength and the laboratory-reported amount?",
      answer:
        `The vial label shows a nominal strength of ${retatrutideSource.nominalStrength}. The laboratory-reported amount on the original report is for the sample that was tested and may differ. Check the published report for the batch you received.`,
    },
  ],
  testing: {
    description: `We publish an independent third-party lab report for active lots. ${TESTING_SCOPE_STATEMENT}`,
  },
  stackBlurb:
    "Retatrutide is a standalone research peptide with lot-specific documentation when published.",
  specifications: [
    { label: "SKU", value: retatrutideSource.sku },
    { label: "Compound", value: "Retatrutide" },
    { label: "CAS", value: "2381089-83-2" },
    { label: "Alternate Name", value: "LY3437943" },
    { label: "Class", value: "Synthetic peptide analogue" },
    { label: "In vitro receptor targets", value: "GLP-1, GIP, Glucagon" },
    { label: "Molecular formula", value: "C223H330F3N57O68" },
    { label: "Molecular weight", value: "≈4845.4 g/mol" },
    { label: "Format", value: "Lyophilized powder" },
    { label: "Nominal Strength", value: retatrutideSource.nominalStrength },
    {
      label: `Laboratory-Reported Amount (Batch ${blackTop.batch})`,
      value: blackTopAmount,
    },
    {
      label: `Laboratory-Reported Purity (Batch ${blackTop.batch})`,
      value: blackTopPurity,
    },
    { label: "Testing", value: "Per original laboratory report for published lots" },
    { label: "COA Status", value: "Third-Party Report Available" },
    { label: "Intended Use", value: "Laboratory research only" },
    { label: "Human Use", value: "Not for human or animal use" },
  ],
  researchDisclaimer:
    "This product is for laboratory research use only. Not for human or animal administration, diagnostic use, or any therapeutic application.",
};
