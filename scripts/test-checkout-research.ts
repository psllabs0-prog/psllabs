/** Guest checkout, signed shipping and historical evidence boundaries. All effects are offline fixtures. */
import assert from "node:assert/strict";
import * as crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createContext, Script } from "node:vm";
import ts from "typescript";
import { NextResponse } from "next/server";
import * as research from "../lib/checkout/research-acknowledgement";
import * as pricing from "../lib/payments/products";
import * as catalog from "../lib/products/catalog";
import * as totals from "../lib/checkout/totals";
import * as countries from "../lib/checkout/us-states";
import * as attribution from "../lib/attribution/logic";
import * as referralLogic from "../lib/partners/referral-logic";
import * as shippingPolicy from "../lib/shipping/policy";
import * as shippingRequest from "../lib/shipping/request";
import * as shippingQuote from "../lib/shipping/quote";
import type { PriorityShippingConfig } from "../lib/shipping/config";
import type { ShippingSelection } from "../lib/shipping/types";
import { UNKNOWN_PRIVACY_CONSENT } from "../lib/privacy/types";
import { toPublicOrder, type Order } from "../lib/orders/types";
import { cardSessionReadyToCharge, createCardSessionStore, type TagadaCardSession } from "../lib/checkout/card-session-storage";
import type { CheckoutBody, PrepareOrderOptions, PrepareOrderResult } from "../lib/checkout/prepare-order";

const ROOT = resolve(__dirname, "..");
const EMAIL = "fixture@example.invalid";
const SHIPPING = { firstName: "Offline", lastName: "Fixture", address: "123 Fixture Street", city: "Phoenix", state: "AZ", zip: "85001", country: "US" };
const BODY = { email: EMAIL, shipping: SHIPPING, items: [{ handle: "bpc-157", quantity: 1 }] };
const HISTORICAL: research.OrderResearchAcknowledgement = {
  version: research.CHECKOUT_RESEARCH_ACK_VERSION, researchStatus: "independent_researcher", researchUseOnly: true,
  statement: research.RESEARCH_USE_CHECKOUT_STATEMENT, acceptedAt: "2026-10-15T12:00:00.000Z", accountId: "offline_historical_account",
};
const QUOTE_CONFIG: PriorityShippingConfig = { maxUnits: 10, serviceCode: "PriorityMail", extraCostReserveUsd: 2,
  signingSecret: "offline-fixture-quote-secret-not-a-real-credential" };
let checks = 0, reservations = 0, savedDeclarations = 0, providerCreates = 0, referralLookups = 0, shippingBindings = 0;
let stockAvailable = true;
let quoteNow = Date.now();
const reserved: Order[] = [];
const vmEnv: Record<string, string | undefined> = { PSL_VISUAL_PREVIEW: "0", TAGADA_STORE_ID: "store_fixture" };
function check(value: unknown, expected: unknown, message?: string) { assert.deepEqual(value, expected, message); checks++; }

function load(file: string, mocks: Record<string, unknown>): Record<string, unknown> {
  const filename = resolve(ROOT, file);
  const compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const output: Record<string, unknown> = {};
  const fn = new Script(`(function(require,module,exports){${compiled}\n})`, { filename })
    .runInContext(createContext({ console: { error() {} }, Date, URL, process: { env: vmEnv } }));
  fn((id: string) => { assert(id in mocks, `Offline dependency not provided: ${id}`); return mocks[id]; }, { exports: output }, output);
  return output;
}

