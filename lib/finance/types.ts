export type PaymentProvider = "btcpay" | "tagada" | "authnet";

export type PaymentEventProcessingStatus =
  | "received"
  | "processed"
  | "ignored"
  | "failed";

export type SheetSyncStatus = "pending" | "synced" | "failed" | "skipped";

export type ReconciliationWarningType =
  | "psl_paid_provider_not_settled"
  | "provider_success_psl_missing"
  | "amount_mismatch"
  | "currency_mismatch"
  | "duplicate_provider_payment_id"
  | "provider_lookup_failed";

export type PaymentEventRow = {
  id: number;
  provider: PaymentProvider;
  providerEventId: string;
  providerPaymentId: string | null;
  providerOrderId: string | null;
  pslOrderId: string | null;
  eventType: string;
  eventTimestamp: string | null;
  amount: number | null;
  currency: string | null;
  paymentStatus: string | null;
  paymentMethod: string | null;
  processingStatus: PaymentEventProcessingStatus;
  processingError: string | null;
  processedAt: string | null;
  createdAt: string;
};

export type FinanceTransactionRow = {
  id: number;
  pslOrderId: string;
  provider: PaymentProvider;
  providerPaymentId: string | null;
  paymentMethod: string | null;
  eventTimestamp: string;
  grossAmount: number;
  currency: string;
  /** Null when fee is unknown — never invent zero. */
  processorFee: number | null;
  products: string | null;
  quantities: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  landingPage: string | null;
  sheetSyncStatus: SheetSyncStatus;
  sheetSyncError: string | null;
  sheetSyncedAt: string | null;
  sourcePaymentEventId: number | null;
  createdAt: string;
  updatedAt: string;
};

export type ReconciliationWarningRow = {
  id: number;
  warningKey: string;
  warningType: ReconciliationWarningType;
  pslOrderId: string | null;
  provider: string | null;
  providerPaymentId: string | null;
  message: string;
  status: "open" | "resolved";
  createdAt: string;
  updatedAt: string;
};

export type FinanceJobRunRow = {
  id: number;
  jobName: string;
  startedAt: string;
  finishedAt: string | null;
  status: "running" | "ok" | "error";
  summaryJson: Record<string, unknown> | null;
  error: string | null;
};
