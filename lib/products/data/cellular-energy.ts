import { defaultBullets } from "../shared";
import type { Product } from "../types";

export const cellularEnergy: Product = {
  handle: "cellular-energy",
  tag: "CELLULAR ENERGY · NAD+",
  name: "Cellular Energy",
  shortDescription:
    "NMN and NR with TMG for methylation support. Formulated for NAD+ pathway maintenance as levels decline with age.",
  price: 68,
  subscribePrice: 58,
  stackRole: "NAD+ layer · morning with Foundation",
  whyThisExists:
    "NAD+ declines with age, and most precursor supplements either hide doses behind blends or pair NMN/NR without methylation support. Cellular Energy combines two well-studied precursors with TMG (trimethylglycine) to support the methylation cycle while NAD+ pools are replenished.",
  bullets: [...defaultBullets],
  ingredients: [
    {
      name: "Nicotinamide mononucleotide (NMN)",
      dose: "500 mg",
      mechanism:
        "Direct NAD+ precursor studied in human supplementation trials for effects on blood NAD+ metabolite levels.",
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
        "Methyl donor that supports homocysteine remethylation during high-dose NAD+ precursor supplementation.",
    },
  ],
  howToUse: [
    {
      step: 1,
      title: "Morning stack",
      description:
        "Take 2 capsules with Foundation at your first meal. NAD+ precursors are typically dosed earlier in the day.",
    },
    {
      step: 2,
      title: "Consistent timing",
      description:
        "Daily consistency supports stable NAD+ metabolite patterns. Avoid skipping multiple days between doses when establishing a baseline.",
    },
    {
      step: 3,
      title: "Add Recovery at night",
      description:
        "Cellular Energy supports NAD+ pools. Recovery (evening) addresses mitochondrial biogenesis—the complementary evening layer of the stack.",
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
      title:
        "Why NAD+ declines during aging: it's destroyed.",
      journal: "Cell Metabolism",
      year: 2016,
      volume: "23",
      pages: "965–966",
    },
    {
      authors: "Levine ME, Lu AT, Bennett DA, et al.",
      title:
        "Methylation-based biomarkers of aging and lifestyle factors.",
      journal: "Aging",
      year: 2020,
      volume: "12",
      pages: "6238–6254",
    },
  ],
  faqs: [
    {
      question: "Why both NMN and NR?",
      answer:
        "They use complementary conversion pathways to NAD+. We include both at disclosed doses rather than forcing a single-precursor choice without data on your individual response.",
    },
    {
      question: "Why is TMG included?",
      answer:
        "High-dose NAD+ precursors can increase demand on methylation pathways. TMG (betaine) donates methyl groups and supports homocysteine metabolism during supplementation.",
    },
    {
      question: "Can I take this without Foundation?",
      answer:
        "Yes, but the PSL protocol is designed as a stack. Foundation provides the daily base layer; Cellular Energy targets NAD+ specifically. Most users start with Foundation, then add this product.",
    },
    {
      question: "Will this affect my sleep?",
      answer:
        "Some individuals report sensitivity to NAD+ precursors taken late in the day. We recommend morning dosing with food. Adjust timing if you notice sleep disruption.",
    },
    {
      question: "How do you test each batch?",
      answer:
        "Third-party verification for identity, potency, and heavy metals. Full COAs are published per lot—same standard as every PSL product.",
    },
  ],
  testing: {
    description:
      "Cellular Energy batches are verified by independent third-party laboratories before any unit ships. We test what matters: identity, label potency, and contaminant panels.",
    highlights: [
      "NMN and NR identity verified by HPLC",
      "TMG potency confirmed at label claim",
      "Heavy metals panel per batch",
      "Published COA for every lot number",
    ],
  },
  stackBlurb:
    "Cellular Energy is Step 2—morning NAD+ support paired with Foundation. Add Recovery in the evening for mitochondrial function to complete the protocol.",
};
