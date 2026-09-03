import type { CertificateRow } from "@/components/ui/certificate-panel";

import type { BatchReport } from "./types";
import { formatReportedPurity } from "./types";

/** Shared Certificate panel rows for a published batch report. */
export function batchReportToCertificateRows(
  report: BatchReport
): CertificateRow[] {
  const rows: CertificateRow[] = [
    { label: "SKU", value: report.sku },
    { label: "Batch", value: report.batch },
    { label: "Task", value: report.taskNumber },
  ];

  if (report.purityPercent !== undefined) {
    rows.push({
      label: "Purity",
      value: formatReportedPurity(report.purityPercent),
      highlight: true,
    });
  } else if (report.reportedResult) {
    rows.push({
      label: report.reportedResult.label,
      value: report.reportedResult.value,
      highlight: true,
    });
  }

  rows.push(
    { label: "Laboratory", value: report.laboratory },
    { label: "Analysis", value: report.analysisDate }
  );

  return rows;
}
