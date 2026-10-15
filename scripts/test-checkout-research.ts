/** Actual checkout/persistence boundaries with offline identity, stock and SQL fixtures only. */
import assert from "node:assert/strict";
import * as crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createContext, Script } from "node:vm";
import ts from "typescript";
import { NextResponse } from "next/server";
import * as research from "../lib/checkout/research-acknowledgement";
import * as qualification from "../lib/research-auth/qualification";
import * as pricing from "../lib/payments/products";
import * as catalog from "../lib/products/catalog";
import * as totals from "../lib/checkout/totals";
import * as countries from "../lib/checkout/us-states";
import * as attribution from "../lib/attribution/logic";
import * as referralLogic from "../lib/partners/referral-logic";
import { UNKNOWN_PRIVACY_CONSENT } from "../lib/privacy/types";
import { toPublicOrder, type Order } from "../lib/orders/types";
import { cardSessionReadyToCharge, createCardSessionStore, type TagadaCardSession } from "../lib/checkout/card-session-storage";
import type { CheckoutBody, PrepareOrderOptions, PrepareOrderResult } from "../lib/checkout/prepare-order";

const ROOT = resolve(__dirname, "..");
const ACCOUNT = { id: "offline_research_account", email: "fixture@example.invalid" };
const SHIPPING = { firstName: "Offline", lastName: "Fixture", address: "123 Fixture Street", city: "Phoenix", state: "AZ", zip: "85001", country: "US" };
const DECLARATION = { version: research.CHECKOUT_RESEARCH_ACK_VERSION, researchStatus: "independent_researcher", researchUseOnly: true };
const BODY = { email: ACCOUNT.email, shipping: SHIPPING, items: [{ handle: "bpc-157", quantity: 1 }], researchAcknowledgement: DECLARATION };
let checks = 0, reservations = 0, savedDeclarations = 0, cancellations = 0, providerCreates = 0, referralLookups = 0;
let failSave = false;
const reserved: Order[] = [];
const saved = new Map<string, research.OrderResearchAcknowledgement>();
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
  saveOrderResearchAcknowledgement: async (id: string, declaration: research.OrderResearchAcknowledgement) => {
    savedDeclarations++;
    if (failSave) throw new Error("Offline mandatory save failure");
    saved.set(id, structuredClone(declaration));
  },
  markStatusIfPending: async (_id: string, state: string) => { check(state, "cancelled"); cancellations++; },
  setInvoiceId: async () => {}, setPaymentMethod: async () => {},
};
const prepare = load("lib/checkout/prepare-order.ts", {
  "node:crypto": crypto, "@/lib/checkout/totals": totals, "@/lib/checkout/us-states": countries,
  "@/lib/checkout/research-acknowledgement": research, "@/lib/orders/store": ordersMock,
  "@/lib/attribution/logic": attribution, "@/lib/payments/products": pricing, "@/lib/products/catalog": catalog,
  "@/lib/checkout/discount-codes": { DISCOUNT_CODES_ENABLED: false, lookupActiveDiscountCode: async () => { throw Error("Unexpected generic discount lookup"); } },
  "@/lib/partners/referral-logic": referralLogic,
  "@/lib/partners/referral-config": { referralCodesEnabled: () => true },
  "@/lib/partners/referral-store": {
    lookupReferralDiscount: async () => { referralLookups++; return { code: "fixture-1234abcd", percent: 10 }; },
    reserveReferralOrder: async (order: Order) => { reservations++; reserved.push(structuredClone(order)); return { ok: true }; },
  },
  "@/lib/inventory/store": { ensureInventorySchema: async () => {}, checkoutWithStockCheck: async (order: Order) => {
    reservations++; reserved.push(structuredClone(order)); return { ok: true };
  } },
}) as { prepareReservedOrder: (body: CheckoutBody, options?: PrepareOrderOptions) => Promise<PrepareOrderResult> };

function route(file: string, account: typeof ACCOUNT | null = ACCOUNT) {
  return load(file, {
    "next/server": { NextResponse }, "@/lib/checkout/prepare-order": prepare,
    "@/lib/checkout/us-states": countries, "@/lib/orders/store": ordersMock,
    "@/lib/research-auth/server": { getResearchAccount: async () => account },
    "@/lib/privacy/server": { readRequestPrivacyConsent: async () => ({ consent: UNKNOWN_PRIVACY_CONSENT, binding: null }) },
    "@/lib/payments": { getPaymentProcessor: () => ({ createInvoice: async () => {
      providerCreates++; return { id: "invoice_fixture", url: "https://checkout.example.invalid" };
    } }) },
    "@/lib/tagada": { isTagadaConfigured: () => true, getTagadaIdsForHandle: async () => ({ tagadaVariantId: "variant_fixture" }) },
    "@/lib/tagada/server": { createTagadaCheckoutSession: async () => {
      providerCreates++; return { checkoutToken: "checkout_fixture", sessionToken: "session_fixture" };
    } },
    "@/lib/partners/referral-logic": referralLogic,
    "@/lib/tagada/referral-checkout": { configuredReferralPromotionCode: () => null,
      configureAndVerifyReferralCardSession: async () => { throw Error("Unexpected referral provider fixture"); } },
  }) as { POST: (request: Request) => Promise<Response> };
}

