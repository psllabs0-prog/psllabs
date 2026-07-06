import { defaultBullets } from "../shared";
import type { Product } from "../types";

export const cellularEnergy: Product = {
  handle: "cellular-energy",
  tag: "CELLULAR ENERGY · NAD+",
  name: "Cellular Energy",
  shortDescription:
    "Reference profile for NMN, NR, and TMG—NAD+ pathway precursors and methylation cofactors at disclosed doses cited in published research.",
  price: 68,
  stockStatus: "in_stock",
  stackRole: "Compound profile · research reference",
  whyThisExists:
    "NAD+ pathway research often involves multiple precursors and methylation cofactors, but many listings omit doses or pair compounds without documentation. Cellular Energy publishes NMN, NR, and TMG at disclosed amounts with batch-matched testing records for laboratory reference.",
  bullets: [...defaultBullets],
  ingredients: [
    {
      name: "Nicotinamide mononucleotide (NMN)",
      dose: "500 mg",
      mechanism:
        "NAD+ precursor studied in published trials for effects on blood NAD+ metabolite levels in research contexts.",
    },
    {
      name: "Nicotinamide riboside (NR)",
      dose: "300 mg",
      mechanism:
        "Alternative NAD+ precursor that converts via the salvage pathway; complementary to NMN in published research.",
    },
    {
      name: "Trimethylglycine (TMG)",
      dose: "500 mg",
      mechanism:
        "Methyl donor referenced in homocysteine remethylation studies involving high-dose NAD+ precursor research models.",
    },
  ],
  howToUse: [
    {
      step: 1,
      title: "Review lot documentation",
      description:
        "Match the lot number on your label to the batch-specific Certificate of Analysis before integrating into any laboratory workflow.",
    },
    {
      step: 2,
      title: "Verify specifications",
      description:
        "Confirm identity, potency, and contaminant results meet your requirements. Contact support@psllabs.org for additional documentation.",
    },
    {
      step: 3,
      title: "Handle per research protocols",
      description:
        "Store and handle according to institutional SOPs and product storage guidance. For laboratory research use only.",
    },
  ],
  citations: [
    {
      authors: "Yoshino J, Baur JA, Imai SI.",
      title: "NAD+ intermediates: the biology and therapeutic potential of NMN and NR.",
      journal: "Cell Metabolism",
      year: 2018,
      volume: "27",
      pages: "513–528",
    },
    {
      authors: "Martens CR, Denman BA, Mazzo MR, et al.",
      title:
        "Chronic nicotinamide riboside supplementation is well-tolerated and elevates NAD+ in healthy middle-aged and older adults.",
      journal: "Nature Communications",
      year: 2018,
      volume: "9",
      pages: "1286",
    },
    {
      authors: "Schultz MB, Sinclair DA.",
      title: "Why NAD+ declines during aging: it's destroyed.",
      journal: "Cell Metabolism",
      year: 2016,
      volume: "23",
      pages: "965–966",
    },
    {
      authors: "Levine ME, Lu AT, Bennett DA, et al.",
      title: "Methylation-based biomarkers of aging and lifestyle factors.",
      journal: "Aging",
      year: 2020,
      volume: "12",
      pages: "6238–6254",
    },
  ],
  faqs: [
    {
      question: "Why are both NMN and NR included?",
      answer:
        "They use complementary conversion pathways to NAD+ in published research. Both are listed at disclosed doses for reference and documentation purposes.",
    },
    {
      question: "Why is TMG included?",
      answer:
        "High-dose NAD+ precursor research models show increased demand on methylation pathways. TMG is included as a documented methyl donor referenced in the literature.",
    },
    {
      question: "Is Cellular Energy intended for human use?",
      answer:
        "No. Cellular Energy is sold for laboratory research, analytical, and educational reference only. It is not intended for human consumption, medical use, or therapeutic application.",
    },
    {
      question: "How is each batch tested?",
      answer:
        "Third-party verification for identity, potency, and heavy metals. Full COAs are published per lot—the same standard as every PSL product.",
    },
    {
      question: "Where can I find the COA for my lot?",
      answer:
        "Batch-specific Certificates of Analysis are published on this product page and in the Testing section. Match your vial lot number to the corresponding report.",
    },
  ],
  testing: {
    description:
      "Cellular Energy batches are verified by independent third-party laboratories before release. Identity, label potency, and contaminant panels are tested against specifications.",
  },
  stackBlurb:
    "Cellular Energy covers NAD+ pathway reference compounds in the PSL catalog. See Foundation for base-layer compound profiles and Recovery for mitochondrial research materials.",
  researchDisclaimer:
    "Cellular Energy is provided for laboratory research and educational reference only. Not for human consumption, medical use, or therapeutic application.",
};
