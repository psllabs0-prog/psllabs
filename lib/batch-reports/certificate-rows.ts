import type { CertificateRow } from "@/components/ui/certificate-panel";

import type { BatchReport } from "./types";
import { formatReportedPurity } from "./types";

/** Shared Certificate panel rows for a published batch report. */
export function batchReportToCertificateRows(
  report: BatchReport
): CertificateRow[] {
  return [
    { label: "SKU", value: report.sku },
    { label: "Batch", value: report.batch },
    { label: "Task", value: report.taskNumber },
    {
      label: "Purity",
      value: formatReportedPurity(report.purityPercent),
      highlight: true,
    },
    { label: "Laboratory", value: report.laboratory },
    { label: "Analysis", value: report.analysisDate },
  ];
}
