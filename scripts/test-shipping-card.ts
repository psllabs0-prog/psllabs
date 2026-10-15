/** Offline service-binding regressions. Every provider action below is a fixture. */
import assert from "node:assert/strict";
import { configuredTagadaShippingRateId, pickTagadaShippingRate } from "../lib/tagada/select-shipping-rate";
import { configureAndVerifyCardSession, type ReferralCardCheckoutClient } from "../lib/tagada/referral-checkout";
import { normalizeTagadaCheckoutPriceEvidence } from "../lib/tagada/checkout-price-evidence";
import { cardShippingContextFingerprint, cardSessionMatchesShipping, cardSessionReadyToCharge, createCardSessionStore,
  type CardShippingContext, type TagadaCardSession } from "../lib/checkout/card-session-storage";
import { CHECKOUT_RESEARCH_ACK_VERSION } from "../lib/checkout/research-acknowledgement";
import { standardShippingSelection } from "../lib/shipping/policy";
import type { Order } from "../lib/orders/types";

let checks = 0;
const check = (value: unknown, expected: unknown) => { assert.deepEqual(value, expected); checks++; };
const rates = [
  { id: "ground", name: "USPS Ground Advantage", amount: 2499, currency: "USD" },
  { id: "priority2499", name: "USPS Priority Mail", amount: 2499, currency: "USD" },
  { id: "priority2299", name: "USPS Priority Mail", amount: 2299, currency: "USD" },
];
const env = { TAGADA_SHIPPING_PRIORITY_2499_RATE_ID: "priority2499", TAGADA_SHIPPING_PRIORITY_2299_RATE_ID: "priority2299",
  TAGADA_SHIPPING_STANDARD_PAID_RATE_ID: "standard999", TAGADA_SHIPPING_STANDARD_FREE_RATE_ID: "standard0" };
const context: CardShippingContext = { method: "priority", quote: "signed_fixture_quote", email: "fixture@example.test",
  address: { firstName: "Fixture", lastName: "Buyer", address: "1 Test Street", city: "Phoenix", state: "AZ", zip: "85085", country: "US" },
  discountCode: null, paymentMethod: "card" };
const order = { orderId: "psl_fixture", email: context.email, currency: "USD", subtotal: 59.99, discountAmount: 0,
  shippingCost: 24.99, tax: 0, total: 84.98, shipping: { ...context.address, selection: {
    ...standardShippingSelection(), method: "priority", providerServiceCode: "Priority", serviceDisplayName: "USPS Priority Mail",
  } } } as Order;
const binding = { storeId: "store_fixture", checkoutToken: "checkout_fixture", items: [{ variantId: "variant_fixture", quantity: 1 }] };
const session: TagadaCardSession = { orderId: order.orderId, ...binding, sessionToken: "session_fixture",
  customer: { email: context.email, firstName: "Fixture", lastName: "Buyer" },
  shippingAddress: { line1: context.address.address, city: "Phoenix", state: "AZ", postalCode: "85085", country: "US" },
  shippingCost: 24.99, total: 84.98, cartFingerprint: "fixture", pricing: { subtotal: 59.99, discountCode: null, discountAmount: 0, tax: 0 },
  researchAcknowledgementVersion: CHECKOUT_RESEARCH_ACK_VERSION, shippingMethod: "priority", tagadaShippingRateId: "priority2499",
  shippingQuote: context.quote!, shippingQuoteExpiresAt: new Date(Date.now() + 300000).toISOString(), shippingContextFingerprint: cardShippingContextFingerprint(context) };
const provider = { ...binding, id: "cs_fixture", currency: "USD", selectedShippingRateId: "priority2499", customer: { email: context.email },
  shippingAddress: { ...session.shippingAddress },
  totals: { subtotal: 5999, discount: 0, shipping: 2499, tax: 0, total: 8498, currency: "USD" } };

