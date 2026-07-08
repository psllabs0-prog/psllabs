export type BatchReportStatus = "report_available" | "pending";

export type BatchReport = {
  product: string;
  productHandle: string;
  sku: string;
  batch: string;
  taskNumber: string;
  laboratory: string;
  manufacturer: string;
  identityResult: string;
  /** Labeled vial / catalog strength — not the laboratory-reported amount. */
  nominalStrength: string;
  reportedAmountMg: number;
  purityPercent: number;
  testingOrderedDate: string;
  sampleReceivedDate: string;
  analysisDate: string;
  reportUrl: string;
  verificationUrl: string;
  status: BatchReportStatus;
  reportAltText: string;
};

export function formatReportedAmount(mg: number): string {
  return `${mg}mg`;
}

export function formatReportedPurity(percent: number): string {
  return `${percent}%`;
}

export function statusLabel(status: BatchReportStatus): string {
  switch (status) {
    case "report_available":
      return "Report Available";
    case "pending":
      return "Pending";
  }
}