async function preparationChecks() {
  const bad = [undefined, null, [], {}, { ...DECLARATION, version: undefined }, { ...DECLARATION, version: "old" },
    { ...DECLARATION, researchStatus: "" }, { ...DECLARATION, researchStatus: "consumer" }, { ...DECLARATION, researchStatus: {} },
    { ...DECLARATION, researchUseOnly: undefined }, { ...DECLARATION, researchUseOnly: false },
    { ...DECLARATION, researchUseOnly: "true" }, { ...DECLARATION, researchUseOnly: 1 }];
  for (const paymentMethod of ["card", "bitcoin"] as const) {
    for (const researchAcknowledgement of bad) {
      const before = [reservations, savedDeclarations, referralLookups];
      const result = await prepare.prepareReservedOrder({ ...BODY, discountCode: "fixture-1234abcd", researchAcknowledgement },
        { paymentMethod, researchAccount: ACCOUNT, cardReferralPromotionConfigured: true });
      check(result.ok, false); if (!result.ok) check(result.status, 400);
      check([reservations, savedDeclarations, referralLookups], before, "Missing or forged declarations stop before stock, referral and persistence boundaries");
    }
    for (const researchAccount of [undefined, null, { id: "", email: ACCOUNT.email }, { id: " ", email: ACCOUNT.email }, { id: "x".repeat(151), email: ACCOUNT.email }]) {
      const before = reservations;
      const result = await prepare.prepareReservedOrder({ ...BODY, researchAccount: ACCOUNT } as CheckoutBody, { paymentMethod, researchAccount });
      check(result.ok, false); if (!result.ok) check(result.status, 401);
      check(reservations, before, "Body account identity cannot authorize checkout");
    }
    for (const status of qualification.RESEARCH_STATUSES) {
      const before = Date.now();
      const result = await prepare.prepareReservedOrder({ ...BODY, researchAcknowledgement: {
        ...DECLARATION, researchStatus: status.value, accountId: "forged", acceptedAt: "2000-01-01T00:00:00.000Z", verifiedResearcher: true,
      } }, { paymentMethod, researchAccount: ACCOUNT });
      check(result.ok, true); if (!result.ok) throw Error(result.error);
      check(result.order.researchAcknowledgement?.researchStatus, status.value);
      check(result.order.researchAcknowledgement?.accountId, ACCOUNT.id);
      check(result.order.researchAcknowledgement?.statement, research.RESEARCH_USE_CHECKOUT_STATEMENT);
      check(result.order.researchAcknowledgement?.acceptedAt, result.order.createdAt);
      check(Date.parse(result.order.researchAcknowledgement!.acceptedAt) >= before, true);
      check(structuredClone(saved.get(result.order.orderId)), structuredClone(result.order.researchAcknowledgement));
      check(JSON.stringify(result.order.researchAcknowledgement).includes("verifiedResearcher"), false);
      check("researchAcknowledgement" in toPublicOrder(result.order), false);
      check(result.order.items[0].unitPrice, 47.99, "Current sale pricing remains authoritative");
      const expected = totals.computeTotals(47.99, "AZ", null, { paymentMethod });
      check(result.order.total, expected.total, "Existing card/Bitcoin benefit and shipping stay unchanged");
    }
    failSave = true;
    const priorCancellation = cancellations;
    const result = await prepare.prepareReservedOrder(BODY, { paymentMethod, researchAccount: ACCOUNT });
    check(result.ok, false); if (!result.ok) check(result.status, 500);
    check(cancellations, priorCancellation + 1, "Mandatory save failure cancels pending stock reservation");
    failSave = false;
  }
}

async function routeChecks() {
  for (const file of ["app/api/checkout/route.ts", "app/api/checkout/card/session/route.ts"]) {
    const unauthenticated = route(file, null);
    const beforeUnauthorized = [providerCreates, reservations, savedDeclarations];
    const rejected = await unauthenticated.POST(new Request("https://fixture.invalid/api/checkout", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(BODY),
    }));
    check(rejected.status, 401);
    check([providerCreates, reservations, savedDeclarations], beforeUnauthorized, "Real route guards reject missing account before order/payment work");
    const handler = route(file);
    for (const researchAcknowledgement of [undefined, { ...DECLARATION, researchStatus: "" }, { ...DECLARATION, researchUseOnly: false }]) {
      const before = [providerCreates, reservations];
      const response = await handler.POST(new Request("https://fixture.invalid/api/checkout", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...BODY, researchAcknowledgement }),
      }));
      check(response.status, 400); check([providerCreates, reservations], before, "Actual card/BTC endpoints never start provider checkout when either choice is absent");
    }
    failSave = true;
    const before = providerCreates;
    const response = await handler.POST(new Request("https://fixture.invalid/api/checkout", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(BODY),
    }));
    check(response.status, 500); check(providerCreates, before, "Persistence failure cannot issue a provider session/invoice");
    failSave = false;
    const success = await handler.POST(new Request("https://fixture.invalid/api/checkout", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(BODY),
    }));
    check(success.status, 200);
    const payload = await success.json();
    check(saved.has(payload.orderId), true);
    if (file.includes("card/session")) check(payload.researchAcknowledgementVersion, research.CHECKOUT_RESEARCH_ACK_VERSION);
    check(JSON.stringify(payload).includes(ACCOUNT.id), false, "Private account evidence is not returned with payment session");
  }
}

