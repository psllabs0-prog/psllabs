import assert from "node:assert/strict";
import { classifyCardReconciliationFailure } from "../lib/finance/card-reconciliation-warning";

for (const reason of [
  "invalid_payment_reference", "missing_provider_reference", "checkout_binding_mismatch",
  "missing_checkout_binding", "provider_identity_mismatch", "invalid_local_amount_or_currency",
  "provider_lookup_unavailable", "missing_completed_charge", "unrecognized_future_reason",
]) {
  for (const retryable of [true, false]) {
    assert.deepEqual(classifyCardReconciliationFailure({ ok: false, reason, retryable }),
      { kind: "lookup", warningType: "provider_lookup_failed" }, reason);
  }
}
for (const retryable of [true, false]) {
  assert.equal(classifyCardReconciliationFailure({ ok: false, reason: "payment_not_completed", retryable }).kind, "status");
}
assert.equal(classifyCardReconciliationFailure({ ok: false, reason: "payment_refunded_or_voided", retryable: false }).kind, "status");
assert.equal(classifyCardReconciliationFailure({ ok: false, reason: "payment_amount_mismatch", retryable: false }).kind, "amount");
assert.equal(classifyCardReconciliationFailure({ ok: false, reason: "payment_currency_mismatch", retryable: false }).kind, "currency");
console.log("[test-card-reconciliation-warning] all passed");
