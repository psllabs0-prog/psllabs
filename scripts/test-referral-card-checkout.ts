/** Offline provider-session evidence tests. No real orders, provider requests, or card details. */
import assert from "node:assert/strict";
import { configuredReferralPromotionCode, configureAndVerifyReferralCardSession, referralCardSessionMatchesOrder, type ReferralCardCheckoutClient } from "../lib/tagada/referral-checkout";
import { cardSessionReadyToCharge, createCardSessionStore, sanitizeCardSession, type TagadaCardSession } from "../lib/checkout/card-session-storage";
import type { Order } from "../lib/orders/types";

let checks = 0;
const expect = (value: unknown, expected: unknown) => { assert.deepEqual(value, expected); checks++; };
const order = { currency: "USD", subtotal: 59.99, discountAmount: 6, shippingCost: 9.99, tax: 0, total: 63.98,
  email: "fixture@example.test", shipping: { firstName: "Fixture", lastName: "Buyer", address: "1 Test Street", city: "Phoenix", state: "AZ", zip: "85001", country: "US" },
} as Order;
const binding = { storeId: "store_fixture", checkoutToken: "checkout_fixture", items: [{ variantId: "var_fixture", quantity: 1 }] };
const correct = { id: "ch_fixture", ...binding, currency: "USD", customer: { email: order.email }, totals: { currency: "USD", subtotal: 5999, discount: 600, shipping: 999, tax: 0, total: 6398 } };
const session: TagadaCardSession = { orderId: "psl_fixture", checkoutToken: binding.checkoutToken, sessionToken: "session_fixture", storeId: binding.storeId,
  items: binding.items, customer: { email: order.email, firstName: "Fixture", lastName: "Buyer" },
  shippingAddress: { line1: "1 Test Street", city: "Phoenix", state: "AZ", postalCode: "85001", country: "US" },
  shippingCost: order.shippingCost, total: order.total, cartFingerprint: "fixture",
  pricing: { subtotal: order.subtotal, discountCode: "fixture-1234abcd", discountAmount: order.discountAmount, tax: order.tax } };

