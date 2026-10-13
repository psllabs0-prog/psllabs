import { reconstitutionSolution5mlReport } from "@/lib/batch-reports/reconstitution-solution-5ml";
import { tesamorelin10mgReport } from "@/lib/batch-reports/tesamorelin-10mg";
import { PRODUCT_IMAGES } from "./images";

/** Preserve the original artwork while disclosing claims its report does not support. */
export function getProductArtworkDisclosure({
  handle,
  imageSrc,
  concise = false,
}: {
  handle?: string;
  imageSrc?: string;
  concise?: boolean;
}): string | null {
  if (handle === "tesamorelin" || imageSrc === PRODUCT_IMAGES.tesamorelin.src) {
    if (concise) return `Original artwork says “99%+ Purity”; report ${tesamorelin10mgReport.taskNumber} lists ${tesamorelin10mgReport.purityPercent}% for the tested sample. The report does not support the label claim.`;
    return `The original label artwork says “99%+ Purity.” Published Janoshik report ${tesamorelin10mgReport.taskNumber} lists ${tesamorelin10mgReport.purityPercent}% purity for the submitted sample, below that label claim. This report does not support the label’s purity claim. Not for human or animal use.`;
  }

  if (handle === "reconstitution-solution" || imageSrc === PRODUCT_IMAGES["reconstitution-solution"].src) {
    if (concise) return `Original artwork says “99%+ Purity”; report ${reconstitutionSolution5mlReport.taskNumber} measures benzyl alcohol (${reconstitutionSolution5mlReport.reportedResult?.value}), not purity, sterility or endotoxin levels.`;
    return `The original label artwork says “99%+ Purity.” Published Janoshik report ${reconstitutionSolution5mlReport.taskNumber} lists benzyl alcohol at ${reconstitutionSolution5mlReport.reportedResult?.value}; it does not establish 99% purity, sterility, or endotoxin levels. Do not treat the label claim as a verified result. Not for human or animal use.`;
  }

  return null;
}
