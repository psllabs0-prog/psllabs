import assert from "node:assert/strict";
import {
  validateTagadaCardEvidence,
  verifyTagadaCardPayment,
  type CardOrderForVerification,
  type TagadaCardReads,
  type TagadaPaymentHints,
} from "../lib/tagada/verify-payment";

// Sanitized fixtures use the observed Node SDK shapes, never live credentials.
const local: CardOrderForVerification = {
  orderId: "psl_fixture", paymentMethod: "card", invoiceId: "checkout_fixture",
  total: 59.99, currency: "USD",
};
const hint: TagadaPaymentHints = {
  paymentId: "pay_fixture", tagadaOrderId: "order_fixture", checkoutSessionId: "ch_fixture",
};
const payment = {
  id: "pay_fixture", orderId: "order_fixture", storeId: "store_fixture", accountId: "acc_fixture",
  amount: 5999, currency: "USD", status: "succeeded", subStatus: "approved",
  transactions: [{
    id: "txn_fixture", paymentId: "pay_fixture", storeId: "store_fixture", accountId: "acc_fixture",
    type: "purchase", status: "succeeded",
    result: "approved", isTest: false, draft: false, amount: 5999, currency: "USD",
  }],
};
const providerOrder = {
  id: "order_fixture", storeId: "store_fixture", accountId: "acc_fixture", status: "paid",
  currency: "USD", paidAmount: 5999, checkoutSessionId: "ch_fixture", draft: false,
  checkoutSession: { id: "ch_fixture", storeId: "store_fixture", checkoutToken: "checkout_fixture", draft: false },
  summaries: [{ orderId: "order_fixture", checkoutSessionId: "ch_fixture", totalAmount: 5999, currency: "USD" }],
  payments: [payment],
};
let checks = 0;
function evaluate(
  p: unknown = payment,
  o: unknown = providerOrder,
  l: CardOrderForVerification = local,
  h: TagadaPaymentHints = hint,
) {
  checks++;
  return validateTagadaCardEvidence(l, h, p, o, "store_fixture");
}
function denied(p: unknown = payment, o: unknown = providerOrder, l = local, h = hint) {
  assert.equal(evaluate(p, o, l, h).ok, false);
}

