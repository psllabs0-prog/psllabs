/** Offline regressions for the actual v2 original-vs-payable summary format. */
import assert from "node:assert/strict";
import { CHECKOUT_RESEARCH_ACK_VERSION } from "../lib/checkout/research-acknowledgement";
import { normalizeTagadaCheckoutPriceEvidence, readTagadaCheckoutPriceEvidence,
  normalizeTagadaCheckoutShippingAddress, tagadaCheckoutShippingAddressMatches } from "../lib/tagada/checkout-price-evidence";
import { referralCardSessionMatchesOrder } from "../lib/tagada/referral-checkout";
import { cardSessionReadyToCharge, type TagadaCardSession } from "../lib/checkout/card-session-storage";
import type { Order } from "../lib/orders/types";

let checks = 0;
const check = (value: unknown, expected: unknown, message?: string) => { assert.deepEqual(value, expected, message); checks++; };
const binding = { storeId: "store_fixture", checkoutToken: "checkout_fixture", expectedSessionId: "cs_fixture" };
const raw = { checkoutSession: { id: "cs_fixture", storeId: binding.storeId, checkoutToken: binding.checkoutToken,
  selectedPresentmentCurrency: "USD", shippingRateId: "ship_fixture", draft: false, metadata: {}, customer: { email: "fixture@example.test" },
  shippingAddress: { address1: "1 Test Street", address2: "Apt 2", city: "Phoenix", state: "AZ", postal: "85001", country: "US" },
  sessionLineItems: [{ variantId: "variant_fixture", quantity: 1 }] },
summary: { currency: "USD", subtotalAmount: 5999, totalPromotionAmount: 600, shippingCost: 999, totalTaxAmount: 0,
  totalAmount: 6998, totalAdjustedAmount: 6398, items: [{ variantId: "variant_fixture", quantity: 1, unitAmount: 5999, amount: 5999, currency: "USD" }] } };
const order = { currency: "USD", subtotal: 59.99, discountAmount: 6, shippingCost: 9.99, tax: 0, total: 63.98 } as Order;
const expected = { ...binding, items: [{ variantId: "variant_fixture", quantity: 1 }], customerEmail: "fixture@example.test" };
const session = { storeId: binding.storeId, checkoutToken: binding.checkoutToken, items: expected.items, shippingCost: 9.99, total: 63.98,
  customer: { email: "fixture@example.test", firstName: "Fixture", lastName: "Buyer" },
  shippingAddress: { line1: "1 Test Street\nApt 2", city: "Phoenix", state: "AZ", postalCode: "85001", country: "US" },
  researchAcknowledgementVersion: CHECKOUT_RESEARCH_ACK_VERSION,
  shippingMethod: "standard", tagadaShippingRateId: "ship_fixture",
  pricing: { subtotal: 59.99, discountAmount: 6, tax: 0, discountCode: "fixture" } } as TagadaCardSession;

