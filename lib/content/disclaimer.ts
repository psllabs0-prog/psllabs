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
  "Product descriptions, testing summaries, and Certificates of Analysis support research documentation—they do not constitute medical advice or usage guidance.",
  "These statements have not been evaluated by the Food and Drug Administration. This product is not intended to diagnose, treat, cure, or prevent any disease.",
  `${LEGAL_ENTITY_NAME} — Questions about this disclaimer: support@psllabs.org.`,
];
