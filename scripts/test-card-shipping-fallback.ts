/** Actual server setup helper. Provider reads/mutations are fixtures; no live API or payments. */
import assert from "node:assert/strict";
import { configureAndVerifyCardSession, type ReferralCardCheckoutClient } from "../lib/tagada/referral-checkout";
import { PRIORITY_PACKAGE, getPriorityShippingPriceUsd, standardShippingSelection } from "../lib/shipping/policy";
import type { Order } from "../lib/orders/types";

let checks = 0;
const check = (actual: unknown, expected: unknown, message?: string) => { assert.deepEqual(actual, expected, message); checks++; };
const address = { firstName: "Offline", lastName: "Fixture", address: "1 Fixture Street\nApt 2", city: "Phoenix", state: "AZ", zip: "85016", country: "US" };
const env: Record<string, string> = { PSL_VISUAL_PREVIEW: "0", PSL_PRIORITY_SHIPPING_ENABLED: "true", PSL_PRIORITY_MAX_UNITS: "10",
  PSL_PRIORITY_BTCP_SERVICE_CODE: "Priority", PSL_PRIORITY_EXTRA_COST_RESERVE_USD: "2", BTCPOSTAGE_FROM_ZIP: "85016", BTCPOSTAGE_FROM_COUNTRY: "US",
  PSL_SHIPPING_QUOTE_SECRET: "offline_shipping_secret_at_least_32_characters", BTCPOSTAGE_API_KEY: "fixture_key",
  BTCPOSTAGE_API_SECRET: "offline_btc_secret_at_least_32_characters", TAGADA_SHIPPING_STANDARD_PAID_RATE_ID: "paid_fixture",
  TAGADA_SHIPPING_STANDARD_FREE_RATE_ID: "free_fixture", TAGADA_SHIPPING_PRIORITY_2499_RATE_ID: "priority2499_fixture",
  TAGADA_SHIPPING_PRIORITY_2299_RATE_ID: "priority2299_fixture" };
const orderFor = (method: "standard" | "priority" = "standard", large = false, promo = false): Order => {
  const subtotal = large ? 107.98 : 59.99, discountAmount = promo ? Math.round(subtotal * 10) / 100 : 0;
  const shippingCost = method === "priority" ? getPriorityShippingPriceUsd(Math.round((subtotal - discountAmount) * 100)) : large ? 0 : 9.99;
  return { orderId: "psl_fallback_fixture", currency: "USD", email: "fixture@example.invalid", subtotal, discountAmount, shippingCost, tax: 0,
    total: Math.round((subtotal - discountAmount + shippingCost) * 100) / 100,
    items: [{ handle: "retatrutide", quantity: 1 }, ...(large ? [{ handle: "bpc-157", quantity: 1 }] : [])],
    shipping: { ...address, selection: method === "standard" ? standardShippingSelection() : {
      method, carrier: "USPS", providerServiceCode: "Priority", serviceDisplayName: "USPS Priority Mail", transitDays: 3,
      deliveryEstimate: "Estimated 3 business days after carrier acceptance; not guaranteed.", quotedPostageUsd: 16.18,
      package: { ...PRIORITY_PACKAGE }, quotedAt: new Date().toISOString(), quoteExpiresAt: new Date(Date.now() + 300000).toISOString(),
    } } } as Order;
};
type Rate = { id: string; name: string; amount: number; currency: string };
async function scenario(order: Order, options: { rates?: Rate[]; rateFailure?: boolean; selectFailure?: boolean;
  providerChange?: Record<string, unknown>; envChange?: Record<string, string | undefined> } = {}) {
  const prior = { ...process.env };
  Object.assign(process.env, env);
  for (const [key, value] of Object.entries(options.envChange ?? {})) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  const binding = { storeId: "store_fixture", items: order.items.map((item, index) => ({ variantId: `variant_fixture_${index}`, quantity: item.quantity })) };
  let selected: string | undefined, reads = 0, rateReads = 0;
  const effects: string[] = [];
  const provider = () => ({ id: "cs_fixture", storeId: binding.storeId, checkoutToken: "checkout_fixture", currency: "USD", items: binding.items,
    customer: { email: order.email }, shippingAddress: { address1: "1 Fixture Street", address2: "Apt 2", city: "Phoenix", state: "AZ", postal: "85016", country: "US" },
    selectedShippingRateId: selected,
    totals: { subtotal: Math.round(order.subtotal * 100), discount: Math.round(order.discountAmount * 100), shipping: Math.round(order.shippingCost * 100),
      tax: 0, total: Math.round(order.total * 100), currency: "USD" },
    ...(reads > 1 ? options.providerChange : {}) });
  const client: ReferralCardCheckoutClient = {
    loadSession: async () => { reads++; effects.push("read"); return provider(); },
    updateCustomerAndAddress: async () => { effects.push("address"); },
    applyPromoCode: async () => { effects.push("promo"); },
    getShippingRates: async () => { rateReads++; effects.push("rates"); if (options.rateFailure) throw Object.assign(new Error("Fixture HTTP/auth failure"), { code: "auth_error" }); return options.rates ?? []; },
    selectShippingRate: async (_id, rateId) => { effects.push(`select:${rateId}`); if (options.selectFailure) throw new Error("Fixture provider refused selection"); selected = rateId; },
  };
  try {
    const result = await configureAndVerifyCardSession(order, { checkoutToken: "checkout_fixture", sessionToken: "fixture_jwt" }, binding,
      order.discountAmount ? "FIXTURE10" : null, client);
    return { ok: true as const, result, effects, selected, reads, rateReads };
  } catch (error) { return { ok: false as const, error, effects, selected, reads, rateReads }; }
  finally { for (const key of Object.keys(process.env)) if (!(key in prior)) delete process.env[key]; Object.assign(process.env, prior); }
}

