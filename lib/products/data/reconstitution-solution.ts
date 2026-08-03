import type { Product } from "../types";
import { PRODUCT_VIAL_IMAGE } from "../images";

export const reconstitutionSolution: Product = {
  handle: "reconstitution-solution",
  tag: "LABORATORY REAGENT",
  name: "Reconstitution Solution",
  shortDescription:
    "Sterile bacteriostatic water for reconstituting lyophilized research peptides in the laboratory.",
  price: 14.99,
  whyThisExists:
    "Lyophilized research peptides are reconstituted in the laboratory before use in in vitro protocols. This sterile bacteriostatic water is supplied for that laboratory preparation step.",
  bullets: [
    "30mL sterile bacteriostatic water",
    "For laboratory reconstitution of lyophilized research peptides",
    "Research and laboratory use only",
  ],
  ingredients: [
    {
      name: "Bacteriostatic water",
      dose: "30mL",
      mechanism:
        "Sterile water with 0.9% benzyl alcohol as a bacteriostatic preservative for laboratory reconstitution.",
    },
  ],
  howToUse: [
    {
      step: 1,
      title: "Follow your protocol",
      description:
        "Use only according to your laboratory reconstitution protocol and aseptic technique.",
    },
    {
      step: 2,
      title: "Document volumes",
      description:
        "Record reconstitution volumes in your laboratory notebook for the specific peptide lot in use.",
    },
  ],
  citations: [],
  faqs: [
    {
      question: "Is this for human use?",
      answer:
        "No. This product is sold strictly for laboratory and research use only. It is not intended for human or animal consumption.",
    },
  ],
  testing: {
    description:
      "Supplied as a laboratory reagent. Refer to the product label for lot and sterility documentation when provided.",
  },
  stackBlurb: "Pair with lyophilized research peptides at reconstitution.",
  stackRole: "Reagent",
  stockStatus: "in_stock",
  imageSrc: PRODUCT_VIAL_IMAGE.src,
  imageAlt: "Reconstitution solution vial",
  specifications: [
    { label: "Volume", value: "30mL" },
    { label: "Form", value: "Sterile bacteriostatic water" },
    { label: "Use", value: "Laboratory reconstitution only" },
  ],
  researchDisclaimer:
    "For laboratory and research use only. Not for human or animal consumption.",
};
