import type { Product } from "../types";
import { PRODUCT_VIAL_IMAGE } from "../images";

export const retatrutide: Product = {
  handle: "retatrutide",
  tag: "RESEARCH PEPTIDE",
  name: "Retatrutide",
  shortDescription:
    "Investigational triple-receptor agonist for laboratory research. Not approved for human use.",
  price: 94,
  stockStatus: "in_stock",
  imageSrc: PRODUCT_VIAL_IMAGE.src,
  imageAlt: PRODUCT_VIAL_IMAGE.alt,
  stackRole: "Research peptide · laboratory use only",
  whyThisExists:
    "Retatrutide is an investigational triple-receptor agonist designed to interact with three incretin-related pathways: GLP-1, GIP, and glucagon receptors. This multi-pathway profile is what makes the compound scientifically notable in metabolic research.\n\nGLP-1 receptor activity is associated with appetite regulation, glucose-dependent insulin signaling, and delayed gastric emptying.\n\nGIP receptor activity is involved in nutrient handling, insulin response, and adipose tissue signaling.\n\nGlucagon receptor activity is associated with hepatic energy metabolism and increased energy expenditure pathways.\n\nRetatrutide remains an investigational research compound and is not approved for human use.",
  bullets: [
    "Lyophilized research peptide",
    "Batch-matched COA published",
    "Third-party HPLC verification",
    "For laboratory and research use only",
  ],
  ingredients: [
    {
      name: "Retatrutide",
      dose: "See COA for batch quantity",
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
        "Store lyophilized material refrigerated or frozen per your laboratory protocol. Avoid repeated freeze-thaw cycles.",
    },
    {
      step: 3,
      title: "Documentation",
      description:
        "Match the lot number on your vial to the published COA on this product page before use in your workflow.",
    },
  ],
  citations: [],
  faqs: [
    {
      question: "Is Retatrutide for human consumption?",
      answer:
        "No. Retatrutide is sold strictly for laboratory and research use only. It is not intended for human or animal consumption.",
    },
    {
      question: "Where is the COA for my batch?",
      answer:
        "Batch-specific Certificates of Analysis are published on this product page when available. Match your vial lot number to the corresponding report.",
    },
  ],
  testing: {
    description:
      "Every batch is verified by an independent third-party laboratory before release. Full panel details appear on the lot-specific COA.",
  },
  stackBlurb:
    "Retatrutide is supplied as a standalone research peptide with full batch documentation.",
  specifications: [
    { label: "Compound", value: "Retatrutide" },
    { label: "Alternate Name", value: "LY3437943" },
    { label: "Class", value: "Triple receptor agonist" },
    { label: "Receptor Targets", value: "GLP-1, GIP, Glucagon" },
    { label: "Format", value: "Lyophilized powder" },
    { label: "Strength", value: "10mg" },
    { label: "Purity", value: "Batch-specific, shown on COA" },
    { label: "Testing", value: "Third-party analysis" },
    { label: "COA Status", value: "Lot-specific COA" },
    { label: "Intended Use", value: "Laboratory research only" },
    { label: "Human Use", value: "Not approved for human use" },
  ],
  researchDisclaimer:
    "Retatrutide is an investigational compound. This page is for laboratory research and educational reference only. Not for human consumption, medical use, or therapeutic application.",
};
