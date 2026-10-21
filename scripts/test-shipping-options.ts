/** Actual guest shipping/checkout helpers with only carrier and persistence fixtures. No live calls. */
import assert from "node:assert/strict";
import * as crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createContext, Script } from "node:vm";
import ts from "typescript";
import { NextResponse } from "next/server";
import * as totals from "../lib/checkout/totals";
import * as shippingPolicy from "../lib/shipping/policy";
import * as quote from "../lib/shipping/quote";
import { getPriorityShippingConfig, priorityCardRateConfigured } from "../lib/shipping/config";
import { getShippingOptionsForCheckout } from "../lib/shipping/options";
import { isPhysicalUSShippingAddress, parseShippingQuoteRequest } from "../lib/shipping/request";
import * as pricing from "../lib/payments/products";
import * as catalog from "../lib/products/catalog";
import * as countries from "../lib/checkout/us-states";
import * as attribution from "../lib/attribution/logic";
import * as referralLogic from "../lib/partners/referral-logic";
import * as research from "../lib/checkout/research-acknowledgement";
import { toPublicOrder, type Order } from "../lib/orders/types";
import { __setSqlClientForTests } from "../lib/db/sql";
import type { ShippingSelection } from "../lib/shipping/types";
import type { CheckoutBody, PrepareOrderOptions, PrepareOrderResult } from "../lib/checkout/prepare-order";

let checks = 0, carrierReads = 0, databaseCalls = 0, externalCalls = 0;
const check = (actual: unknown, expected: unknown, message?: string) => { assert.deepEqual(actual, expected, message); checks++; };
const ROOT = resolve(__dirname, "..");
const NOW = Date.now();
const account = { id: "offline_research_account", email: "fixture@example.invalid" };
const address = { firstName: "Offline", lastName: "Fixture", address: "123 Fixture Street", city: "Phoenix", state: "AZ", zip: "85001", country: "US" };
const body = { email: account.email, shipping: address, items: [{ handle: "retatrutide", quantity: 1 }], paymentMethod: "bitcoin" };
const from = { name: "Fixture Origin", street1: "1 Fixture Way", city: "Phoenix", state: "AZ", zip: "85016", country: "US" };
const fixtureEnv = { PSL_PRIORITY_SHIPPING_ENABLED: "true", PSL_PRIORITY_MAX_UNITS: "10", PSL_PRIORITY_BTCP_SERVICE_CODE: "Priority",
  PSL_PRIORITY_EXTRA_COST_RESERVE_USD: "2", PSL_SHIPPING_QUOTE_SECRET: "offline_shipping_secret_at_least_32_characters",
  BTCPOSTAGE_API_KEY: "offline_fixture_key", BTCPOSTAGE_API_SECRET: "offline_btc_secret_at_least_32_characters",
  BTCPOSTAGE_FROM_ZIP: "85016", BTCPOSTAGE_FROM_COUNTRY: "US", TAGADA_SHIPPING_PRIORITY_2499_RATE_ID: "shr_priority_2499",
  TAGADA_SHIPPING_PRIORITY_2299_RATE_ID: "shr_priority_2299" };
const config = getPriorityShippingConfig(fixtureEnv)!;
const rate = { service: "Priority", serviceDisplay: "Priority Mail", rate: "9.61", carrier: "USPS", estDeliveryDays: 2, currency: "USD" };
const rates = async (input: Parameters<NonNullable<NonNullable<Parameters<typeof getShippingOptionsForCheckout>[2]>["rates"]>>[0]) => {
  carrierReads++;
  check(input.pkg, { weightLbs: 0, weightOz: 8, heightIn: 3, widthIn: 4, depthIn: 6, packageType: "Parcel" });
  check(input.carrier, "USPS");
  return [rate];
};

