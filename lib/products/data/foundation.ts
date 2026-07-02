import { defaultBullets } from "../shared";
import type { Product } from "../types";

export const foundation: Product = {
  handle: "foundation",
  tag: "FOUNDATION · DAILY",
  name: "Foundation",
  shortDescription:
    "The base layer. Trans-resveratrol, spermidine, fisetin, and methylated B-complex—four mechanisms in one daily capsule.",
  price: 52,
  subscribePrice: 44,
  stockStatus: "in_stock",
  stackRole: "Base layer · take every morning",
  whyThisExists:
    "Most daily longevity formulas rely on proprietary blends, under-dosed actives, or ingredients chosen for label appeal rather than evidence. Foundation is the opposite: four compounds with distinct mechanisms—sirtuin signaling, autophagy support, senescent-cell clearance, and methylation-ready B vitamins—each listed at the dose ranges used in published research. One capsule. Full disclosure. No filler stack.",
  bullets: [...defaultBullets],
  ingredients: [
    {
      name: "Trans-resveratrol",
      dose: "500 mg",
      mechanism:
        "Polyphenol studied for activation of sirtuin pathways and cellular stress-response signaling in preclinical and human supplementation research.",
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
        "Active folate form that bypasses MTHFR conversion; supports methylation-dependent pathways without unmetabolized folic acid accumulation.",
    },
    {
      name: "Methylcobalamin + P-5-P",
      dose: "500 mcg / 10 mg",
      mechanism:
        "Methylated B12 with active B6 (P-5-P) to support homocysteine metabolism and methylation cycle cofactor availability.",
    },
  ],
  howToUse: [
    {
      step: 1,
      title: "Morning, with food",
      description:
        "Take 2 capsules with your first meal containing dietary fat. Resveratrol and related polyphenols absorb more reliably alongside fat than on an empty stomach.",
    },
    {
      step: 2,
      title: "Same time, every day",
      description:
        "Cellular processes respond to consistency. Anchor Foundation to a daily ritual—coffee, breakfast, or your first meal window—rather than sporadic dosing.",
    },
    {
      step: 3,
      title: "Stack when ready",
      description:
        "Foundation is designed as the daily base. Add Cellular Energy for NAD+ pathway support and Recovery for mitochondrial function when you want the full three-part protocol.",
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
      question: "When should I take Foundation?",
      answer:
        "Take 2 capsules in the morning with food. If you experience mild GI sensitivity, split the dose: 1 capsule with breakfast and 1 with lunch. Avoid taking late in the evening if you are sensitive to B-vitamin energizing effects.",
    },
    {
      question: "Can I take Foundation with NAD+ precursors?",
      answer:
        "Yes. Foundation is formulated to pair with Cellular Energy (NMN/NR + TMG). There are no known contraindications at listed doses, but consult your physician if you take blood thinners, immunosuppressants, or prescription medications.",
    },
    {
      question: "Is this a proprietary blend?",
      answer:
        "No. Every ingredient and dose appears on the label, this page, and every Certificate of Analysis. We do not use proprietary blends or \"complexes\" that hide individual amounts.",
    },
    {
      question: "How is each batch tested?",
      answer:
        "Every lot is tested by an independent ISO 17025-accredited laboratory for identity (HPLC), potency, and heavy metals (ICP-MS). Results are published as full COAs—not marketing summaries.",
    },
    {
      question: "What if I already take a multivitamin?",
      answer:
        "Compare your multivitamin's folate and B12 forms and doses before stacking. Foundation uses methylated forms at research-informed levels, not general RDA coverage. Avoid doubling high-dose B vitamins without qualified guidance.",
    },
  ],
  testing: {
    description:
      "Foundation is manufactured in a cGMP-certified facility and verified by a third-party lab we do not own. Every batch receives full-panel testing before release.",
    highlights: [
      "Identity confirmed by HPLC against reference standards",
      "Potency verified at label claim ± tolerance",
      "Heavy metals screened: lead, arsenic, cadmium, mercury",
      "Microbial limits tested per USP guidelines",
      "Lot-specific COA published within 48 hours of release",
    ],
  },
  stackBlurb:
    "Foundation is Step 1—the daily base layer for cellular signaling, autophagy, and methylation support. Cellular Energy addresses NAD+ decline. Recovery targets mitochondrial renewal. Together, they form the complete PSL protocol.",
};
