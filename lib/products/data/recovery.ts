import { defaultBullets } from "../shared";
import type { Product } from "../types";

export const recovery: Product = {
  handle: "recovery",
  tag: "RECOVERY · MITOCHONDRIA",
  name: "Recovery",
  shortDescription:
    "Reference profile for urolithin A, ubiquinol, and PQQ—mitochondrial research compounds at disclosed doses cited in published studies.",
  price: 84,
  stockStatus: "in_stock",
  stackRole: "Compound profile · research reference",
  whyThisExists:
    "Mitochondrial research often involves multiple cofactors, but many listings combine under-dosed actives without per-compound disclosure. Recovery publishes urolithin A, ubiquinol, and PQQ at documented amounts with batch-matched testing records for laboratory reference.",
  bullets: [...defaultBullets],
  ingredients: [
    {
      name: "Urolithin A",
      dose: "500 mg",
      mechanism:
        "Postbiotic compound studied for induction of mitophagy—the selective recycling of damaged mitochondria—in published research models.",
    },
    {
      name: "Ubiquinol (Kaneka QH)",
      dose: "200 mg",
      mechanism:
        "Reduced form of CoQ10 referenced in electron transport and mitochondrial membrane research.",
    },
    {
      name: "Pyrroloquinoline quinone (PQQ)",
      dose: "20 mg",
      mechanism:
        "Cofactor studied for effects on mitochondrial biogenesis signaling pathways in preclinical and published reference studies.",
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
        "Confirm identity, potency, and contaminant results meet your requirements. Contact support@psllabs.org for institutional requests.",
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
      title: "Coenzyme Q supplementation in aging and disease.",
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
      question: "What documentation is available for Recovery?",
      answer:
        "Each lot includes a published Certificate of Analysis with identity, potency, and contaminant panel results from an independent accredited laboratory.",
    },
    {
      question: "Is ubiquinol the same as CoQ10?",
      answer:
        "Ubiquinol is the reduced form of CoQ10. Recovery lists ubiquinol at a disclosed dose for research reference and batch documentation.",
    },
    {
      question: "Where does urolithin A come from?",
      answer:
        "Our urolithin A is synthetically produced to documented purity specifications—not reliant on variable microbiome conversion from ellagitannin precursors.",
    },
    {
      question: "Is Recovery intended for human use?",
      answer:
        "No. Recovery is sold for laboratory research, analytical, and educational reference only. It is not intended for human consumption, medical use, or therapeutic application.",
    },
    {
      question: "How is each batch verified?",
      answer:
        "Independent third-party testing for identity, potency, and heavy metals. Full Certificates of Analysis are published for every lot.",
    },
  ],
  testing: {
    description:
      "Recovery undergoes the same third-party verification pipeline as every PSL product. No batch ships without passing identity, potency, and contaminant thresholds.",
  },
  stackBlurb:
    "Recovery covers mitochondrial research compounds in the PSL catalog. See Foundation for base-layer profiles and Cellular Energy for NAD+ pathway reference materials.",
  researchDisclaimer:
    "Recovery is provided for laboratory research and educational reference only. Not for human consumption, medical use, or therapeutic application.",
};
