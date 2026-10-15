/** Actual setup route, provider-evidence helpers and cancellation SQL; every effect is an offline fixture. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createContext, Script } from "node:vm";
import ts from "typescript";
import { NextResponse } from "next/server";
import * as countries from "../lib/checkout/us-states";
import * as referralLogic from "../lib/partners/referral-logic";
import * as research from "../lib/checkout/research-acknowledgement";
import * as shippingPolicy from "../lib/shipping/policy";
import { configureAndVerifyCardSession, type ReferralCardCheckoutClient } from "../lib/tagada/referral-checkout";
import type { Order } from "../lib/orders/types";

const ROOT = resolve(__dirname, "..");
let checks = 0;
const check = (actual: unknown, expected: unknown, message?: string) => { assert.deepEqual(actual, expected, message); checks++; };
type Failure = "mapping-missing" | "mapping-error" | "payment-method" | "create" | "persist-before" | "persist-after"
  | "address" | "rate" | "currency" | "price" | "selection" | "cleanup";
type Drift = "paid" | "shipped" | "invoiceId" | "paymentMethod" | "total" | "currency";
type Options = { failure?: Failure; drift?: Drift; unauthorized?: boolean; invalid?: boolean; configured?: boolean; preview?: boolean };
const template = {
  orderId: "psl_setup_fixture", status: "pending", paymentMethod: "card", invoiceId: null, currency: "USD",
  email: "fixture@example.invalid", subtotal: 59.99, discountAmount: 0, discountCode: null, shippingCost: 9.99, tax: 0, total: 69.98,
  items: [{ handle: "retatrutide", quantity: 1, unitPrice: 59.99, lineTotal: 59.99 }],
  shipping: { firstName: "Offline", lastName: "Fixture", address: "1 Fixture Street", city: "Phoenix", state: "AZ", zip: "85016", country: "US",
    selection: shippingPolicy.standardShippingSelection() },
  researchAcknowledgement: { version: research.CHECKOUT_RESEARCH_ACK_VERSION },
} as Order;

function load(file: string, mocks: Record<string, unknown>, env: Record<string, string | undefined> = {}) {
  const compiled = ts.transpileModule(readFileSync(resolve(ROOT, file), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const output: Record<string, unknown> = {};
  const fn = new Script(`(function(require,module,exports){${compiled}\n})`, { filename: file })
    .runInContext(createContext({ console: { error() {} }, process: { env } }));
  fn((id: string) => { assert(id in mocks, `Unexpected setup dependency: ${id}`); return mocks[id]; }, { exports: output }, output);
  return output;
}

async function run(options: Options = {}) {
  const saved = structuredClone(template), effects = { prepared: 0, creates: 0, selections: 0, cancellations: [] as Array<string | null>, queries: [] as string[] };
  const orders = load("lib/orders/store.ts", {
    "@/lib/checkout/research-acknowledgement": research,
    "@/lib/shipping/policy": shippingPolicy,
    "@/lib/db/sql": { getSql: () => async (parts: TemplateStringsArray, ...values: unknown[]) => {
      const sql = parts.join("?");
      if (!/UPDATE orders SET status/.test(sql)) return [];
      effects.queries.push(sql);
      // Check production SQL predicates before modeling their effect. This is
      // an offline state model, not a claim about PostgreSQL locking behavior.
      assert.match(sql, /WHERE order_id = \? AND status = 'pending'/); checks++;
      assert.match(sql, /payment_method = \?/); checks++;
      assert.match(sql, /total = \? AND currency = \?/); checks++;
      const absent = /invoice_id IS NULL/.test(sql);
      if (!absent) { assert.match(sql, /invoice_id = \?/); checks++; }
      const [status, id, ...rest] = values;
      const [invoiceId, method, total, currency] = absent ? [null, ...rest] : rest;
      effects.cancellations.push(invoiceId as string | null);
      check({ id, method, total, currency }, { id: template.orderId, method: "card", total: template.total, currency: "USD" });
      if (options.failure === "cleanup") throw new Error("Fixture persistence unavailable");
      if (saved.status === "pending" && saved.orderId === id && saved.invoiceId === invoiceId &&
          saved.paymentMethod === method && saved.total === total && saved.currency === currency) saved.status = status as Order["status"];
      return [];
    } },
  }) as { markStatusIfPending: (...args: unknown[]) => Promise<void> };
  const provider = { id: "session_fixture", storeId: "store_fixture", checkoutToken: "checkout_fixture", currency: "USD",
    customer: { email: template.email }, items: [{ variantId: "variant_fixture", quantity: 1 }], selectedShippingRateId: "rate_fixture",
    totals: { currency: "USD", subtotal: 5999, discount: 0, shipping: 999, tax: 0, total: options.failure === "price" ? 6999 : 6998 } };
  const client: ReferralCardCheckoutClient = {
    loadSession: async () => structuredClone(provider),
    updateCustomerAndAddress: async () => { if (options.failure === "address") throw new Error("Fixture address failure"); },
    getShippingRates: async () => options.failure === "rate" ? [] : [{ id: "rate_fixture", name: "USPS Ground Advantage", amount: 999,
      currency: options.failure === "currency" ? "EUR" : "USD" }],
    selectShippingRate: async () => {},
    applyPromoCode: async () => { throw new Error("Unexpected fixture promotion"); },
  };
  const route = load("app/api/checkout/card/session/route.ts", {
    "next/server": { NextResponse }, "@/lib/checkout/us-states": countries,
    "@/lib/checkout/prepare-order": { prepareReservedOrder: async () => {
      effects.prepared++;
      return options.invalid ? { ok: false, status: 400, error: "Fixture validation failure" } : { ok: true, order: structuredClone(template) };
    } },
    "@/lib/orders/store": {
      ...orders,
      setPaymentMethod: async () => { if (options.failure === "payment-method") throw new Error("Fixture method failure"); },
      setInvoiceId: async (_id: string, invoiceId: string) => {
        if (options.failure === "persist-before") throw new Error("Fixture link failure before commit");
        saved.invoiceId = invoiceId;
        if (options.failure === "persist-after") throw new Error("Fixture link response lost after commit");
      },
      setOrderShippingSelection: async () => {
        effects.selections++;
        if (options.drift) {
          if (options.drift === "paid" || options.drift === "shipped") saved.status = options.drift;
          else if (options.drift === "invoiceId") saved.invoiceId = "another_checkout";
          else if (options.drift === "paymentMethod") saved.paymentMethod = "bitcoin";
          else if (options.drift === "total") saved.total++;
          else saved.currency = "EUR";
          throw new Error("Fixture snapshot changed during setup");
        }
        if (options.failure === "selection" || options.failure === "cleanup") throw new Error("Fixture selection save failure");
      },
    },
    "@/lib/tagada": { isTagadaConfigured: () => options.configured !== false,
      getTagadaIdsForHandle: async () => {
        if (options.failure === "mapping-error") throw new Error("Fixture mapping failure");
        return options.failure === "mapping-missing" ? null : { tagadaVariantId: "variant_fixture" };
      } },
    "@/lib/tagada/server": { createTagadaCheckoutSession: async () => {
      effects.creates++; if (options.failure === "create") throw new Error("Fixture session failure");
      return { checkoutToken: "checkout_fixture", sessionToken: "private_fixture_session_token" };
    } },
    "@/lib/privacy/server": { readRequestPrivacyConsent: async () => null },
    "@/lib/partners/referral-logic": referralLogic,
    "@/lib/tagada/referral-checkout": { configuredReferralPromotionCode: () => null,
      configureAndVerifyCardSession: (order: Order, session: { checkoutToken: string; sessionToken: string }, binding: { storeId: string; items: Array<{ variantId: string; quantity: number }> }) =>
        configureAndVerifyCardSession(order, session, binding, null, client) },
    "@/lib/research-auth/server": { getResearchAccount: async () => options.unauthorized ? null : { id: "fixture_account", email: template.email } },
  }, { TAGADA_STORE_ID: "store_fixture", PSL_VISUAL_PREVIEW: options.preview ? "1" : "0" }) as { POST: (request: Request) => Promise<Response> };
  const response = await route.POST(new Request("https://fixture.invalid/api/checkout/card/session", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
  }));
  const payload = await response.json();
  if (response.status !== 200) {
    check(payload.checkoutToken, undefined); check(payload.sessionToken, undefined);
    check(JSON.stringify(payload).includes("private_fixture_session_token"), false);
  }
  return { response, payload, saved, effects };
}

async function main() {
  const prior = { ...process.env }, oldFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("All external calls are forbidden in setup regressions"); };
  Object.assign(process.env, { PSL_VISUAL_PREVIEW: "0", TAGADA_SHIPPING_STANDARD_PAID_RATE_ID: "rate_fixture" });
  try {
    for (const failure of ["mapping-missing", "mapping-error", "payment-method", "create", "persist-before", "persist-after",
      "address", "rate", "currency", "price", "selection"] as Failure[]) {
      const result = await run({ failure });
      check(result.response.status, failure === "mapping-missing" ? 409 : 502);
      check(result.saved.status, "cancelled", `${failure} releases only the new pending stock reservation`);
      const preToken = ["mapping-missing", "mapping-error", "payment-method", "create"].includes(failure);
      check(result.effects.cancellations, preToken ? [null] : failure.startsWith("persist-") ? ["checkout_fixture", null] : ["checkout_fixture"]);
      if (preToken) check(result.saved.invoiceId, null);
    }
    for (const drift of ["paid", "shipped", "invoiceId", "paymentMethod", "total", "currency"] as Drift[]) {
      const result = await run({ drift });
      check(result.response.status, 502);
      check(result.effects.cancellations, ["checkout_fixture"]);
      check(result.saved.status, drift === "paid" || drift === "shipped" ? drift : "pending", "Concurrent settlement or binding changes are preserved");
    }
    const cleanupFailure = await run({ failure: "cleanup" });
    check(cleanupFailure.response.status, 502); check(cleanupFailure.saved.status, "pending");
    const success = await run();
    check(success.response.status, 200); check(success.saved.status, "pending");
    check(success.effects.cancellations, [], "A ready payable session is never cancelled");
    check(success.payload.checkoutToken, "checkout_fixture"); check(success.payload.tagadaShippingRateId, "rate_fixture");
    for (const [options, status] of [[{ unauthorized: true }, 401], [{ invalid: true }, 400], [{ configured: false }, 503], [{ preview: true }, 503]] as const) {
      const result = await run(options);
      check(result.response.status, status); check(result.effects.cancellations, []); check(result.effects.creates, 0);
    }
    console.log(`PASS: card session setup (${checks} offline checks; actual route/provider-evidence/cancellation SQL, before/after-commit failures, exact binding and paid-order preservation; zero live requests, orders or payments).`);
  } finally {
    globalThis.fetch = oldFetch;
    for (const key of Object.keys(process.env)) if (!(key in prior)) delete process.env[key];
    Object.assign(process.env, prior);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
