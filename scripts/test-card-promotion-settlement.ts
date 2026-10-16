/** Actual setup helper, deterministic provider settlement, no clocks slept or external effects. */
import assert from "node:assert/strict";
import { CARD_PROMOTION_SETTLEMENT_WAIT_MS, configureAndVerifyCardSession, type ReferralCardCheckoutClient } from "../lib/tagada/referral-checkout";
import { PRIORITY_PACKAGE, standardShippingSelection } from "../lib/shipping/policy";
import type { Order } from "../lib/orders/types";

let checks = 0;
const check = (actual: unknown, expected: unknown, label?: string) => { assert.deepEqual(actual, expected, label); checks++; };
type Options = {
  priority?: boolean; delayMs?: number; promoError?: string | null; drift?: "address" | "email" | "cart" | "session" | "currency" | "shipping" | "excess-discount";
  readErrors?: Record<number, string>; quoteLifetimeMs?: number; advanceOnFinalReadMs?: number;
};
async function run(options: Options = {}) {
  const start = Date.now(); let clock = start, loads = 0, settledAt = Infinity;
  const calls: string[] = [], sleeps: number[] = [];
  const priority = options.priority === true;
  const price = priority ? 24.99 : 9.99;
  const rateId = priority ? "priority_fixture_2499" : "standard_fixture_999";
  const subtotal = priority ? 107.98 : 59.99, discountAmount = priority ? 10.8 : 6;
  const order = { orderId: "psl_offline_settlement", currency: "USD", subtotal, discountAmount, shippingCost: price, tax: 0,
    total: (Math.round(subtotal * 100) - Math.round(discountAmount * 100) + Math.round(price * 100)) / 100,
    email: "fixture@example.invalid", items: [{ handle: "retatrutide", quantity: 1 }],
    shipping: { firstName: "Offline", lastName: "Fixture", address: "1 Fixture Street", city: "Phoenix", state: "AZ", zip: "85016", country: "US",
      selection: priority ? { method: "priority", carrier: "USPS", providerServiceCode: "Priority", serviceDisplayName: "USPS Priority Mail",
        transitDays: 2, deliveryEstimate: "Estimated 2 business days; not guaranteed.", quotedPostageUsd: 11.06, package: { ...PRIORITY_PACKAGE },
        quotedAt: new Date(start).toISOString(), quoteExpiresAt: new Date(start + (options.quoteLifetimeMs ?? 300_000)).toISOString() } : standardShippingSelection() },
  } as Order;
  const binding = { storeId: "store_fixture", items: [{ variantId: "variant_fixture", quantity: 1 }] };
  const session = { checkoutToken: "checkout_fixture", sessionToken: "offline_private_fixture" };
  let selected = false;
  const provider = () => {
    const discount = clock >= settledAt ? Math.round(discountAmount * 100) : 0;
    const value = { id: "session_fixture", storeId: binding.storeId, checkoutToken: session.checkoutToken, currency: "USD",
      selectedShippingRateId: selected ? rateId : undefined, customer: { email: order.email }, items: structuredClone(binding.items),
      shippingAddress: { line1: order.shipping.address, city: order.shipping.city, state: order.shipping.state, postalCode: order.shipping.zip, country: order.shipping.country },
      totals: { currency: "USD", subtotal: Math.round(subtotal * 100), discount, shipping: Math.round(price * 100), tax: 0,
        total: Math.round(subtotal * 100) - discount + Math.round(price * 100) } };
    if (loads > 1) {
      if (options.drift === "address") value.shippingAddress.line1 = "2 Wrong Street";
      if (options.drift === "email") value.customer.email = "other@example.invalid";
      if (options.drift === "cart") value.items[0].quantity++;
      if (options.drift === "session") value.id = "other_session";
      if (options.drift === "currency") value.currency = "EUR";
      if (options.drift === "shipping") { value.totals.shipping++; value.totals.total++; }
      if (options.drift === "excess-discount") { value.totals.discount = Math.round(discountAmount * 100) + 1; value.totals.total -= value.totals.discount; }
    }
    return value;
  };
  const client: ReferralCardCheckoutClient = {
    loadSession: async () => {
      calls.push("read"); loads++;
      if (loads === 2) clock += options.advanceOnFinalReadMs ?? 0;
      const failure = options.readErrors?.[loads];
      if (failure) throw Object.assign(new Error("Offline provider read failure"), { code: failure });
      return provider();
    },
    updateCustomerAndAddress: async () => { calls.push("address"); },
    applyPromoCode: async () => {
      calls.push("promotion"); clock += 30_000;
      settledAt = clock + (options.delayMs ?? 0);
      const failure = options.promoError === undefined ? "network_error" : options.promoError;
      if (failure) throw Object.assign(new Error("Offline provider promotion failure"), { code: failure });
    },
    getShippingRates: async () => { calls.push("rates"); return [{ id: rateId, name: priority ? "USPS Priority Mail" : "USPS Ground Advantage", amount: Math.round(price * 100), currency: "USD" }]; },
    selectShippingRate: async (_id, selectedId) => { calls.push("select"); check(selectedId, rateId); selected = true; },
  };
  let result: { shippingRateId: string } | null = null, error: unknown = null;
  try {
    result = await configureAndVerifyCardSession(order, session, binding, "FIXTURE_REFERRAL10", client, {
      now: () => clock, sleep: async milliseconds => { sleeps.push(milliseconds); clock += milliseconds; },
    });
  } catch (failure) { error = failure; }
  return { result, error, calls, sleeps, loads, elapsed: clock - start };
}

