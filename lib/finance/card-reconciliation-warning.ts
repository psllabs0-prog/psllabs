import type { TagadaCardVerification } from "@/lib/tagada/verify-payment";
import type { ReconciliationWarningType } from "./types";

/** A missing/invalid lookup or binding is not evidence that a charge failed. */
export function classifyCardReconciliationFailure(
  verification: Extract<TagadaCardVerification, { ok: false }>,
): { kind: "amount" | "currency" | "lookup" | "status"; warningType: ReconciliationWarningType } {
  if (verification.reason === "payment_amount_mismatch") {
    return { kind: "amount", warningType: "amount_mismatch" };
  }
  if (verification.reason === "payment_currency_mismatch") {
    return { kind: "currency", warningType: "currency_mismatch" };
  }
  if (verification.reason === "payment_not_completed" ||
      verification.reason === "payment_refunded_or_voided") {
    return { kind: "status", warningType: "psl_paid_provider_not_settled" };
  }
  // Includes legacy checkout tokens in the payment-ID column, unavailable
  // provider reads, and unproven order binding. Keep an open review warning;
  // do not relax payment verification or infer settlement from local status.
  return { kind: "lookup", warningType: "provider_lookup_failed" };
}