const ordersMock = {
  saveOrderResearchAcknowledgement: async () => { savedDeclarations++; throw Error("New guest orders must not fabricate research declarations"); },
  markStatusIfPending: async () => {}, setInvoiceId: async () => {}, setPaymentMethod: async () => {},
  setOrderShippingSelection: async (_id: string, selection: ShippingSelection) => {
    check(selection.tagadaShippingRateId, "ship_fixture"); shippingBindings++;
  },
};
const reserve = async (order: Order) => {
  reservations++;
  if (!stockAvailable) return { ok: false, error: "Offline stock unavailable" };
  reserved.push(structuredClone(order));
  return { ok: true };
};
const prepare = load("lib/checkout/prepare-order.ts", {
  "@/lib/shipping/policy": shippingPolicy, "@/lib/shipping/request": shippingRequest,
  "@/lib/shipping/quote": { ...shippingQuote,
    validatePriorityShippingQuote: (token: unknown, context: shippingQuote.PriorityQuoteContext) =>
      shippingQuote.validatePriorityShippingQuote(token, context, { config: QUOTE_CONFIG, now: quoteNow, cardRateConfigured: () => true }) },
  "node:crypto": crypto, "@/lib/checkout/totals": totals, "@/lib/checkout/us-states": countries,
  "@/lib/orders/store": ordersMock,
  "@/lib/attribution/logic": attribution, "@/lib/payments/products": pricing, "@/lib/products/catalog": catalog,
  "@/lib/checkout/discount-codes": { DISCOUNT_CODES_ENABLED: false, lookupActiveDiscountCode: async () => { throw Error("Unexpected generic discount lookup"); } },
  "@/lib/partners/referral-logic": referralLogic,
  "@/lib/partners/referral-config": { referralCodesEnabled: () => true },
  "@/lib/partners/referral-store": {
    lookupReferralDiscount: async () => { referralLookups++; return { code: "fixture-1234abcd", percent: 10 }; },
    reserveReferralOrder: reserve,
  },
  "@/lib/inventory/store": { ensureInventorySchema: async () => {}, checkoutWithStockCheck: reserve },
}) as { prepareReservedOrder: (body: CheckoutBody, options?: PrepareOrderOptions) => Promise<PrepareOrderResult> };

const PAUSED_MESSAGE = "Card payments are paused (offline fixture).";
function route(file: string, cardPaused = false) {
  return load(file, {
    "next/server": { NextResponse }, "@/lib/checkout/prepare-order": prepare,
    "@/lib/checkout/us-states": countries, "@/lib/orders/store": ordersMock,
    "@/lib/checkout/card-availability": { CARD_CHECKOUT_PAUSED: cardPaused, CARD_CHECKOUT_PAUSED_MESSAGE: PAUSED_MESSAGE },
    "@/lib/privacy/server": { readRequestPrivacyConsent: async () => ({ consent: UNKNOWN_PRIVACY_CONSENT, binding: null }) },
    "@/lib/payments": { getPaymentProcessor: () => ({ createInvoice: async (input: { amount: number }) => {
      providerCreates++; check(input.amount, reserved.at(-1)!.total);
      return { id: "invoice_fixture", url: "https://checkout.example.invalid" };
    } }) },
    "@/lib/tagada": { isTagadaConfigured: () => true, getTagadaIdsForHandle: async () => ({ tagadaVariantId: "variant_fixture" }) },
    "@/lib/tagada/server": { createTagadaCheckoutSession: async () => {
      providerCreates++; return { checkoutToken: "checkout_fixture", sessionToken: "session_fixture" };
    } },
    "@/lib/partners/referral-logic": referralLogic,
    "@/lib/tagada/referral-checkout": { configuredReferralPromotionCode: () => null,
      configureAndVerifyCardSession: async () => ({ shippingRateId: "ship_fixture" }) },
  }) as { POST: (request: Request) => Promise<Response> };
}

