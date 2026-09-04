export type { BatchReport, BatchReportStatus } from "./types";
export {
  formatReportedAmount,
  formatReportedPurity,
  statusLabel,
} from "./types";
export { batchReportToCertificateRows } from "./certificate-rows";
export { retatrutideBlackTopReport } from "./retatrutide-black-top";
export { ghkCu50mgReport } from "./ghk-cu-50mg";
export { tesamorelin10mgReport } from "./tesamorelin-10mg";
export { reconstitutionSolution5mlReport } from "./reconstitution-solution-5ml";
export { bpc15710mgReport } from "./bpc-157-10mg";

import { retatrutideBlackTopReport } from "./retatrutide-black-top";
import { ghkCu50mgReport } from "./ghk-cu-50mg";
import { tesamorelin10mgReport } from "./tesamorelin-10mg";
import { reconstitutionSolution5mlReport } from "./reconstitution-solution-5ml";
import { bpc15710mgReport } from "./bpc-157-10mg";
import type { BatchReport } from "./types";

export const batchReports: BatchReport[] = [
  retatrutideBlackTopReport,
  ghkCu50mgReport,
  tesamorelin10mgReport,
  reconstitutionSolution5mlReport,
  bpc15710mgReport,
];

export function getBatchReportsForProduct(handle: string): BatchReport[] {
  return batchReports.filter((report) => report.productHandle === handle);
}

export function getAvailableBatchReports(): BatchReport[] {
  return batchReports.filter((report) => report.status === "report_available");
}

export function hasAvailableReport(handle: string): boolean {
  return getBatchReportsForProduct(handle).some(
    (report) => report.status === "report_available"
  );
}

/** Match by task number or batch name (case-insensitive, partial OK). */
export function findBatchReport(query: string): BatchReport | undefined {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return undefined;

  return batchReports.find((report) => {
    if (report.status !== "report_available") return false;
    return (
      report.taskNumber.toLowerCase() === normalized ||
      report.batch.toLowerCase() === normalized ||
      report.batch.toLowerCase().includes(normalized) ||
      report.sku.toLowerCase() === normalized
    );
  });
}