async function main() {
  const prior = { ...process.env }; const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("External requests are forbidden in shipping card tests"); };
  Object.assign(process.env, env, { PSL_VISUAL_PREVIEW: "0" });
  try {
    check(configuredTagadaShippingRateId("priority", 24.99, env), "priority2499");
    check(configuredTagadaShippingRateId("priority", 22.99, env), "priority2299");
    check(configuredTagadaShippingRateId("priority", 14.99, { ...env, TAGADA_SHIPPING_PRIORITY_1499_RATE_ID: "obsolete_rate" }), null);
    check(pickTagadaShippingRate(rates, 22.99, { method: "priority", rateId: "priority2299" })?.id, "priority2299");
    check(pickTagadaShippingRate(rates, 22.99, { method: "priority", rateId: "priority2499" }), null);
    check(configuredTagadaShippingRateId("standard", 9.99, env), "standard999");
    check(configuredTagadaShippingRateId("standard", 0, env), "standard0");
    check(configuredTagadaShippingRateId("priority", 9.99, env), null);
    check(pickTagadaShippingRate(rates, 24.99, { method: "priority" }), null);
    check(pickTagadaShippingRate(rates, 24.99, { method: "priority", rateId: "priority2499" })?.id, "priority2499");
    check(pickTagadaShippingRate(rates, 24.99, { method: "priority", rateId: "ground" }), null);
    check(pickTagadaShippingRate(rates, 24.99, { method: "standard", rateId: "priority2499" }), null);
    for (const name of ["GroundAdvantage", "USPSGroundAdvantage", "StandardShipping", "PriorityMailExpress", "USPSExpress", "ExpressMail", "NextDayAir"]) {
      check(pickTagadaShippingRate([{ id: "mapped", name, amount: 2499, currency: "USD" }], 24.99,
        { method: "priority", rateId: "mapped" }), null);
    }
    for (const name of ["PriorityMail", "USPSPriorityMail", "PriorityMailExpress", "USPSExpress", "ExpressMail", "NextDayAir"]) {
      check(pickTagadaShippingRate([{ id: "mapped", name, amount: 999, currency: "USD" }], 9.99,
        { method: "standard", rateId: "mapped" }), null);
    }
    check(pickTagadaShippingRate([{ id: "mapped", name: "PriorityMail", amount: 2499, currency: "USD" }], 24.99,
      { method: "priority", rateId: "mapped" })?.id, "mapped");
    check(pickTagadaShippingRate([{ id: "mapped", name: "GroundAdvantage", amount: 999, currency: "USD" }], 9.99,
      { method: "standard", rateId: "mapped" })?.id, "mapped");
    for (const amount of [24.98, 25, 0]) check(pickTagadaShippingRate(rates, amount, { method: "priority", rateId: "priority2499" }), null);
    check(pickTagadaShippingRate([{ ...rates[1], currency: "EUR" }], 24.99, { method: "priority", rateId: "priority2499" }), null);
    check(pickTagadaShippingRate([rates[1], rates[1]], 24.99, { method: "priority", rateId: "priority2499" }), null);
    const standard = { id: "standard999", name: "Standard", amount: 999, currency: "USD" };
    check(pickTagadaShippingRate([standard], 9.99)?.id, "standard999");
    check(pickTagadaShippingRate([standard, { ...standard, id: "duplicate" }], 9.99), null);
    check(pickTagadaShippingRate([{ ...standard, name: "Free Shipping" }], 9.99), null);
    check(cardSessionMatchesShipping(session, context), true);
    for (const changed of [{ method: "standard" as const }, { quote: "changed" }, { email: "other@example.test" },
      { address: { ...context.address, zip: "10007" } }, { discountCode: "changed" }, { paymentMethod: "btcpay" }]) {
      check(cardSessionMatchesShipping(session, { ...context, ...changed }), false);
    }
    check(cardSessionReadyToCharge(session, provider, "cs_fixture"), true);
    check(cardSessionReadyToCharge(session, provider, "cs_fixture", Date.parse(session.shippingQuoteExpiresAt!)), false);
    check(cardSessionReadyToCharge({ ...session, shippingQuoteExpiresAt: undefined }, provider, "cs_fixture"), false);
    check(cardSessionReadyToCharge(session, { ...provider, selectedShippingRateId: "ground" }, "cs_fixture"), false);
    check(cardSessionReadyToCharge({ ...session, shippingMethod: undefined }, provider, "cs_fixture"), false);
    const memory = new Map<string, string>();
    const storage = { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => { memory.set(k, v); }, removeItem: (k: string) => { memory.delete(k); } };
    const store = createCardSessionStore(() => storage, () => 1000);
    check(store.start(session), true); check(store.markProcessing(session.orderId), true);
    check(store.start({ ...session, shippingMethod: "standard" }), false);
    check(createCardSessionStore(() => storage, () => 1100).getSnapshot()?.phase, "processing");
    check(createCardSessionStore(() => storage, () => 1100).getSnapshot()?.session?.shippingContextFingerprint, session.shippingContextFingerprint);
    const raw = { checkoutSession: { id: provider.id, storeId: binding.storeId, checkoutToken: binding.checkoutToken,
      shippingAddress: { ...session.shippingAddress },
      shippingRateId: "priority2499", sessionLineItems: binding.items, draft: false }, summary: { currency: "USD",
      subtotalAmount: 5999, totalPromotionAmount: 0, shippingCost: 2499, totalTaxAmount: 0, totalAmount: 8498,
      items: [{ variantId: "variant_fixture", quantity: 1, unitAmount: 5999, amount: 5999, currency: "USD" }] } };
    check(normalizeTagadaCheckoutPriceEvidence(raw, { ...binding, expectedShippingRateId: "priority2499" })?.selectedShippingRateId, "priority2499");
    check(normalizeTagadaCheckoutPriceEvidence(raw, { ...binding, expectedShippingRateId: "ground" }), null);
    const calls: string[] = []; let finalProvider: unknown = provider;
    const client: ReferralCardCheckoutClient = {
      loadSession: async () => { calls.push("read"); return finalProvider; }, updateCustomerAndAddress: async () => { calls.push("address"); },
      getShippingRates: async () => rates, selectShippingRate: async (_id, rateId) => { calls.push(`select:${rateId}`); },
      applyPromoCode: async () => { throw new Error("No promotion is expected in this fixture"); },
    };
    check(await configureAndVerifyCardSession(order, session, binding, null, client), { shippingRateId: "priority2499" });
    check(calls, ["read", "address", "select:priority2499", "read"]);
    finalProvider = { ...provider, selectedShippingRateId: "ground" };
    await assert.rejects(configureAndVerifyCardSession(order, session, binding, null, client)); checks++;
    const discountedBinding = { ...binding, items: [{ variantId: "variant_fixture", quantity: 2 }] };
    const discountedOrder = { ...order, subtotal: 119.98, shippingCost: 22.99, total: 142.97 };
    const discountedProvider = { ...provider, ...discountedBinding, selectedShippingRateId: "priority2299",
      totals: { subtotal: 11998, discount: 0, shipping: 2299, tax: 0, total: 14297, currency: "USD" } };
    finalProvider = discountedProvider; calls.length = 0;
    check(await configureAndVerifyCardSession(discountedOrder, session, discountedBinding, null, client), { shippingRateId: "priority2299" });
    check(calls, ["read", "address", "select:priority2299", "read"]);
    check(cardSessionReadyToCharge({ ...session, ...discountedBinding, shippingCost: 22.99, total: 142.97,
      tagadaShippingRateId: "priority2299", pricing: { ...session.pricing!, subtotal: 119.98 } }, discountedProvider, "cs_fixture"), true);
    delete process.env.TAGADA_SHIPPING_PRIORITY_2499_RATE_ID; calls.length = 0;
    await assert.rejects(configureAndVerifyCardSession(order, session, binding, null, client)); checks++;
    check(calls, []);
    console.log(`PASS: shipping card binding (${checks} offline checks; exact service/ID/USD tiers, provider evidence, stale-context rejection and unresolved-payment recovery; no external requests).`);
  } finally { globalThis.fetch = oldFetch; for (const key of Object.keys(process.env)) if (!(key in prior)) delete process.env[key]; Object.assign(process.env, prior); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