async function persistenceChecks() {
  const queries: Array<{ text: string; values: unknown[] }> = [];
  let found = true;
  let selected: Record<string, unknown> | null = null;
  const store = load("lib/orders/store.ts", {
    "@/lib/checkout/research-acknowledgement": research,
    "@/lib/db/sql": { getSql: () => async (parts: TemplateStringsArray, ...values: unknown[]) => {
      const text = parts.join("?"); queries.push({ text, values });
      if (/SELECT \* FROM orders/.test(text)) return selected ? [selected] : [];
      return /RETURNING order_id/.test(text) && found ? [{ order_id: "fixture" }] : [];
    } },
  }) as { saveOrderResearchAcknowledgement: (id: string, evidence: research.OrderResearchAcknowledgement) => Promise<void>;
    getOrder: (id: string) => Promise<Order | null> };
  const evidence = saved.values().next().value!;
  await store.saveOrderResearchAcknowledgement("fixture", { ...evidence, untrusted: "not persisted" } as research.OrderResearchAcknowledgement);
  const update = queries.find(q => /SET research_acknowledgement/.test(q.text))!;
  check(update.text.includes("status = 'pending'"), true);
  check(update.text.includes("research_acknowledgement IS NULL"), true, "Historical declarations cannot be silently overwritten");
  check(JSON.parse(update.values[0] as string), evidence, "SQL receives only the validated evidence allowlist");
  check(queries.some(q => /ADD COLUMN IF NOT EXISTS research_acknowledgement JSONB/.test(q.text)), true);
  check(queries.some(q => /UPDATE orders[\s\S]*SET research_acknowledgement/.test(q.text) && !q.text.includes("order_id =")), false, "No historical backfill invents acceptance");
  found = false;
  await assert.rejects(store.saveOrderResearchAcknowledgement("missing", evidence)); checks++;
  const actual = reserved[0];
  selected = { order_id: actual.orderId, created_at: actual.createdAt, updated_at: actual.updatedAt, status: "pending", currency: "USD",
    email: actual.email, shipping: actual.shipping, items: actual.items, subtotal: actual.subtotal, tax_rate: 0, tax: 0, shipping_cost: actual.shippingCost,
    total: actual.total, attribution: null, research_acknowledgement: JSON.stringify(evidence) };
  check((await store.getOrder(actual.orderId))?.researchAcknowledgement, evidence);
  selected.research_acknowledgement = null;
  check((await store.getOrder(actual.orderId))?.researchAcknowledgement, null, "Old records stay unacknowledged without fabricated fields");
}

function recoveryChecks() {
  const session: TagadaCardSession = { orderId: "fixture", checkoutToken: "checkout_fixture", sessionToken: "fixture_token", storeId: "store_fixture",
    customer: { email: ACCOUNT.email, firstName: "Offline", lastName: "Fixture" }, shippingAddress: { line1: SHIPPING.address, city: SHIPPING.city, state: "AZ", postalCode: "85001", country: "US" },
    items: [{ variantId: "variant_fixture", quantity: 1 }], shippingCost: 9.99, total: 57.98, cartFingerprint: "fixture" };
  const provider = { id: "session_fixture", storeId: session.storeId, checkoutToken: session.checkoutToken, currency: "USD", totals: { currency: "USD", total: 5798 } };
  check(cardSessionReadyToCharge(session, provider, provider.id), false, "Legacy ready sessions cannot initiate another card charge");
  check(cardSessionReadyToCharge({ ...session, researchAcknowledgementVersion: "old" }, provider, provider.id), false);
  check(cardSessionReadyToCharge({ ...session, researchAcknowledgementVersion: research.CHECKOUT_RESEARCH_ACK_VERSION }, provider, provider.id), true);
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
  const legacy = createCardSessionStore(() => storage, () => 100000);
  check(legacy.start(session), true, "Old records remain readable for payment recovery");
  check(legacy.markProcessing(session.orderId), true);
  check(legacy.rememberConfirmation(session.orderId, { paymentId: "pay_fixture" }), true);
  const restored = createCardSessionStore(() => storage, () => 100001).getSnapshot();
  check(restored?.confirmation?.paymentId, "pay_fixture");
  check(restored?.phase, "confirming", "Existing charged payment confirmation remains recoverable");
}

async function main() {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw Error("External network is forbidden in research checkout fixtures"); };
  try {
    await preparationChecks(); await routeChecks(); await persistenceChecks(); recoveryChecks();
    console.log(`PASS: Research checkout (${checks} checks: explicit empty/unchecked choices, card+BTC server rejection before side effects, authenticated private evidence, fail-closed persistence, old-session charge block and paid-session recovery; zero real database/provider/order/payment calls).`);
  } finally { globalThis.fetch = previousFetch; }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