function contextFor(raw = body): quote.PriorityQuoteContext {
  const parsed = parseShippingQuoteRequest(raw, account.email)!;
  const computed = totals.computeTotals(parsed.subtotalCents / 100, address.state, null, { paymentMethod: parsed.paymentMethod });
  return { accountId: quote.GUEST_SHIPPING_ACCOUNT_ID, ...parsed, discountCents: Math.round(computed.discountAmount * 100), discountCode: computed.discountCode };
}

function load(file: string, mocks: Record<string, unknown>): Record<string, unknown> {
  const source = readFileSync(resolve(ROOT, file), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const output: Record<string, unknown> = {};
  const fn = new Script(`(function(require,module,exports){${compiled}\n})`, { filename: file })
    .runInContext(createContext({ console: { error() {} }, Date, URL, process: { env: {} } }));
  fn((id: string) => { assert(id in mocks, `Unexpected offline dependency: ${id}`); return mocks[id]; }, { exports: output }, output);
  return output;
}

async function checkoutBoundary(token: string, selection: ShippingSelection) {
  const reserved: Order[] = [];
  let acknowledgements = 0;
  const prepare = load("lib/checkout/prepare-order.ts", {
    "node:crypto": crypto, "@/lib/checkout/totals": totals, "@/lib/checkout/us-states": countries,
    "@/lib/shipping/policy": shippingPolicy, "@/lib/shipping/quote": quote,
    "@/lib/shipping/request": { isPhysicalUSShippingAddress },
    "@/lib/checkout/research-acknowledgement": research,
    "@/lib/attribution/logic": attribution, "@/lib/payments/products": pricing, "@/lib/products/catalog": catalog,
    "@/lib/checkout/discount-codes": { DISCOUNT_CODES_ENABLED: false, lookupActiveDiscountCode: async () => { throw new Error("Unexpected promo lookup"); } },
    "@/lib/partners/referral-logic": referralLogic, "@/lib/partners/referral-config": { referralCodesEnabled: () => true },
    "@/lib/partners/referral-store": { lookupReferralDiscount: async () => ({ code: "fixture-1234abcd", percent: 10 }),
      reserveReferralOrder: async (order: Order) => { reserved.push(structuredClone(order)); return { ok: true }; } },
    "@/lib/orders/store": { saveOrderResearchAcknowledgement: async () => { acknowledgements++; }, markStatusIfPending: async () => {} },
    "@/lib/inventory/store": { ensureInventorySchema: async () => {}, checkoutWithStockCheck: async (order: Order) => {
      reserved.push(structuredClone(order)); return { ok: true }; } },
  }) as { prepareReservedOrder: (body: CheckoutBody, options: PrepareOrderOptions) => Promise<PrepareOrderResult> };
  // No research account, status or declaration is supplied by this guest.
  const payload = { ...body, shippingMethod: "priority", shippingQuote: token };
  for (const shippingMethod of ["standard", "priority"] as const) {
    for (const shipping of [{ ...address, country: "CA" }, { ...address, zip: "unknown" },
      { ...address, zip: "00000" }, { ...address, zip: "99999" },
      { ...address, city: "APO", state: "AE", zip: "09012" }, { ...address, address: "P.O. Box 100" }]) {
      const result = await prepare.prepareReservedOrder({ ...payload, shipping, shippingMethod }, { paymentMethod: "bitcoin" });
      check(result.ok, false); check(reserved.length, 0); check(acknowledgements, 0);
    }
  }
  for (const bad of [undefined, "changed", `${token}x`]) {
    const result = await prepare.prepareReservedOrder({ ...payload, shippingQuote: bad }, { paymentMethod: "bitcoin" });
    check(result.ok, false); check(reserved.length, 0); check(acknowledgements, 0);
  }
  for (const method of ["express", "overnight", 123, {}]) {
    const result = await prepare.prepareReservedOrder({ ...payload, shippingMethod: method }, { paymentMethod: "bitcoin" });
    check(result.ok, false); check(reserved.length, 0);
  }
  for (const changed of [{ shipping: { ...address, zip: "10007" } }, { email: "other@example.invalid" },
    { items: [{ handle: "retatrutide", quantity: 2 }] }, { discountCode: "fixture-1234abcd" }]) {
    const result = await prepare.prepareReservedOrder({ ...payload, ...changed }, { paymentMethod: "bitcoin" });
    check(result.ok, false); check(reserved.length, 0);
  }
  const changedPayment = await prepare.prepareReservedOrder(payload, { paymentMethod: "card" });
  check(changedPayment.ok, false); check(reserved.length, 0);
  process.env.PSL_PRIORITY_SHIPPING_ENABLED = "false";
  check((await prepare.prepareReservedOrder(payload, { paymentMethod: "bitcoin" })).ok, false);
  check(reserved.length, 0);
  process.env.PSL_PRIORITY_SHIPPING_ENABLED = "true";
  const accepted = await prepare.prepareReservedOrder(payload, { paymentMethod: "bitcoin" });
  check(accepted.ok, true);
  assert(accepted.ok);
  check(reserved[0].shipping.selection, selection);
  check(accepted.order.shippingCost, 24.99); check(accepted.order.discountAmount, 3); check(accepted.order.total, 81.98);
  check(acknowledgements, 0, "Guest checkout does not fabricate or persist a research declaration");
  const publicOrder = toPublicOrder(accepted.order);
  check(publicOrder.shippingSelection, { method: "priority", carrier: "USPS", serviceDisplayName: "USPS Priority Mail", deliveryEstimate: selection.deliveryEstimate });
  assert(!JSON.stringify(publicOrder.shippingSelection).match(/quotedPostage|package|providerServiceCode|tagadaShippingRateId|quoteToken|Fixture Street/)); checks++;
  check(toPublicOrder({ ...accepted.order, shipping: address }).shippingSelection, null);
  assert.throws(() => toPublicOrder({ ...accepted.order, shipping: { ...address, selection: {} as ShippingSelection } })); checks++;
  const ordinary = await prepare.prepareReservedOrder({ ...payload, shippingMethod: "standard", shippingQuote: undefined }, { paymentMethod: "bitcoin" });
  assert(ordinary.ok); check(ordinary.order.shippingCost, 9.99); check(ordinary.order.shipping.selection?.providerServiceCode, "GroundAdvantage");
  const defaulted = await prepare.prepareReservedOrder({ ...payload, shippingMethod: undefined, shippingQuote: undefined }, { paymentMethod: "bitcoin" });
  assert(defaulted.ok); check(defaulted.order.shipping.selection?.method, "standard");
  for (const street of ["123 Fixture Street\nApt 2B", "123 Fixture Street\r\nSuite #204", "123-45 W. Fixture St. #2B"]) {
    const twoLine = await prepare.prepareReservedOrder({ ...payload, shippingMethod: "standard", shippingQuote: undefined,
      shipping: { ...address, address: street, zip: "85001-1234", country: "United States" } }, { paymentMethod: "bitcoin" });
    assert(twoLine.ok); check(twoLine.order.shipping.address, street); check(twoLine.order.shipping.country, "US");
    check(twoLine.order.shippingCost, 9.99); check(twoLine.order.total, 66.98);
  }
  const cardQuote = quote.issuePriorityShippingQuote(contextFor({ ...body, paymentMethod: "card" }), selection, config, NOW);
  const guestCard = await prepare.prepareReservedOrder({ ...payload, shippingQuote: cardQuote.quoteToken }, { paymentMethod: "card" });
  assert(guestCard.ok);
  check(guestCard.order.shippingCost, 24.99); check(guestCard.order.discountAmount, 0); check(guestCard.order.total, 84.98);
  check(acknowledgements, 0, "Guest card checkout also works without a research declaration");
}

async function routeBoundary() {
  let blocked = false, quoteEnabled = false, limits = 0;
  const route = load("app/api/checkout/shipping-options/route.ts", {
    "next/server": { NextResponse },
    "@/lib/shipping/quote": quote,
    "@/lib/privacy/server": { readRequestPrivacyConsent: async () => ({ consent: { admin: false } }) },
    "@/lib/security/request-rate-limit": { consumeRequestLimit: async () => { limits++; return blocked ? NextResponse.json({ error: "Fixture rate limit" }, { status: 429 }) : null; } },
    "@/lib/shipping/config": { getPriorityShippingConfig: () => quoteEnabled ? config : null },
    "@/lib/shipping/options": { getShippingOptionsForCheckout: (raw: unknown, buyer: typeof account, options: object) =>
      getShippingOptionsForCheckout(raw, buyer, { ...options, fromAddress: from, rates, now: NOW }) },
  }) as { POST: (request: Request) => Promise<Response> };
  const request = (raw: unknown = body, origin = "https://fixture.invalid") => new Request("https://fixture.invalid/api/checkout/shipping-options", {
    method: "POST", headers: { "Content-Type": "application/json", origin }, body: JSON.stringify(raw),
  });
  const before = carrierReads;
  check((await route.POST(request(body, "https://other.invalid"))).status, 403);
  // There is deliberately no auth-library dependency or account cookie fixture.
  check((await route.POST(new Request("https://fixture.invalid/api/checkout/shipping-options", { method: "POST", body: "bad-json" }))).status, 400);
  check((await route.POST(request({ padding: "x".repeat(17_000) }))).status, 400);
  const disabled = await route.POST(request());
  check(disabled.status, 200); check(disabled.headers.get("cache-control"), "private, no-store");
  check((await disabled.json()).priority.available, false); check(limits, 0); check(carrierReads, before);
  for (const email of [undefined, "", "bad-email", 123, "x".repeat(255) + "@example.invalid"]) {
    check((await route.POST(request({ ...body, email, accountId: account.id }))).status, 400,
      "Anonymous quotes require this request's valid email; body account ID supplies no fallback");
  }
  check(carrierReads, before);
  quoteEnabled = true; blocked = true;
  check((await route.POST(request())).status, 429); check(carrierReads, before);
  blocked = false;
  const enabled = await route.POST(request({ ...body, accountId: "forged-account" }));
  check(enabled.status, 200);
  const data = await enabled.json();
  check(data.priority.available, true); check(carrierReads, before + 1);
  check(quote.validatePriorityShippingQuote(data.priority.quoteToken, contextFor(), { config, now: NOW }), data.priority.selection,
    "Anonymous endpoint issues a fully context-bound quote; caller account IDs cannot replace the guest namespace");
}

async function storedSelectionBoundary(selection: ShippingSelection) {
  const calls: { text: string; values: unknown[] }[] = [];
  let storedAddress: unknown = address;
  const sql = async (parts: TemplateStringsArray, ...values: unknown[]) => {
    const text = parts.join("?"); calls.push({ text, values });
    if (text.includes("SELECT * FROM orders")) return [{ order_id: "psl_fixture", created_at: new Date(NOW).toISOString(),
      updated_at: new Date(NOW).toISOString(), status: "paid", currency: "USD", email: account.email, shipping: storedAddress,
      items: [], subtotal: 59.99, tax_rate: 0, tax: 0, shipping_cost: 9.99, total: 69.98 }];
    return text.includes("SET shipping = jsonb_set") ? [{ order_id: "psl_fixture" }] : [];
  };
  const schemas = new Map<string, Promise<void>>();
  const store = load("lib/orders/store.ts", { "@/lib/db/sql": { getSql: () => sql,
    ensureSqlSchema: (name: string, initialize: () => Promise<void>) => {
      if (!schemas.has(name)) schemas.set(name, initialize());
      return schemas.get(name)!;
    } },
    "@/lib/checkout/research-acknowledgement": research, "@/lib/shipping/policy": shippingPolicy }) as {
      setOrderShippingSelection: (orderId: string, selection: ShippingSelection) => Promise<void>;
      getOrder: (orderId: string) => Promise<Order | null>;
    };
  await assert.rejects(store.setOrderShippingSelection("psl_fixture", {} as ShippingSelection)); checks++;
  check(calls.length, 0);
  await store.setOrderShippingSelection("psl_fixture", { ...selection, tagadaShippingRateId: "shr_priority_2499" });
  const update = calls.at(-1)!;
  assert.match(update.text, /jsonb_set\(shipping, '\{selection\}'/); checks++;
  assert.match(update.text, /status = 'pending'/); checks++;
  assert.match(update.text, /shipping->'selection'->>'method' = \?/); checks++;
  check(update.values[0], JSON.stringify({ ...selection, tagadaShippingRateId: "shr_priority_2499" }));
  check(update.values.slice(1), ["psl_fixture", "priority"]);
  check((await store.getOrder("psl_fixture"))?.shipping.selection, undefined, "Only genuinely absent historical selections remain legacy");
  storedAddress = { ...address, selection };
  check((await store.getOrder("psl_fixture"))?.shipping.selection, selection);
  storedAddress = JSON.stringify({ ...address, selection });
  check((await store.getOrder("psl_fixture"))?.shipping.selection, selection, "JSONB decoding preserves the selected service");
  for (const invalid of [null, undefined, {}, { ...selection, method: "express" }, { ...selection, package: null }]) {
    storedAddress = { ...address, selection: invalid };
    await assert.rejects(store.getOrder("psl_fixture"), /Stored shipping selection could not be verified/); checks++;
  }
}

async function main() {
  const oldEnv = { ...process.env }, oldFetch = globalThis.fetch;
  globalThis.fetch = async () => { externalCalls++; throw new Error("External network forbidden in shipping fixtures"); };
  __setSqlClientForTests((async () => { databaseCalls++; throw new Error("Real database forbidden"); }) as never);
  Object.assign(process.env, fixtureEnv);
  delete process.env.PSL_VISUAL_PREVIEW; delete process.env.BTCPOSTAGE_TEST_MODE;
  try {
    check(getPriorityShippingConfig({}), null);
    for (const change of [{ PSL_PRIORITY_SHIPPING_ENABLED: "false" }, { PSL_PRIORITY_MAX_UNITS: "" },
      { PSL_PRIORITY_MAX_UNITS: "11" }, { PSL_PRIORITY_MAX_UNITS: "50" }, { PSL_PRIORITY_BTCP_SERVICE_CODE: "PriorityExpress" }, { PSL_PRIORITY_EXTRA_COST_RESERVE_USD: "" },
      { PSL_PRIORITY_EXTRA_COST_RESERVE_USD: "-1" }, { PSL_SHIPPING_QUOTE_SECRET: "short", BTCPOSTAGE_API_SECRET: "short" },
      { BTCPOSTAGE_FROM_ZIP: "85001" }, { BTCPOSTAGE_FROM_COUNTRY: "CA" }, { BTCPOSTAGE_TEST_MODE: "true" }, { PSL_VISUAL_PREVIEW: "1" }]) {
      check(getPriorityShippingConfig({ ...fixtureEnv, ...change }), null);
    }
    check(priorityCardRateConfigured(24.99, fixtureEnv), true); check(priorityCardRateConfigured(22.99, {}), false);
    check(priorityCardRateConfigured(22.99, fixtureEnv), true);
    check(priorityCardRateConfigured(14.99, { ...fixtureEnv, TAGADA_SHIPPING_PRIORITY_1499_RATE_ID: "obsolete_rate" }), false);
    check(shippingPolicy.PRIORITY_BASE_SHIPPING_USD, 24.99); check(shippingPolicy.PRIORITY_DISCOUNTED_SHIPPING_USD, 22.99);
    check(config.maxUnits, 10);
    for (const afterCents of [9999, 10000, 10001]) check(shippingPolicy.getPriorityShippingPriceUsd(afterCents), afterCents > 10000 ? 22.99 : 24.99);
    for (const [subtotal, method, promo, expectedAfter, expectedPriority] of [
      [99.99, "card", null, 9999, 24.99], [100, "card", null, 10000, 24.99], [100.01, "card", null, 10001, 22.99],
      [105.26, "bitcoin", null, 10000, 24.99], [105.27, "bitcoin", null, 10001, 22.99],
      [111.11, "card", { code: "fixture-1234abcd", percent: 10, exclusive: true }, 10000, 24.99],
      [111.12, "bitcoin", { code: "fixture-1234abcd", percent: 10, exclusive: true }, 10001, 22.99],
    ] as const) {
      const actual = totals.computeTotals(subtotal, "AZ", promo, { paymentMethod: method, shippingMethod: "priority" });
      check(Math.round((actual.subtotal - actual.discountAmount) * 100), expectedAfter); check(actual.shipping, expectedPriority); check(actual.tax, 0);
      check(totals.computeTotals(subtotal, "AZ", promo, { paymentMethod: method }).shipping, subtotal >= 100 ? 0 : 9.99);
    }
    const referralNoStack = totals.computeTotals(111.12, "AZ", { code: "fixture-1234abcd", percent: 10, exclusive: true },
      { paymentMethod: "bitcoin", shippingMethod: "priority" });
    check(referralNoStack.bitcoinDiscountAmount, 0); check(referralNoStack.discountAmount, 11.11);
    check(referralNoStack.shipping, 22.99); check(referralNoStack.total, 123);
    check(totals.computeTotals(100, "AZ", null, "bitcoin").total, 95);
    check(shippingPolicy.priorityCostCovered(22.48, 22.99, 0), true); check(shippingPolicy.priorityCostCovered(22.49, 22.99, 0), false);
    check(shippingPolicy.priorityCostCovered(20.48, 22.99, 2), true); check(shippingPolicy.priorityCostCovered(20.49, 22.99, 2), false);
    for (const changed of [{ country: "CA" }, { state: "PR" }, { zip: "bad" }, { address: "P.O. Box 100" }, { address: "General Delivery" }]) {
      check(isPhysicalUSShippingAddress({ ...address, ...changed }), false);
      check(parseShippingQuoteRequest({ ...body, shipping: { ...address, ...changed } }, account.email), null);
    }
    check(parseShippingQuoteRequest({ ...body, items: [{ handle: "retatrutide", quantity: 11 }] }, account.email), null);
    check(parseShippingQuoteRequest({ ...body, items: [...body.items, ...body.items] }, account.email), null);
    check(parseShippingQuoteRequest({ ...body, items: [{ handle: "not-a-product", quantity: 1 }] }, account.email), null);
    check(parseShippingQuoteRequest({ ...body, subtotal: 0.01, shippingCost: 0, items: [{ ...body.items[0], unitPrice: 0.01 }] }, account.email)?.subtotalCents, 5999);
    const disabled = await getShippingOptionsForCheckout(body, account, { config: null, rates });
    assert(disabled.ok); check(disabled.data.priority.available, false); check(carrierReads, 0); check(disabled.data.standard.priceUsd, 9.99);
    const result = await getShippingOptionsForCheckout(body, account, { config, now: NOW, fromAddress: from, rates });
    assert(result.ok && result.data.priority.available);
    const offer = result.data.priority;
    check(offer.priceUsd, 24.99); check(offer.selection.quotedPostageUsd, 9.61); check(offer.selection.transitDays, 2);
    const tokenPayload = Buffer.from(offer.quoteToken.split(".")[0], "base64url").toString("utf8");
    assert(!tokenPayload.includes(account.email) && !tokenPayload.includes(address.address) && !tokenPayload.includes(account.id)); checks++;
    const context = contextFor();
    check(quote.validatePriorityShippingQuote(offer.quoteToken, context, { config, now: NOW }), offer.selection);
    for (const invalid of [null, "", "x", `${offer.quoteToken}x`, `x.${offer.quoteToken.split(".")[1]}`]) {
      check(quote.validatePriorityShippingQuote(invalid, context, { config, now: NOW }), null);
    }
    for (const changed of [{ accountId: "other" }, { email: "other@example.invalid" }, { shipping: { ...address, zip: "10007" } },
      { discountCents: context.discountCents + 1 }, { paymentMethod: "card" as const },
      { items: [{ ...context.items[0], quantity: 2 }] }, { items: [{ ...context.items[0], unitPrice: 0.01 }] }]) {
      check(quote.validatePriorityShippingQuote(offer.quoteToken, { ...context, ...changed }, { config, now: NOW }), null);
    }
    check(quote.validatePriorityShippingQuote(offer.quoteToken, context, { config, now: NOW + shippingPolicy.PRIORITY_QUOTE_TTL_MS }), null);
    check(quote.validatePriorityShippingQuote(offer.quoteToken, context, { config: null, now: NOW }), null);
    check(quote.validatePriorityShippingQuote(offer.quoteToken, context, { config: { ...config, extraCostReserveUsd: 20 }, now: NOW }), null);
    check(quote.validatePriorityShippingQuote(offer.quoteToken, context, { config: { ...config, serviceCode: "PriorityMail" }, now: NOW }), null);
    const belowWeight = { ...offer.selection, package: { ...shippingPolicy.PRIORITY_PACKAGE, weightOz: 4 } };
    const badPackage = quote.issuePriorityShippingQuote(context, belowWeight, config, NOW);
    check(quote.validatePriorityShippingQuote(badPackage.quoteToken, context, { config, now: NOW }), null);
    for (const transitDays of [null, 0, -1, 1.5, 31, Number.NaN, Number.POSITIVE_INFINITY]) {
      const invalidSelection = { ...offer.selection, transitDays };
      assert.throws(() => quote.issuePriorityShippingQuote(context, invalidSelection, config, NOW)); checks++;
      // A correctly signed old/incomplete snapshot must still fail the current
      // payment boundary; this exercises more than signature tamper detection.
      const payload = JSON.parse(tokenPayload); payload.selection.transitDays = transitDays;
      const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
      const signature = crypto.createHmac("sha256", config.signingSecret).update(`psl-shipping-quote:v1:${encoded}`).digest("base64url");
      check(quote.validatePriorityShippingQuote(`${encoded}.${signature}`, context, { config, now: NOW }), null);
    }
    for (const deliveryEstimate of [null, "", "   "]) {
      const invalidSelection = { ...offer.selection, deliveryEstimate };
      assert.throws(() => quote.issuePriorityShippingQuote(context, invalidSelection, config, NOW)); checks++;
      const payload = JSON.parse(tokenPayload); payload.selection.deliveryEstimate = deliveryEstimate;
      const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
      const signature = crypto.createHmac("sha256", config.signingSecret).update(`psl-shipping-quote:v1:${encoded}`).digest("base64url");
      check(quote.validatePriorityShippingQuote(`${encoded}.${signature}`, context, { config, now: NOW }), null);
    }
    for (const estDeliveryDays of [null, undefined, 0, -1, 1.5, 31, Number.NaN, Number.POSITIVE_INFINITY, "", "soon", "2.5"]) {
      const unavailable = await getShippingOptionsForCheckout(body, account, { config, fromAddress: from,
        rates: async () => [{ ...rate, estDeliveryDays: estDeliveryDays as number | string | null }] });
      assert(unavailable.ok); check(unavailable.data.priority.available, false); check(unavailable.data.standard.priceUsd, 9.99);
      if (!unavailable.data.priority.available) { assert.match(unavailable.data.priority.reason, /delivery estimate/); checks++; }
    }
    for (const [estDeliveryDays, expectedDays] of [[1, 1], [3, 3], [30, 30], ["2", 2], [" 2 ", 2]] as const) {
      const available = await getShippingOptionsForCheckout(body, account, { config, fromAddress: from,
        rates: async () => [{ ...rate, estDeliveryDays }] });
      assert(available.ok && available.data.priority.available);
      check(available.data.priority.selection.transitDays, expectedDays);
      assert.match(available.data.priority.selection.deliveryEstimate!, new RegExp(`Estimated ${expectedDays} business`)); checks++;
    }
    const validDuplicate = await getShippingOptionsForCheckout(body, account, { config, fromAddress: from,
      rates: async () => [{ ...rate, rate: "1.00", estDeliveryDays: null }, { ...rate, rate: "8.00", estDeliveryDays: 5 }, { ...rate, estDeliveryDays: 3 }] });
    assert(validDuplicate.ok && validDuplicate.data.priority.available);
    check(validDuplicate.data.priority.selection.quotedPostageUsd, 8);
    check(validDuplicate.data.priority.selection.transitDays, 5, "cheapest rate with a valid estimate wins after incomplete quotes are excluded");
    for (const badRate of [{ ...rate, service: "PriorityExpress" }, { ...rate, currency: "CAD" }, { ...rate, rate: "99.99" }, { ...rate, rate: "NaN" }]) {
      const unavailable = await getShippingOptionsForCheckout(body, account, { config, fromAddress: from, rates: async () => [badRate] });
      assert(unavailable.ok); check(unavailable.data.priority.available, false);
    }
    const noCardRate = await getShippingOptionsForCheckout({ ...body, paymentMethod: "card" }, account, { config, fromAddress: from,
      rates, cardRateConfigured: () => false });
    assert(noCardRate.ok); check(noCardRate.data.priority.available, false);
    const oversized = await getShippingOptionsForCheckout({ ...body, items: [{ handle: "retatrutide", quantity: 10 }, { handle: "ghk-cu", quantity: 1 }] }, account, { config, rates });
    assert(oversized.ok); check(oversized.data.priority.available, false); check(oversized.data.standard.priceUsd, 0);
    const mixed = await getShippingOptionsForCheckout({ ...body, items: [{ handle: "retatrutide", quantity: 2 }] }, account,
      { config, fromAddress: from, rates });
    assert(mixed.ok && mixed.data.priority.available); check(mixed.data.priority.priceUsd, 22.99); check(mixed.data.standard.priceUsd, 0);
    const mixedContext = contextFor({ ...body, items: [{ handle: "retatrutide", quantity: 2 }] });
    check(quote.validatePriorityShippingQuote(mixed.data.priority.quoteToken, mixedContext, { config }), mixed.data.priority.selection);
    const oldTierPayload = JSON.parse(Buffer.from(mixed.data.priority.quoteToken.split(".")[0], "base64url").toString("utf8"));
    oldTierPayload.priceCents = 1499;
    const oldTierEncoded = Buffer.from(JSON.stringify(oldTierPayload)).toString("base64url");
    const oldTierSignature = crypto.createHmac("sha256", config.signingSecret).update(`psl-shipping-quote:v1:${oldTierEncoded}`).digest("base64url");
    check(quote.validatePriorityShippingQuote(`${oldTierEncoded}.${oldTierSignature}`, mixedContext, { config }), null, "the obsolete $14.99 fee cannot authorize a new payment even with a valid signature");
    const maxPack = await getShippingOptionsForCheckout({ ...body, items: [{ handle: "retatrutide", quantity: 10 }] }, account,
      { config, fromAddress: from, rates });
    assert(maxPack.ok && maxPack.data.priority.available); check(maxPack.data.priority.priceUsd, 22.99);
    await checkoutBoundary(offer.quoteToken, offer.selection);
    await routeBoundary();
    await storedSelectionBoundary(offer.selection);
    check(databaseCalls, 0); check(externalCalls, 0);
    console.log(`PASS: Guest shipping options (${checks} checks; verified fee boundaries, discounts, signed email/cart/address/payment binding, expiry, cost coverage, server reservation ordering and private projections; ${carrierReads} mocked carrier reads; no external calls, real orders, labels or payments).`);
  } finally {
    globalThis.fetch = oldFetch; __setSqlClientForTests(null);
    for (const key of Object.keys(process.env)) if (!(key in oldEnv)) delete process.env[key];
    Object.assign(process.env, oldEnv);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