async function main() {
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("External requests are forbidden in shipping fallback tests"); };
  try {
    for (const [order, rateId] of [[orderFor(), "paid_fixture"], [orderFor("standard", true), "free_fixture"],
      [{ ...orderFor(), subtotal: 99.99, total: 109.98 }, "paid_fixture"],
      [{ ...orderFor("standard", true), subtotal: 100, total: 100 }, "free_fixture"],
      [{ ...orderFor("standard", true), subtotal: 9999.99, total: 9999.99 }, "free_fixture"],
      [orderFor("standard", true, true), "free_fixture"], [orderFor("priority"), "priority2499_fixture"],
      [orderFor("priority", true), "priority2299_fixture"], [orderFor("priority", true, true), "priority2499_fixture"]] as const) {
      const result = await scenario(order);
      check(result.ok, true); if (result.ok) check(result.result.shippingRateId, rateId);
      check(result.selected, rateId); check(result.rateReads, 1); check(result.reads, 2);
    }
    const smallFree = { ...orderFor(), shippingCost: 0, total: 59.99 };
    const largePaid = { ...orderFor("standard", true), shippingCost: 9.99, total: 117.97 };
    for (const order of [smallFree, largePaid,
      { ...orderFor("standard", true), subtotal: 10000, total: 10000 },
      { ...orderFor("standard", true), subtotal: 99.99, total: 99.99 },
      { ...orderFor(), subtotal: 100, total: 109.99 },
      { ...orderFor(), shipping: { ...orderFor().shipping, country: "CA" } },
      { ...orderFor("priority"), shipping: { ...orderFor("priority").shipping, selection: { ...orderFor("priority").shipping.selection!, quotedPostageUsd: 25 } } },
      { ...orderFor("priority"), shipping: { ...orderFor("priority").shipping, selection: { ...orderFor("priority").shipping.selection!, quoteExpiresAt: new Date(0).toISOString() } } },
      { ...orderFor("priority"), items: [{ ...orderFor("priority").items[0], quantity: 11 }] }]) {
      const result = await scenario(order); check(result.ok, false); check(result.selected, undefined, "local eligibility is required before selecting an unlisted configured ID");
    }
    for (const options of [{ rateFailure: true }, { selectFailure: true },
      { rates: [{ id: "paid_fixture", name: "Priority Mail", amount: 999, currency: "USD" }] },
      { rates: [{ id: "paid_fixture", name: "Standard", amount: 999, currency: "EUR" }] },
      { rates: [{ id: "paid_fixture", name: "Standard", amount: 998, currency: "USD" }] },
      { rates: [{ id: "paid_fixture", name: "Standard", amount: 999, currency: "USD" }, { id: "paid_fixture", name: "Standard", amount: 999, currency: "EUR" }] },
      { rates: [{ id: "paid_fixture", name: "Standard", amount: 999, currency: "USD" }, { id: "paid_fixture", name: "Standard", amount: 998, currency: "USD" }] },
      { envChange: { TAGADA_SHIPPING_STANDARD_PAID_RATE_ID: undefined } }]) {
      const result = await scenario(orderFor(), options); check(result.ok, false); check(result.selected, undefined, "no HTTP/auth/conflicting-ID/unconfigured fallback");
    }
    const paidPriorityCatalog = [{ id: "priority2299_fixture", name: "USPS Priority Mail", amount: 2299, currency: "USD" },
      { id: "priority2499_fixture", name: "USPS Priority Mail", amount: 2499, currency: "USD" }];
    for (const order of [orderFor("standard", true), orderFor("standard", true, true)]) {
      const omittedFree = await scenario(order, { rates: paidPriorityCatalog });
      check(omittedFree.ok, true); check(omittedFree.selected, "free_fixture"); check(omittedFree.reads, 2);
    }
    const omittedPaid = await scenario(orderFor(), { rates: paidPriorityCatalog });
    check(omittedPaid.ok, true); check(omittedPaid.selected, "paid_fixture");
    for (const options of [{ selectFailure: true }, { providerChange: { selectedShippingRateId: "priority2299_fixture" } },
      { providerChange: { totals: { subtotal: 10798, discount: 0, shipping: 2299, tax: 0, total: 13097, currency: "USD" } } }]) {
      const rejected = await scenario(orderFor("standard", true), { ...options, rates: paidPriorityCatalog });
      check(rejected.ok, false, "incomplete catalog never bypasses provider selection and complete free-shipping proof");
    }
    const unconfigured = await scenario(orderFor(), { envChange: { TAGADA_SHIPPING_STANDARD_PAID_RATE_ID: undefined },
      rates: [{ id: "listed_fixture", name: "USPS Ground Advantage", amount: 999, currency: "USD" }] });
    check(unconfigured.ok, true); check(unconfigured.selected, "listed_fixture", "unconfigured named Standard still requires one exact listed rate");
    for (const providerChange of [{ selectedShippingRateId: "other_rate" }, { shippingAddress: undefined },
      { shippingAddress: { line1: "Unrelated Street", city: "Phoenix", state: "AZ", postalCode: "85016", country: "US" } },
      { customer: { email: "unrelated@example.invalid" } }, { totals: { subtotal: 5999, discount: 0, shipping: 998, tax: 0, total: 6997, currency: "USD" } }]) {
      const result = await scenario(orderFor(), { providerChange }); check(result.ok, false); check(result.reads, 2, "configured selection must be followed by fresh exact provider evidence");
    }
    const pausedPriority = await scenario(orderFor("priority"), { envChange: { PSL_PRIORITY_SHIPPING_ENABLED: "false" } });
    check(pausedPriority.ok, false); check(pausedPriority.selected, undefined);
    // Exercise the production adapter and installed SDK, rather than only the
    // injectable client. All fetches are intercepted and never delegated.
    const priorEnv = { ...process.env };
    Object.assign(process.env, env);
    let selected: string | null = null, authFailure = false, otherPaidCatalog = false;
    const actualCalls: string[] = [];
    const actualOrder = orderFor();
    const actualBinding = { storeId: "store_fixture", items: [{ variantId: "variant_fixture_0", quantity: 1 }] };
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input));
      assert.equal(url.origin, "https://api.tagada.io");
      assert.equal(new Headers(init?.headers).get("x-cms-token"), "fixture_jwt");
      const method = init?.method ?? "GET"; actualCalls.push(`${method} ${url.pathname}`);
      if (url.pathname === "/api/v1/checkout-sessions/checkout_fixture/v2" && method === "GET") {
        return Response.json({ checkoutSession: { id: "cs_fixture", storeId: actualBinding.storeId, checkoutToken: "checkout_fixture", draft: false,
          shippingRateId: selected, customer: { email: actualOrder.email }, sessionLineItems: actualBinding.items,
          shippingAddress: { address1: "1 Fixture Street", address2: "Apt 2", city: "Phoenix", state: "AZ", postal: "85016", country: "US" } },
          summary: { currency: "USD", subtotalAmount: 5999, totalPromotionAmount: 0, shippingCost: 999, totalTaxAmount: 0,
            totalAmount: 6998, totalAdjustedAmount: 6998, items: [{ variantId: "variant_fixture_0", quantity: 1, unitAmount: 5999, amount: 5999, currency: "USD" }] } });
      }
      if (url.pathname === "/api/v1/checkout-sessions/cs_fixture/customer-and-session-info" && method === "POST") return Response.json({});
      if (url.pathname === "/api/v1/checkout-sessions/cs_fixture/shipping-rates" && method === "GET") {
        return authFailure ? Response.json({ message: "Fixture authorization rejected" }, { status: 403 })
          : Response.json({ rates: otherPaidCatalog ? [{ id: "priority2499_fixture", shippingRateName: "USPS Priority Mail", amount: 2499, currency: "USD" }] : [], forceCheckoutSessionRefetch: true });
      }
      if (url.pathname === "/api/v1/checkout-sessions/cs_fixture/shipping-rate" && method === "POST") {
        const body = JSON.parse(String(init?.body)); assert.equal(body.shippingRateId, "paid_fixture"); selected = body.shippingRateId;
        return Response.json({});
      }
      throw new Error("Unexpected installed-SDK fixture request");
    };
    try {
      check(await configureAndVerifyCardSession(actualOrder, { checkoutToken: "checkout_fixture", sessionToken: "fixture_jwt" }, actualBinding, null), { shippingRateId: "paid_fixture" });
      check(actualCalls.length, 5, "real SDK adapter performs authenticated reads, address update and configured selection with rates=[]");
      otherPaidCatalog = true; selected = null; actualCalls.length = 0;
      check(await configureAndVerifyCardSession(actualOrder, { checkoutToken: "checkout_fixture", sessionToken: "fixture_jwt" }, actualBinding, null), { shippingRateId: "paid_fixture" });
      check(actualCalls.length, 5, "real SDK adapter can verify an absent configured ID in a nonempty paid catalog");
      authFailure = true; actualCalls.length = 0;
      await assert.rejects(configureAndVerifyCardSession(actualOrder, { checkoutToken: "checkout_fixture", sessionToken: "fixture_jwt" }, actualBinding, null)); checks++;
      check(actualCalls.some(path => path.endsWith("/shipping-rate")), false, "real SDK HTTP/auth errors cannot trigger configured-ID selection");
    } finally {
      for (const key of Object.keys(process.env)) if (!(key in priorEnv)) delete process.env[key]; Object.assign(process.env, priorEnv);
    }
    console.log(`PASS: configured shipping fallback (${checks} offline checks; verified tier eligibility, empty/incomplete catalogs, free Standard before discounts, exact destination/payable readback and contradictory-ID rejection; no live requests or payments).`);
  } finally { globalThis.fetch = oldFetch; }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
