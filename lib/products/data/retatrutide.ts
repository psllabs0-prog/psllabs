import type { Product } from "../types";

export const retatrutide: Product = {
  handle: "retatrutide",
  tag: "RESEARCH PEPTIDE",
  name: "Retatrutide",
  shortDescription:
    "Lyophilized Retatrutide for laboratory and research use. Batch-specific COA included. Not for human consumption.",
  price: 94,
  subscribePrice: 94,
  stockStatus: "in_stock",
  stackRole: "Research peptide · laboratory use only",
  whyThisExists:
    "Research supply should come with batch-matched documentation—not marketing summaries. Retatrutide is released only after independent identity and purity testing, with a published COA for every lot.",
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
        "Batch-specific Certificates of Analysis are published on this product page. Match your vial lot number to the corresponding report.",
    },
  ],
  testing: {
    description:
      "[PLACEHOLDER: Testing laboratory name, accreditation, and panels run per batch.] Every batch is verified by an independent third-party laboratory before release.",
    highlights: [
      "Identity confirmed by HPLC against reference standards",
      "[PLACEHOLDER: Minimum purity threshold — e.g. 99%+ by HPLC.]",
      "Lot-specific COA published within 48 hours of release",
    ],
  },
  stackBlurb:
    "Retatrutide is supplied as a standalone research peptide with full batch documentation.",
  dosage: [
    "For laboratory and research use only. Not for human or animal consumption.",
    "[PLACEHOLDER: Lyophilized quantity per vial — e.g. 5 mg, 10 mg.]",
    "[PLACEHOLDER: Reconstitution instructions — solvent, volume, concentration.]",
    "[PLACEHOLDER: Storage conditions — temperature, shelf life, freeze-thaw guidance.]",
  ],
};
