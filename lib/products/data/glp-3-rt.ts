import type { Product } from "../types";

export const glp3Rt: Product = {
  handle: "glp-3-rt",
  tag: "RESEARCH PEPTIDE",
  name: "GLP-3 RT",
  shortDescription:
    "Lyophilized GLP-3 RT for laboratory and research use. Batch-specific COA included. Not for human consumption.",
  price: 94,
  subscribePrice: 94,
  stackRole: "Research peptide · laboratory use only",
  whyThisExists:
    "Research supply should come with batch-matched documentation—not marketing summaries. GLP-3 RT is released only after independent identity and purity testing, with a published COA for every lot.",
  bullets: [
    "Lyophilized research peptide",
    "Batch-matched COA published",
    "Third-party HPLC verification",
    "For laboratory and research use only",
  ],
  ingredients: [
    {
      name: "GLP-3 RT",
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
      question: "Is GLP-3 RT for human consumption?",
      answer:
        "No. GLP-3 RT is sold strictly for laboratory and research use only. It is not intended for human or animal consumption.",
    },
    {
      question: "Where is the COA for my batch?",
      answer:
        "Batch-specific Certificates of Analysis are published on this product page. Match your vial lot number to the corresponding report.",
    },
  ],
  testing: {
    description:
      "Every batch of GLP-3 RT is verified by an independent ISO 17025-accredited laboratory before release.",
    highlights: [
      "Identity confirmed by HPLC against reference standards",
      "Purity verified to meet release specifications",
      "Lot-specific COA published within 48 hours of release",
    ],
  },
  stackBlurb:
    "GLP-3 RT is supplied as a standalone research peptide with full batch documentation.",
};
