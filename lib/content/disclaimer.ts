import type { ContentPageMeta } from "./types";
import { LEGAL_ENTITY_NAME } from "./testing-scope";

export const disclaimerPageMeta: ContentPageMeta = {
  label: "LEGAL",
  title: "Disclaimer",
  description: "Research-use and regulatory disclaimers for PSL Labs.",
  intro: [
    `${LEGAL_ENTITY_NAME} products and website content are provided for laboratory research and educational reference only.`,
  ],
};

export const disclaimerParagraphs = [
  `${LEGAL_ENTITY_NAME} products are sold strictly for laboratory and research use only. They are not intended for human or animal consumption, diagnosis, treatment, cure, or prevention of any disease.`,
  "Product descriptions, testing summaries, and Certificates of Analysis support research documentation. They do not constitute medical advice or usage guidance.",
  "A laboratory report covers the submitted sample and the tests and results listed in that report. It does not establish safety, efficacy, suitability for human or animal use, or regulatory approval. A reported result does not guarantee that every vial in a lot is identical.",
  `${LEGAL_ENTITY_NAME}. Questions about this disclaimer: support@psllabs.org.`,
];