async function main() {
  // Any unintended network access turns the offline suite into a failure.
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("Network is forbidden in this test"); };
  try {
    assert.deepEqual(evaluate(), {
      ok: true, paymentId: "pay_fixture", providerOrderId: "order_fixture", amountCents: 5999, currency: "USD",
    });
    assert.equal(evaluate({ ...payment, status: "captured", mode: "capture", transactions: [{ ...payment.transactions[0], type: "capture", status: "captured" }] }).ok, true);
    assert.equal(evaluate(payment, { ...providerOrder, metadata: { orderId: "untrusted_other_order" } }).ok, true);
    denied(payment, providerOrder, { ...local, paymentMethod: "bitcoin" });
    denied(payment, providerOrder, { ...local, paymentMethod: null });
    denied(payment, providerOrder, { ...local, invoiceId: null });
    denied(payment, providerOrder, { ...local, invoiceId: "pay_fixture" });
    denied(payment, providerOrder, { ...local, invoiceId: "order_fixture" });
    for (const total of [0, -1, NaN, Infinity]) denied(payment, providerOrder, { ...local, total });
    denied(payment, providerOrder, { ...local, currency: "EUR" });
    denied(payment, providerOrder, local, {});
    denied(payment, providerOrder, local, { paymentId: "../../payments" });
    denied(payment, providerOrder, local, { paymentId: 1 });
    denied(payment, providerOrder, local, { paymentId: "pay_other" });
    denied(payment, providerOrder, local, { tagadaOrderId: "order_other" });
    denied(payment, providerOrder, local, { ...hint, checkoutSessionId: "ch_other" });
    denied(null);
    denied(payment, null);
    for (const field of ["id", "orderId", "storeId", "accountId", "amount", "currency", "status", "transactions"]) {
      const altered: Record<string, unknown> = structuredClone(payment);
      delete altered[field];
      denied(altered);
    }
    for (const field of ["id", "storeId", "accountId", "paidAmount", "currency", "status", "checkoutSessionId", "checkoutSession", "draft", "summaries", "payments"]) {
      const altered: Record<string, unknown> = structuredClone(providerOrder);
      delete altered[field];
      denied(payment, altered);
    }
    denied({ ...payment, storeId: "store_other" });
    denied(payment, { ...providerOrder, storeId: "store_other" });
    denied(payment, { ...providerOrder, checkoutSession: { ...providerOrder.checkoutSession, storeId: "store_other" } });
    denied({ ...payment, accountId: "acc_other" });
    denied({ ...payment, orderId: "order_other" });
    denied(payment, { ...providerOrder, checkoutSessionId: "ch_other" });
    denied(payment, { ...providerOrder, checkoutSession: { ...providerOrder.checkoutSession, id: "ch_other" } });
    denied(payment, { ...providerOrder, checkoutSession: { ...providerOrder.checkoutSession, checkoutToken: "checkout_other" } });
    denied(payment, { ...providerOrder, checkoutSession: { storeId: "store_fixture", checkoutToken: "checkout_fixture" } });
    denied(payment, { ...providerOrder, checkoutSession: { ...providerOrder.checkoutSession, draft: true } });
    denied(payment, { ...providerOrder, checkoutSession: { ...providerOrder.checkoutSession, draft: undefined } });
    for (const status of ["authorized", "pending", "refunded", "partially_refunded", "voided", "declined", "completed", "unknown"]) {
      denied({ ...payment, status });
    }
    denied({ ...payment, status: "pending", subStatus: "authorized" });
    denied({ ...payment, subStatus: "authorized" });
    denied({ ...payment, subStatus: "unknown" });
    denied({ ...payment, mode: "auth" });
    denied({ ...payment, mode: "verify" });
    assert.equal(evaluate({ ...payment, requireAction: "redirect" }).ok, true);
    denied({ ...payment, status: "pending", requireAction: "redirect" });
    denied({ ...payment, requireAction: true });
    denied(payment, { ...providerOrder, status: "authorized" });
    for (const flag of ["isTest", "draft"]) {
      denied({ ...payment, [flag]: true });
      denied(payment, { ...providerOrder, [flag]: true });
      denied({ ...payment, transactions: [{ ...payment.transactions[0], [flag]: true }] });
      const charge: Record<string, unknown> = { ...payment.transactions[0] };
      delete charge[flag];
      denied({ ...payment, transactions: [charge] });
    }
    for (const amount of [5998, 6000, 59.99, "5999", null]) {
      denied({ ...payment, amount });
      denied(payment, { ...providerOrder, paidAmount: amount });
      denied(payment, { ...providerOrder, summaries: [{ ...providerOrder.summaries[0], totalAmount: amount }] });
    }
    denied({ ...payment, currency: "EUR" });
    denied(payment, { ...providerOrder, currency: "EUR" });
    denied(payment, { ...providerOrder, summaries: [{ ...providerOrder.summaries[0], currency: "EUR" }] });
    denied(payment, { ...providerOrder, summaries: [{ ...providerOrder.summaries[0], orderId: "order_other" }] });
    denied(payment, { ...providerOrder, summaries: [{ ...providerOrder.summaries[0], checkoutSessionId: "ch_other" }] });
    denied(payment, { ...providerOrder, summaries: [providerOrder.summaries[0], providerOrder.summaries[0]] });
    denied(payment, { ...providerOrder, payments: [{ id: "pay_other" }] });
    for (const overrides of [
      { status: "pending" }, { status: "authorized" }, { type: "auth" }, { amount: 5998 },
      { currency: "EUR" }, { paymentId: "pay_other" }, { storeId: "store_other" }, { accountId: "acc_other" },
      { result: "declined" }, { requireAction: "redirect" },
    ]) denied({ ...payment, transactions: [{ ...payment.transactions[0], ...overrides }] });
    denied({ ...payment, transactions: [...payment.transactions, { type: "refund", status: "succeeded" }] });
    denied({ ...payment, transactions: [...payment.transactions, { type: "void", status: "captured" }] });
    denied({ ...payment, transactions: [] });
    denied({ ...payment, refundedAmount: 1 });
    denied(payment, { ...providerOrder, refundedAmount: 5999 });
    assert.equal(evaluate({ ...payment, refundedAmount: 0 }, { ...providerOrder, refundedAmount: 0 }).ok, true);
    const stillPending = evaluate(payment, { ...providerOrder, status: "pending" });
    assert.equal(stillPending.ok, false);
    assert.equal(!stillPending.ok && stillPending.retryable, true);

    const calls: string[] = [];
    const reads: TagadaCardReads = {
      storeId: "store_fixture",
      retrievePayment: async (id) => { calls.push(`payment:${id}`); return structuredClone(payment); },
      retrieveOrder: async (id) => { calls.push(`order:${id}`); return { order: structuredClone(providerOrder) }; },
    };
    for (const hints of [hint, { paymentId: "pay_fixture" }, { tagadaOrderId: "order_fixture" }]) {
      checks++;
      assert.equal((await verifyTagadaCardPayment(local, hints, reads)).ok, true);
    }
    assert.equal(calls.filter((call) => call === "payment:pay_fixture").length, 3);
    assert.equal(calls.filter((call) => call === "order:order_fixture").length, 3);
    checks++;
    assert.equal((await verifyTagadaCardPayment(local, hint, reads)).ok, true, "repeat verification is idempotent");
    for (const error of [Object.assign(new Error("404"), { status: 404 }), new Error("timeout")]) {
      checks++;
      assert.deepEqual(await verifyTagadaCardPayment(local, hint, { ...reads, retrievePayment: async () => { throw error; } }), {
        ok: false, reason: "provider_lookup_unavailable", retryable: true,
      });
    }
    const before = calls.length;
    checks++;
    assert.equal((await verifyTagadaCardPayment(local, {}, reads)).ok, false);
    assert.equal(calls.length, before, "invalid claims do not call the provider");
    checks++;
    assert.equal((await verifyTagadaCardPayment(local, { paymentId: "pay_other" }, reads)).ok, false);
    checks++;
    assert.equal((await verifyTagadaCardPayment(local, { tagadaOrderId: "order_other" }, reads)).ok, false);
    checks++;
    assert.equal((await verifyTagadaCardPayment(local, { tagadaOrderId: "order_fixture" }, {
      ...reads, retrieveOrder: async () => ({ order: { ...providerOrder, payments: [] } }),
    })).ok, false);
    checks++;
    assert.equal((await verifyTagadaCardPayment(local, { tagadaOrderId: "order_fixture" }, {
      ...reads, retrieveOrder: async () => ({ order: { ...providerOrder, payments: [payment, { ...payment, id: "pay_other" }] } }),
    })).ok, false);
    console.log(`Card verification: ${checks} offline evidence and provider-read checks passed.`);
  } finally {
    globalThis.fetch = previousFetch;
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
