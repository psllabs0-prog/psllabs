import { defaultBullets } from "../shared";
import type { Product } from "../types";

export const foundation: Product = {
  handle: "foundation",
  tag: "FOUNDATION · COMPOUND PROFILE",
  name: "Foundation",
  shortDescription:
    "Reference profile for trans-resveratrol, spermidine, fisetin, and methylated B-complex—four disclosed actives with documented mechanisms in published research.",
  price: 52,
  stockStatus: "in_stock",
  stackRole: "Compound profile · research reference",
  whyThisExists:
    "Many compound listings hide doses behind blends or omit per-ingredient documentation. Foundation publishes four actives—sirtuin signaling, autophagy support, senescent-cell research, and methylation cofactors—each at disclosed amounts referenced in the literature, with batch-matched testing records.",
  bullets: [...defaultBullets],
  ingredients: [
    {
      name: "Trans-resveratrol",
      dose: "500 mg",
      mechanism:
        "Polyphenol studied for activation of sirtuin pathways and cellular stress-response signaling in preclinical and published reference studies.",
    },
    {
      name: "Spermidine",
      dose: "3 mg",
      mechanism:
        "Polyamine associated with autophagy induction—the intracellular process that clears damaged proteins and organelles.",
    },
    {
      name: "Fisetin",
      dose: "100 mg",
      mechanism:
        "Flavonoid classified as a senolytic in animal models; studied for effects on senescent cell burden and tissue function markers.",
    },
    {
      name: "Methylfolate (5-MTHF)",
      dose: "400 mcg",
      mechanism:
        "Active folate form that bypasses MTHFR conversion; studied in methylation-dependent pathway research.",
    },
    {
      name: "Methylcobalamin + P-5-P",
      dose: "500 mcg / 10 mg",
      mechanism:
        "Methylated B12 with active B6 (P-5-P) referenced in homocysteine metabolism and methylation cofactor research.",
    },
  ],
  howToUse: [
    {
      step: 1,
      title: "Review lot documentation",
      description:
        "Match the lot number on your label to the batch-specific Certificate of Analysis on this product page or in the Testing section before integrating into any workflow.",
    },
    {
      step: 2,
      title: "Verify specifications",
      description:
        "Confirm identity, purity, and contaminant panel results meet your laboratory requirements. Contact support@psllabs.org for institutional documentation requests.",
    },
    {
      step: 3,
      title: "Handle per research protocols",
      description:
        "Store and handle materials according to your institutional SOPs and the storage guidance on the product page. For laboratory research use only.",
    },
  ],
  citations: [
    {
      authors: "Baur JA, Pearson KJ, Price NL, et al.",
      title:
        "Resveratrol improves health and survival of mice on a high-calorie diet.",
      journal: "Nature",
      year: 2006,
      volume: "444",
      pages: "337–342",
    },
    {
      authors: "Eisenberg T, Abdellatif M, Schroeder S, et al.",
      title:
        "Cardioprotection and lifespan extension by the natural polyamine spermidine.",
      journal: "Nature Medicine",
      year: 2016,
      volume: "22",
      pages: "1428–1438",
    },
    {
      authors: "Yousefzadeh MJ, Zhu Y, McGowan SJ, et al.",
      title:
        "Fisetin is a senotherapeutic that extends health and lifespan in old mice.",
      journal: "EBioMedicine",
      year: 2018,
      volume: "36",
      pages: "18–28",
    },
    {
      authors: "Kennedy DO.",
      title:
        "B vitamins and the brain: mechanisms, dose, and efficacy—a review.",
      journal: "Nutrients",
      year: 2016,
      volume: "8",
      pages: "68",
    },
  ],
  faqs: [
    {
      question: "What documentation is available for Foundation?",
      answer:
        "Each lot includes a published Certificate of Analysis with identity (HPLC), potency, and contaminant panel results from an independent ISO 17025-accredited laboratory.",
    },
    {
      question: "Are ingredient amounts fully disclosed?",
      answer:
        "Yes. Every active and dose appears on the label, this page, and the batch COA. We do not use proprietary blends or undisclosed complexes.",
    },
    {
      question: "Is Foundation intended for human use?",
      answer:
        "No. Foundation is sold for laboratory research, analytical, and educational reference only. It is not intended for human consumption, medical use, or therapeutic application.",
    },
    {
      question: "How is each batch tested?",
      answer:
        "Every lot is tested by an independent ISO 17025-accredited laboratory for identity (HPLC), potency, and heavy metals (ICP-MS). Full COAs are published per batch—not marketing summaries.",
    },
    {
      question: "Can I request additional documentation?",
      answer:
        "Contact support@psllabs.org with your lot number for institutional or compliance documentation requests.",
    },
  ],
  testing: {
    description:
      "Foundation batches are verified by independent third-party laboratories before release. Every lot receives full-panel testing against published specifications.",
  },
  stackBlurb:
    "Foundation is one compound profile in the PSL catalog. See Cellular Energy for NAD+ pathway reference materials and Recovery for mitochondrial research compounds.",
  researchDisclaimer:
    "Foundation is provided for laboratory research and educational reference only. Not for human consumption, medical use, or therapeutic application.",
};