async function main() {
  const old = { ...process.env }; const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("External network is forbidden in referral card fixtures."); };
  process.env.PSL_VISUAL_PREVIEW = "0";
  try {
    expect(referralCardSessionMatchesOrder(order, binding, correct), true);
    for (const change of [{ storeId: "other" }, { checkoutToken: "other" }, { currency: "EUR" }, { id: "" },
      { items: [] }, { items: [{ variantId: "wrong", quantity: 1 }] }, { items: [{ variantId: "var_fixture", quantity: 2 }] },
      { items: [...binding.items, ...binding.items] }]) expect(referralCardSessionMatchesOrder(order, binding, { ...correct, ...change }), false);
    for (const field of ["subtotal", "discount", "shipping", "tax", "total"] as const) {
      for (const value of [correct.totals[field] + 1, String(correct.totals[field]), NaN]) {
        expect(referralCardSessionMatchesOrder(order, binding, { ...correct, totals: { ...correct.totals, [field]: value } }), false);
      }
    }
    expect(referralCardSessionMatchesOrder(order, binding, { ...correct, totals: { ...correct.totals, currency: "EUR" } }), false);
    expect(cardSessionReadyToCharge(session, correct, "ch_fixture"), true);
    expect(cardSessionReadyToCharge(session, { ...correct, totals: { ...correct.totals, subtotal: 6000, discount: 601 } }, "ch_fixture"), false);
    expect(cardSessionReadyToCharge(session, { ...correct, items: [{ variantId: "other", quantity: 1 }] }, "ch_fixture"), false);
    expect(sanitizeCardSession({ ...session, pricing: { ...session.pricing, discountAmount: 7 } }), null);
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
    const store = createCardSessionStore(() => storage, () => 100000);
    expect(store.start(session), true);
    expect(createCardSessionStore(() => storage, () => 100001).getSnapshot()?.session?.pricing, session.pricing);
    for (const value of [undefined, "", "bad code", "../admin", "x".repeat(101)]) {
      if (value === undefined) delete process.env.TAGADA_REFERRAL_PROMOTION_CODE;
      else process.env.TAGADA_REFERRAL_PROMOTION_CODE = value;
      expect(configuredReferralPromotionCode(), null);
    }
    process.env.TAGADA_REFERRAL_PROMOTION_CODE = " PROVIDER_REFERRAL10 ";
    expect(configuredReferralPromotionCode(), "PROVIDER_REFERRAL10");
    const calls: string[] = [];
    let fresh: unknown = correct; let initial: unknown = correct; let loads = 0; let promoFailure: string | null = null;
    const client: ReferralCardCheckoutClient = {
      loadSession: async () => { calls.push("load"); return ++loads === 1 ? initial : fresh; },
      updateCustomerAndAddress: async () => { calls.push("address"); },
      getShippingRates: async () => { calls.push("rates"); return [{ id: "wrong", amount: 1000, currency: "USD" }, { id: "exact", amount: 999, currency: "USD" }]; },
      selectShippingRate: async (_id, rate) => { calls.push(`shipping:${rate}`); },
      applyPromoCode: async (_id, code) => { calls.push(`promo:${code}`); if (promoFailure) throw Object.assign(new Error("Fixture provider failure"), { code: promoFailure }); },
    };
    await configureAndVerifyReferralCardSession(order, session, binding, configuredReferralPromotionCode(), client);
    expect(calls, ["load", "address", "promo:PROVIDER_REFERRAL10", "rates", "shipping:exact", "load"]);
    calls.length = 0; loads = 0;
    await assert.rejects(configureAndVerifyReferralCardSession(order, session, binding, null, client)); checks++;
    expect(calls, []);
    initial = { ...correct, checkoutToken: "wrong" };
    await assert.rejects(configureAndVerifyReferralCardSession(order, session, binding, configuredReferralPromotionCode(), client)); checks++;
    expect(calls, ["load"]);
    initial = correct; fresh = correct; calls.length = 0; loads = 0; promoFailure = "network_error";
    await configureAndVerifyReferralCardSession(order, session, binding, configuredReferralPromotionCode(), client);
    expect(calls.filter(call => call.startsWith("promo:")).length, 1);
    fresh = { ...correct, totals: { ...correct.totals, discount: 0, total: 6998 } }; calls.length = 0; loads = 0;
    await assert.rejects(configureAndVerifyReferralCardSession(order, session, binding, configuredReferralPromotionCode(), client)); checks++;
    fresh = correct; calls.length = 0; loads = 0; promoFailure = "validation_error";
    await assert.rejects(configureAndVerifyReferralCardSession(order, session, binding, configuredReferralPromotionCode(), client)); checks++;
    expect(calls.includes("rates"), false);
    promoFailure = null; fresh = { ...correct, totals: { ...correct.totals, discount: 0, total: 6998 } };
    initial = correct; fresh = { ...correct, totals: { ...correct.totals, total: 6998, discount: 0 } }; calls.length = 0; loads = 0;
    await assert.rejects(configureAndVerifyReferralCardSession(order, session, binding, configuredReferralPromotionCode(), client)); checks++;
    const repeat = { ...order, discountAmount: 0, total: 69.98 };
    calls.length = 0; loads = 0;
    await configureAndVerifyReferralCardSession(repeat, session, binding, null, client);
    expect(calls.includes("promo:PROVIDER_REFERRAL10"), false);
    process.env.PSL_VISUAL_PREVIEW = "1"; calls.length = 0; loads = 0;
    await assert.rejects(configureAndVerifyReferralCardSession(order, session, binding, configuredReferralPromotionCode(), client)); checks++;
    expect(calls, []);
    console.log(`PASS: Referral card checkout (${checks} checks: exact provider pricing/items, configured promotion, repeat orders, saved pricing/recovery, fail-closed preview; zero real orders, payments, or provider calls).`);
  } finally {
    globalThis.fetch = oldFetch;
    for (const key of Object.keys(process.env)) if (!(key in old)) delete process.env[key];
    Object.assign(process.env, old);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
