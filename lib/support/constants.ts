/** Support agent configuration and classification constants. */

export const SUPPORT_FROM_EMAIL_DEFAULT = "support@psllabs.org";
export const SUPPORT_FROM_NAME_DEFAULT = "PSL Labs Support";

/** Auto-send is off until Luke explicitly enables it. */
export function isSupportAutoSendEnabled(): boolean {
  return process.env.SUPPORT_AUTO_SEND_ENABLED?.trim().toLowerCase() === "true";
}

/** Fixture/offline mode — no real IMAP/SMTP customer sends. */
export function isSupportTestMode(): boolean {
  return (
    process.env.SUPPORT_TEST_MODE?.trim().toLowerCase() === "true" ||
    process.env.NODE_ENV === "test"
  );
}

export const HIGH_CONFIDENCE_THRESHOLD = 0.85;
export const MIN_AUTO_SEND_CONFIDENCE = 0.85;

export type SupportRiskLevel = "GREEN" | "YELLOW" | "RED";

export type SupportCategory =
  | "order_status"
  | "tracking_not_updated"
  | "coa_location"
  | "batch_verification"
  | "batch_report_missing"
  | "payment_declined"
  | "card_payment"
  | "bitcoin_payment"
  | "damaged_order"
  | "wrong_item"
  | "missing_item"
  | "shipping_destination"
  | "shipping_timing"
  | "free_shipping"
  | "returns_replacement"
  | "out_of_stock"
  | "restock"
  | "documentation_mismatch"
  | "research_use_boundary"
  | "human_use_request"
  | "refund_request"
  | "chargeback"
  | "fraud"
  | "legal"
  | "regulatory"
  | "security"
  | "other";

/** Day-1 categories eligible for autonomous GREEN customer replies. */
export const AUTO_SEND_GREEN_CATEGORIES: ReadonlySet<SupportCategory> = new Set([
  "order_status",
  "tracking_not_updated",
  "coa_location",
  "batch_verification",
  "shipping_timing",
  "free_shipping",
  "shipping_destination",
  "out_of_stock",
  "card_payment",
  "bitcoin_payment",
  "research_use_boundary",
  "human_use_request", // fixed boundary only; still escalates internally
]);

export type MessageStatus =
  | "ingested"
  | "classified"
  | "drafted"
  | "auto_sent"
  | "escalated"
  | "human_sent"
  | "resolved"
  | "failed"
  | "skipped";

export const SUPPORT_TABLES = [
  "support_threads",
  "support_messages",
  "support_classifications",
  "support_responses",
  "support_escalations",
  "support_job_runs",
] as const;
