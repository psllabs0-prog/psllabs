export type { BatchReport, BatchReportStatus } from "./types";
export {
  formatReportedAmount,
  formatReportedPurity,
  statusLabel,
} from "./types";
export { retatrutideBlackTopReport } from "./retatrutide-black-top";

import { retatrutideBlackTopReport } from "./retatrutide-black-top";
import type { BatchReport } from "./types";

export const batchReports: BatchReport[] = [retatrutideBlackTopReport];

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
