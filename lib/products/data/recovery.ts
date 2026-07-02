import { defaultBullets } from "../shared";
import type { Product } from "../types";

export const recovery: Product = {
  handle: "recovery",
  tag: "RECOVERY · MITOCHONDRIA",
  name: "Recovery",
  shortDescription:
    "Urolithin A, ubiquinol, and PQQ. The evening layer for mitochondrial function and cellular energy production.",
  price: 84,
  subscribePrice: 72,
  stockStatus: "in_stock",
  stackRole: "Mitochondrial layer · evening",
  whyThisExists:
    "Mitochondrial function declines with age, yet most \"mito\" supplements combine under-dosed CoQ10 with marketing ingredients and no disclosed amounts. Recovery targets three mechanisms—mitophagy signaling, electron transport support, and mitochondrial biogenesis—at doses referenced in published research.",
  bullets: [...defaultBullets],
  ingredients: [
    {
      name: "Urolithin A",
      dose: "500 mg",
      mechanism:
        "Postbiotic compound studied for induction of mitophagy—the selective recycling of damaged mitochondria—in human trials.",
    },
    {
      name: "Ubiquinol (Kaneka QH)",
      dose: "200 mg",
      mechanism:
        "Reduced form of CoQ10 that supports electron transport in the mitochondrial inner membrane and acts as a lipid-soluble antioxidant.",
    },
    {
      name: "Pyrroloquinoline quinone (PQQ)",
      dose: "20 mg",
      mechanism:
        "Cofactor studied for effects on mitochondrial biogenesis signaling pathways in preclinical and human supplementation research.",
    },
  ],
  howToUse: [
    {
      step: 1,
      title: "Evening dose",
      description:
        "Take 2 capsules with dinner or your last meal. Evening timing separates mitochondrial support from morning NAD+ and base-layer compounds.",
    },
    {
      step: 2,
      title: "Pair with morning stack",
      description:
        "Recovery works best as the third layer: Foundation + Cellular Energy in the morning, Recovery at night. Allow 2–4 weeks of consistent use before evaluating.",
    },
    {
      step: 3,
      title: "Training days",
      description:
        "Some users take Recovery post-exercise on training days. Maintain daily consistency regardless of activity level for baseline mitochondrial support.",
    },
  ],
  citations: [
    {
      authors: "Andreux PA, Blanco-Bose W, Ryu D, et al.",
      title:
        "The mitophagy activator urolithin A is safe and induces a molecular signature of improved mitochondrial and cellular health in humans.",
      journal: "Nature Metabolism",
      year: 2019,
      volume: "1",
      pages: "595–603",
    },
    {
      authors: "López-Lluch G, Del Rosario PM, Sainz RM, et al.",
      title:
        "Coenzyme Q supplementation in aging and disease.",
      journal: "Frontiers in Physiology",
      year: 2018,
      volume: "9",
      pages: "44",
    },
    {
      authors: "Chowanadisai W, Bauerly KA, Tchaparian E, et al.",
      title:
        "Pyrroloquinoline quinone stimulates mitochondrial biogenesis through cAMP response element-binding protein phosphorylation.",
      journal: "Journal of Biological Chemistry",
      year: 2010,
      volume: "285",
      pages: "142–152",
    },
    {
      authors: "Picard M, McEwen BS.",
      title:
        "Psychological stress and mitochondria: a conceptual framework.",
      journal: "Psychosomatic Medicine",
      year: 2018,
      volume: "80",
      pages: "126–140",
    },
  ],
  faqs: [
    {
      question: "Why take Recovery at night?",
      answer:
        "Evening dosing separates mitochondrial renewal from morning NAD+ and base-layer compounds. It also fits a natural wind-down rhythm for users who train or work during the day.",
    },
    {
      question: "Do I need the full stack?",
      answer:
        "Recovery is designed as Step 3 of the PSL protocol. It can be used alone, but the three products address complementary mechanisms—signaling, NAD+, and mitochondria.",
    },
    {
      question: "Is ubiquinol the same as CoQ10?",
      answer:
        "Ubiquinol is the reduced, bioactive form of CoQ10. We use ubiquinol rather than ubiquinone for direct mitochondrial membrane availability at the dose listed.",
    },
    {
      question: "Where does urolithin A come from?",
      answer:
        "Our urolithin A is synthetically produced to pharmaceutical-grade purity—not reliant on individual gut microbiome conversion from ellagitannins, which varies widely between people.",
    },
    {
      question: "How is each batch verified?",
      answer:
        "Independent third-party testing for identity, potency, and heavy metals. Full Certificates of Analysis published for every lot—same transparency standard across PSL.",
    },
  ],
  testing: {
    description:
      "Recovery undergoes the same third-party verification pipeline as every PSL product. No batch ships without passing identity, potency, and contaminant thresholds.",
    highlights: [
      "Urolithin A purity verified by HPLC",
      "Ubiquinol potency at label claim",
      "PQQ identity and heavy metals panel",
      "Lot-specific COA published online",
    ],
  },
  stackBlurb:
    "Recovery is Step 3—the evening mitochondrial layer. Pair with Foundation (morning base) and Cellular Energy (NAD+ support) for the complete daily protocol.",
};