async function main() {
  const evidence = normalizeTagadaCheckoutPriceEvidence(raw, binding);
  check(evidence?.totals.total, 6398);
  check(evidence?.shippingAddress, { line1: "1 Test Street", line2: "Apt 2", city: "Phoenix", state: "AZ", postalCode: "85001", country: "US" });
  check(tagadaCheckoutShippingAddressMatches(session.shippingAddress, evidence?.shippingAddress), true);
  check(tagadaCheckoutShippingAddressMatches(session.shippingAddress, { line1: " 1 test street ", line2: "apt  2", city: "phoenix", state: "az", postalCode: "85001", country: "us" }), true);
  check(tagadaCheckoutShippingAddressMatches({ ...session.shippingAddress, postalCode: "85001-1234" }, { ...evidence?.shippingAddress, postalCode: "850011234" }), true);
  check(tagadaCheckoutShippingAddressMatches(session.shippingAddress, { ...evidence?.shippingAddress, postalCode: "85001-1234" }), false, "a ZIP+4 is never invented or discarded");
  check(normalizeTagadaCheckoutShippingAddress({ ...raw.checkoutSession.shippingAddress, unrelatedPrivateValue: "omitted" }), evidence?.shippingAddress);
  check(referralCardSessionMatchesOrder(order, expected, evidence), true);
  check(cardSessionReadyToCharge(session, evidence, "cs_fixture"), true);
  for (const shippingAddress of [undefined, {}, { ...evidence?.shippingAddress, line1: "Unrelated Street" },
    { ...evidence?.shippingAddress, line2: "" }, { ...evidence?.shippingAddress, city: "Other City" },
    { ...evidence?.shippingAddress, state: "NY" }, { ...evidence?.shippingAddress, postalCode: "10007" },
    { ...evidence?.shippingAddress, country: "CA" }]) {
    check(cardSessionReadyToCharge(session, { ...evidence, shippingAddress }, "cs_fixture"), false);
    check(referralCardSessionMatchesOrder(order, { ...expected, shippingAddress: session.shippingAddress }, { ...evidence, shippingAddress }), false);
  }
  check(cardSessionReadyToCharge(session, { ...evidence, customer: { email: "other@example.test" } }, "cs_fixture"), false);
  for (const changed of [{ totalAdjustedAmount: 6998 }, { totalAdjustedAmount: undefined }, { totalAdjustedAmount: "6398" },
    { totalAdjustedAmount: 6397 }, { totalAmount: 6999 }, { currency: "EUR" }, { subtotalAmount: 6000 },
    { totalPromotionAmount: 601 }, { totalPromotionAmount: -600 }, { shippingCost: 1000 }, { totalTaxAmount: 1 },
    { items: [] }, { items: [{ ...raw.summary.items[0], quantity: 2 }] },
    { items: [{ ...raw.summary.items[0], unitAmount: 6000 }] }, { items: [{ ...raw.summary.items[0], currency: "EUR" }] }]) {
    check(normalizeTagadaCheckoutPriceEvidence({ ...raw, summary: { ...raw.summary, ...changed } }, binding), null);
  }
  for (const changed of [{ id: "other" }, { storeId: "other" }, { checkoutToken: "other" }, { selectedPresentmentCurrency: "EUR" },
    { sessionLineItems: [] }, { sessionLineItems: [{ variantId: "other", quantity: 1 }] },
    { draft: true }, { metadata: { synthetic: true } }]) {
    check(normalizeTagadaCheckoutPriceEvidence({ ...raw, checkoutSession: { ...raw.checkoutSession, ...changed } }, binding), null);
  }
  const duplicate = { ...raw, checkoutSession: { ...raw.checkoutSession, sessionLineItems: Array(2).fill(raw.checkoutSession.sessionLineItems[0]) },
    summary: { ...raw.summary, items: Array(2).fill(raw.summary.items[0]), subtotalAmount: 11998, totalAmount: 12997, totalAdjustedAmount: 12397 } };
  check(normalizeTagadaCheckoutPriceEvidence(duplicate, binding), null);
  check(referralCardSessionMatchesOrder(order, { ...expected, customerEmail: "other@example.test" }, evidence), false);
  check(referralCardSessionMatchesOrder(order, expected, { ...evidence, id: "other" }), false);
  const ordinary = { ...raw, summary: { ...raw.summary, totalPromotionAmount: 0, totalAdjustedAmount: undefined } };
  check(normalizeTagadaCheckoutPriceEvidence(ordinary, binding)?.totals.total, 6998);
  const qa = { ...raw, checkoutSession: { ...raw.checkoutSession, draft: true, metadata: { synthetic: true } } };
  check(normalizeTagadaCheckoutPriceEvidence(qa, { ...binding, allowSyntheticDraft: true })?.totals.total, 6398);
  check(normalizeTagadaCheckoutPriceEvidence(raw, { ...binding, allowSyntheticDraft: true }), null);
  const priorFetch = globalThis.fetch;
  const paths: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input)); paths.push(url.pathname);
    assert.equal(url.origin, "https://api.tagada.io");
    assert.equal(url.pathname, "/api/v1/checkout-sessions/checkout_fixture/v2");
    assert.equal(url.searchParams.get("skipAsyncWait"), "false");
    assert.equal(init?.method, "GET");
    assert.equal(new Headers(init?.headers).get("x-cms-token"), "synthetic_session_token");
    return Response.json(raw);
  };
  try {
    check((await readTagadaCheckoutPriceEvidence(binding, "synthetic_session_token")).totals.total, 6398);
    await assert.rejects(readTagadaCheckoutPriceEvidence(binding, null)); checks++;
    check(paths.length, 1);
  } finally { globalThis.fetch = priorFetch; }
  console.log(`PASS: Tagada payable checkout evidence (${checks} offline checks; verified actual adjusted-total format, exact binding/items/customer/amounts, no purchases, payment calls or external network).`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
