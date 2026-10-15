import type { ContentPageMeta } from "./types";
import { LEGAL_ENTITY_NAME } from "./testing-scope";
import { getProductArtworkDisclosure } from "../products/artwork-disclosures";
import { reconstitutionSolution5mlReport, tesamorelin10mgReport } from "../batch-reports";
import { FDA_RESEARCH_NOTICE, RESEARCH_USE_NOTICE } from "./research-use";

export const disclaimerPageMeta: ContentPageMeta = {
  label: "LEGAL",
  title: "Disclaimer",
  description: "Research-use and regulatory disclaimers for PSL Labs.",
  intro: [
    `${LEGAL_ENTITY_NAME} products and website content are provided for laboratory research and educational reference only.`,
  ],
};

export const disclaimerParagraphs = [
  RESEARCH_USE_NOTICE,
  FDA_RESEARCH_NOTICE,
  `${LEGAL_ENTITY_NAME} products are sold strictly for laboratory and research use only. They are not intended for human or animal consumption, diagnosis, treatment, cure, or prevention of any disease.`,
  "Product descriptions, testing summaries, and Certificates of Analysis support research documentation. They do not constitute medical advice or usage guidance.",
  "A laboratory report covers the submitted sample and the tests and results listed in that report. It does not establish safety, efficacy, suitability for human or animal use, or regulatory approval. A reported result does not guarantee that every vial in a lot is identical.",
  `${LEGAL_ENTITY_NAME}. Questions about this disclaimer: support@psllabs.org.`,
];

export const productImageDisclaimer =
  "Product images are digitally rendered illustrations rather than photographs of the supplied vials. Physical packaging and labels may differ. Updated illustrations are not evidence that physical stock or labels have been changed. Review the label on the batch you receive and its original laboratory report.";

export const productLabelDisclosures = [
  {
    name: "Tesamorelin",
    description: getProductArtworkDisclosure({ handle: "tesamorelin" }),
    reportUrl: tesamorelin10mgReport.reportUrl!,
    taskNumber: tesamorelin10mgReport.taskNumber,
  },
  {
    name: "Reconstitution Solution",
    description: getProductArtworkDisclosure({ handle: "reconstitution-solution" }),
    reportUrl: reconstitutionSolution5mlReport.reportUrl!,
    taskNumber: reconstitutionSolution5mlReport.taskNumber,
  },
];
