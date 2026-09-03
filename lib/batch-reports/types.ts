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
  /** Peptide amount in mg when the lab reports a mass. Omit for concentration-only reports. */
  reportedAmountMg?: number;
  /** HPLC purity when reported. Omit when the COA has no purity line. */
  purityPercent?: number;
  /**
   * Non-mass primary result (e.g. Benzyl Alcohol concentration).
   * When set, used in the certificate panel and amount grid instead of mg.
   */
  reportedResult?: {
    label: string;
    value: string;
  };
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
