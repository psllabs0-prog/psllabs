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