async function main() {
  const prior = { ...process.env }, oldFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("External requests are forbidden in settlement tests"); };
  Object.assign(process.env, { PSL_VISUAL_PREVIEW: "0", TAGADA_SHIPPING_STANDARD_PAID_RATE_ID: "standard_fixture_999",
    TAGADA_SHIPPING_PRIORITY_2499_RATE_ID: "priority_fixture_2499", TAGADA_SHIPPING_PRIORITY_2299_RATE_ID: "priority_fixture_2299",
    PSL_PRIORITY_SHIPPING_ENABLED: "1", PSL_PRIORITY_MAX_UNITS: "10", PSL_PRIORITY_BTCP_SERVICE_CODE: "Priority",
    PSL_PRIORITY_EXTRA_COST_RESERVE_USD: "2", PSL_SHIPPING_QUOTE_SECRET: "offline-fixture-signing-secret-not-real-12345",
    BTCPOSTAGE_FROM_ZIP: "85016", BTCPOSTAGE_FROM_COUNTRY: "US", BTCPOSTAGE_API_KEY: "offline-not-real", BTCPOSTAGE_API_SECRET: "offline-not-real", BTCPOSTAGE_TEST_MODE: "0" });
  try {
    for (const priority of [false, true]) {
      const delayed = await run({ priority, delayMs: 100_000 });
      check(delayed.error, null); check(delayed.result?.shippingRateId, priority ? "priority_fixture_2499" : "standard_fixture_999");
      check(delayed.calls.filter(call => call === "promotion").length, 1);
      check(delayed.calls.filter(call => call === "address").length, 1);
      check(delayed.calls.filter(call => call === "select").length, 1);
      check(delayed.sleeps.length, 25); check(delayed.elapsed, 130_000);
    }
    const immediatelySaved = await run({ delayMs: 0 });
    check(immediatelySaved.error, null); check(immediatelySaved.sleeps, []);
    for (const code of ["auth_error", "validation_error", "api_error"]) {
      const rejected = await run({ promoError: code });
      check(rejected.result, null); check(!!rejected.error, true); check(rejected.calls.includes("rates"), false); check(rejected.sleeps, []);
    }
    for (const at of [2, 3]) {
      const authRead = await run({ delayMs: 100_000, readErrors: { [at]: "auth_error" } });
      check(authRead.result, null); check((authRead.error as { code?: string })?.code, "auth_error");
      check(authRead.loads, at); check(authRead.calls.filter(call => call === "promotion").length, 1);
    }
    const transientRead = await run({ delayMs: 4_000, readErrors: { 2: "network_error" } });
    check(transientRead.error, null); check(transientRead.sleeps.length, 1);
    const noTimeout = await run({ delayMs: 100_000, promoError: null });
    check(noTimeout.result, null); check(!!noTimeout.error, true); check(noTimeout.sleeps, []);
    for (const drift of ["address", "email", "cart", "session", "currency", "shipping", "excess-discount"] as const) {
      const mismatch = await run({ delayMs: 100_000, drift });
      check(mismatch.result, null); check(!!mismatch.error, true); check(mismatch.sleeps, [], `${drift} is not treated as pending promotion`);
    }
    const exhausted = await run({ delayMs: Infinity });
    check(exhausted.result, null); check(!!exhausted.error, true);
    check(exhausted.elapsed <= 30_000 + CARD_PROMOTION_SETTLEMENT_WAIT_MS, true);
    check(exhausted.loads <= 32, true); check(exhausted.calls.filter(call => call === "promotion").length, 1);
    check(exhausted.calls.filter(call => call === "select").length, 1);
    const closeToExpiry = await run({ priority: true, delayMs: 100_000, quoteLifetimeMs: 60_000 });
    check(closeToExpiry.result, null); check(!!closeToExpiry.error, true); check(closeToExpiry.elapsed < 60_000, true);
    const expiredDuringRead = await run({ priority: true, delayMs: 0, quoteLifetimeMs: 60_000, advanceOnFinalReadMs: 30_001 });
    check(expiredDuringRead.result, null); check(!!expiredDuringRead.error, true); check(expiredDuringRead.sleeps, []);
    console.log(`PASS: promotion settlement (${checks} checks; actual setup helper, 100-second delayed persistence, exact binding, auth/validation failures, exhaustion and quote expiry; no sleeping, network, orders or payments).`);
  } finally {
    globalThis.fetch = oldFetch;
    for (const key of Object.keys(process.env)) if (!(key in prior)) delete process.env[key];
    Object.assign(process.env, prior);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