function request(body: unknown) {
  const value = new Request("https://fixture.invalid/api/checkout", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  check(value.headers.has("Cookie"), false, "Guest route requests contain no session cookies");
  return value;
}

async function preparationChecks() {
  for (const paymentMethod of ["card", "bitcoin"] as const) {
    // Legacy or malicious extra body fields never become an account or declaration.
    for (const extras of [{}, { researchAcknowledgement: HISTORICAL }, { researchAcknowledgement: false, researchAccount: { id: "forged" } }]) {
      const result = await prepare.prepareReservedOrder({ ...BODY, ...extras }, { paymentMethod });
      check(result.ok, true); if (!result.ok) throw Error(result.error);
      check(result.order.researchAcknowledgement ?? null, null, "Guest checkout does not invent acceptance evidence");
      check(result.order.items[0].unitPrice, 47.99, "Current server catalog price remains authoritative");
      const expected = totals.computeTotals(47.99, "AZ", null, { paymentMethod });
      check(result.order.total, expected.total);
      check(result.order.shippingCost, 9.99);
      check(result.order.tax, 0, "Tax remains absorbed under existing policy");
      check(result.order.shipping.selection?.providerServiceCode, "GroundAdvantage");
    }
    for (const invalid of [null, [], {}, { ...BODY, email: "invalid" }, { ...BODY, items: [] },
      { ...BODY, items: [{ handle: "bpc-157", quantity: 0 }] }, { ...BODY, items: [{ handle: "bpc-157", quantity: 1.5 }] },
      { ...BODY, items: [{ handle: "bpc-157", quantity: 11 }] },
      { ...BODY, items: [BODY.items[0], BODY.items[0]] }, { ...BODY, currency: "EUR" },
      { ...BODY, shippingMethod: "express" }, { ...BODY, shipping: { ...SHIPPING, zip: "bad" } },
      { ...BODY, shipping: { ...SHIPPING, address: "PO Box 42" } },
      { ...BODY, shipping: { ...SHIPPING, city: "APO" } },
      { ...BODY, shipping: { ...SHIPPING, country: "CA" } }]) {
      const before = [reservations, savedDeclarations, referralLookups];
      const result = await prepare.prepareReservedOrder(invalid as CheckoutBody, { paymentMethod });
      check(result.ok, false); if (!result.ok) check(result.status, 400);
      check([reservations, savedDeclarations, referralLookups], before, "Invalid guest requests stop before order, stock or discount effects");
    }
  }
  check(savedDeclarations, 0);
}

async function priorityChecks() {
  for (const paymentMethod of ["card", "bitcoin"] as const) {
    quoteNow = Date.now();
    const item: Order["items"][number] = { handle: "bpc-157", name: "BPC-157", strength: "10 mg", quantity: 1, unitPrice: 47.99, lineTotal: 47.99 };
    const amounts = totals.computeTotals(47.99, "AZ", null, { paymentMethod, shippingMethod: "priority" });
    const context: shippingQuote.PriorityQuoteContext = { accountId: shippingQuote.GUEST_SHIPPING_ACCOUNT_ID, email: EMAIL,
      shipping: SHIPPING, items: [item], subtotalCents: 4799, discountCents: Math.round(amounts.discountAmount * 100),
      discountCode: amounts.discountCode, paymentMethod };
    const selection: ShippingSelection = { method: "priority", carrier: "USPS", providerServiceCode: "PriorityMail",
      serviceDisplayName: "USPS Priority Mail", transitDays: 2, deliveryEstimate: "Estimated 2 business days; not guaranteed.",
      quotedPostageUsd: 12, package: { ...shippingPolicy.PRIORITY_PACKAGE }, quotedAt: new Date(quoteNow).toISOString(),
      quoteExpiresAt: new Date(quoteNow + shippingPolicy.PRIORITY_QUOTE_TTL_MS).toISOString() };
    const issued = shippingQuote.issuePriorityShippingQuote(context, selection, QUOTE_CONFIG, quoteNow);
    const body = { ...BODY, shippingMethod: "priority", shippingQuote: issued.quoteToken };
    const good = await prepare.prepareReservedOrder(body, { paymentMethod });
    check(good.ok, true); if (!good.ok) throw Error(good.error);
    check(good.order.shippingCost, 24.99); check(good.order.total, amounts.total);
    check(good.order.shipping.selection?.providerServiceCode, "PriorityMail");
    const before = reservations;
    for (const changed of [{ ...body, email: "other@example.invalid" },
      { ...body, shipping: { ...SHIPPING, address: "124 Fixture Street" } },
      { ...body, items: [{ handle: "bpc-157", quantity: 2 }] },
      { ...body, shippingQuote: `${issued.quoteToken.slice(0, -4)}AAAA` },
      { ...body, shippingQuote: undefined }]) {
      const result = await prepare.prepareReservedOrder(changed, { paymentMethod });
      check(result.ok, false); if (!result.ok) check(result.status, 409);
      check(reservations, before, "A changed cart/address/email or invalid quote cannot reserve Priority shipping");
    }
    const opposite = await prepare.prepareReservedOrder(body, { paymentMethod: paymentMethod === "card" ? "bitcoin" : "card" });
    check(opposite.ok, false); if (!opposite.ok) check(opposite.status, 409);
    quoteNow += shippingPolicy.PRIORITY_QUOTE_TTL_MS;
    const expired = await prepare.prepareReservedOrder(body, { paymentMethod });
    check(expired.ok, false); if (!expired.ok) check(expired.status, 409);
    check(reservations, before, "Expired or different-payment quotes cannot reserve inventory");
  }
  quoteNow = Date.now();
}

async function routeChecks() {
  // Card checkout paused: the card route refuses before any stock reservation or provider session.
  const paused = route("app/api/checkout/card/session/route.ts", true);
  const beforePaused = [providerCreates, reservations];
  const pausedResponse = await paused.POST(request(BODY));
  check(pausedResponse.status, 503);
  check(((await pausedResponse.json()) as { error?: string }).error, PAUSED_MESSAGE);
  check([providerCreates, reservations], beforePaused, "Paused card checkout starts no reservation or provider session");
  for (const file of ["app/api/checkout/route.ts", "app/api/checkout/card/session/route.ts"]) {
    const handler = route(file);
    const beforeMalformed = [providerCreates, reservations];
    const malformed = await handler.POST(new Request("https://fixture.invalid/api/checkout", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{",
    }));
    check(malformed.status, 400); check([providerCreates, reservations], beforeMalformed);
    for (const body of [null, [], {}, { ...BODY, email: "invalid" }, { ...BODY, currency: "EUR" },
      { ...BODY, shippingMethod: "priority", shippingQuote: "forged" }]) {
      const before = [providerCreates, reservations];
      const response = await handler.POST(request(body));
      check(response.status, body && typeof body === "object" && "shippingQuote" in body ? 409 : 400);
      check([providerCreates, reservations], before, "Actual card/BTC routes reject invalid guest checkout before stock or provider work");
    }
    stockAvailable = false;
    const beforeUnavailable = providerCreates;
    const unavailable = await handler.POST(request(BODY));
    check(unavailable.status, 409); check(providerCreates, beforeUnavailable, "Failed stock reservation never starts a payment session");
    stockAvailable = true;
    const before = providerCreates;
    const success = await handler.POST(request(BODY));
    check(success.status, 200); check(providerCreates, before + 1, "A valid guest checkout starts exactly one offline provider fixture");
    const payload = await success.json();
    check(typeof payload.orderId, "string");
    check("researchAcknowledgementVersion" in payload, false);
    check(JSON.stringify(payload).includes(HISTORICAL.accountId), false, "Historical identity stays private");
    if (file.includes("card/session")) {
      check(payload.shippingMethod, "standard"); check(payload.tagadaShippingRateId, "ship_fixture");
      check(payload.pricing.subtotal, 47.99); check(payload.pricing.tax, 0);
    }
  }
  check(shippingBindings, 1); check(savedDeclarations, 0);
}

async function persistenceChecks() {
  const queries: Array<{ text: string; values: unknown[] }> = [];
  let found = true;
  let selected: Record<string, unknown> | null = null;
  const store = load("lib/orders/store.ts", {
    "@/lib/checkout/research-acknowledgement": research, "@/lib/shipping/policy": shippingPolicy,
    "@/lib/db/sql": { ensureSqlSchema: async (_name: string, initialize: () => Promise<void>) => initialize(),
      getSql: () => async (parts: TemplateStringsArray, ...values: unknown[]) => {
        const text = parts.join("?"); queries.push({ text, values });
        if (/SELECT \* FROM orders/.test(text)) return selected ? [selected] : [];
        return /RETURNING order_id/.test(text) && found ? [{ order_id: "fixture" }] : [];
      } },
  }) as { saveOrderResearchAcknowledgement: (id: string, evidence: research.OrderResearchAcknowledgement) => Promise<void>;
    getOrder: (id: string) => Promise<Order | null> };
  await store.saveOrderResearchAcknowledgement("fixture", { ...HISTORICAL, untrusted: "not persisted" } as research.OrderResearchAcknowledgement);
  const update = queries.find(q => /SET research_acknowledgement/.test(q.text))!;
  check(update.text.includes("status = 'pending'"), true);
  check(update.text.includes("research_acknowledgement IS NULL"), true, "Historical declarations retain write-once protection");
  check(JSON.parse(update.values[0] as string), HISTORICAL, "SQL receives only validated historical fields");
  check(queries.some(q => /ADD COLUMN IF NOT EXISTS research_acknowledgement JSONB/.test(q.text)), true);
  check(queries.some(q => /UPDATE orders[\s\S]*SET research_acknowledgement/.test(q.text) && !q.text.includes("order_id =")), false);
  found = false;
  await assert.rejects(store.saveOrderResearchAcknowledgement("missing", HISTORICAL)); checks++;
  const actual = reserved[0];
  selected = { order_id: actual.orderId, created_at: actual.createdAt, updated_at: actual.updatedAt, status: "pending", currency: "USD",
    email: actual.email, shipping: actual.shipping, items: actual.items, subtotal: actual.subtotal, tax_rate: 0, tax: 0,
    shipping_cost: actual.shippingCost, total: actual.total, attribution: null, research_acknowledgement: JSON.stringify(HISTORICAL) };
  const historicalOrder = await store.getOrder(actual.orderId);
  check(historicalOrder?.researchAcknowledgement, HISTORICAL, "Existing evidence remains readable after removing the gate");
  check("researchAcknowledgement" in toPublicOrder(historicalOrder!), false, "Historical identity and declarations stay out of public receipts");
  selected.research_acknowledgement = null;
  check((await store.getOrder(actual.orderId))?.researchAcknowledgement, null, "Unacknowledged orders remain unacknowledged");
}

function recoveryChecks() {
  const session: TagadaCardSession = { orderId: "fixture", checkoutToken: "checkout_fixture", sessionToken: "fixture_token", storeId: "store_fixture",
    customer: { email: EMAIL, firstName: "Offline", lastName: "Fixture" }, shippingAddress: { line1: SHIPPING.address, city: SHIPPING.city, state: "AZ", postalCode: "85001", country: "US" },
    items: [{ variantId: "variant_fixture", quantity: 1 }], shippingCost: 9.99, total: 57.98, cartFingerprint: "fixture" };
  const provider = { id: "session_fixture", storeId: session.storeId, checkoutToken: session.checkoutToken, currency: "USD",
    customer: { email: session.customer.email }, shippingAddress: { ...session.shippingAddress }, totals: { currency: "USD", total: 5798 } };
  check(cardSessionReadyToCharge(session, provider, provider.id), false, "Unbound shipping still blocks charging");
  const ready: TagadaCardSession = { ...session, shippingMethod: "standard", tagadaShippingRateId: "ship_fixture" };
  const boundProvider = { ...provider, selectedShippingRateId: "ship_fixture" };
  check(cardSessionReadyToCharge(ready, boundProvider, provider.id), true, "Guest readiness requires actual provider/rate/address evidence, not a declaration");
  check(cardSessionReadyToCharge({ ...ready, researchAcknowledgementVersion: "old" }, boundProvider, provider.id), true);
  check(cardSessionReadyToCharge(ready, { ...boundProvider, totals: { ...provider.totals, total: 1 } }, provider.id), false);
  check(cardSessionReadyToCharge(ready, { ...boundProvider, selectedShippingRateId: "wrong" }, provider.id), false);
  check(cardSessionReadyToCharge(ready, { ...boundProvider, shippingAddress: { ...session.shippingAddress, line1: "Other address" } }, provider.id), false);
  check(cardSessionReadyToCharge({ ...ready, shippingMethod: "priority", shippingQuoteExpiresAt: new Date(Date.now() - 1).toISOString() }, boundProvider, provider.id), false);
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
  const legacy = createCardSessionStore(() => storage, () => 100000);
  check(legacy.start({ ...session, researchAcknowledgementVersion: research.CHECKOUT_RESEARCH_ACK_VERSION }), true, "Existing session records remain readable");
  check(legacy.markProcessing(session.orderId), true);
  check(legacy.rememberConfirmation(session.orderId, { paymentId: "pay_fixture" }), true);
  const restored = createCardSessionStore(() => storage, () => 100001).getSnapshot();
  check(restored?.confirmation?.paymentId, "pay_fixture");
  check(restored?.phase, "confirming", "Already charged payments remain recoverable without starting a second charge");
}

async function main() {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw Error("External network is forbidden in guest checkout fixtures"); };
  try {
    await preparationChecks(); await priorityChecks(); await routeChecks(); await persistenceChecks(); recoveryChecks();
    console.log(`PASS: Guest checkout and historical evidence (${checks} checks: card/BTC without cookies or declarations, invalid requests and stock rejection before provider effects, signed Priority context/expiry, current pricing/shipping/tax, private historical evidence and payment recovery; zero real database/provider/payment/email calls).`);
  } finally { globalThis.fetch = previousFetch; }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
