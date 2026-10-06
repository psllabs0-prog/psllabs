/**
 * Fully offline payment-route regressions.
 * Executes the actual routes, shared verifier, SDK reads, and HMAC verifier.
 * Only persistence/fulfillment/analytics effects are replaced with spies.
 * All fetches are intercepted; only fixture provider GETs are accepted.
 * Run: npx tsx scripts/test-card-routes.ts
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createContext, Script } from "node:vm";
import Tagada from "@tagadapay/node-sdk";
import { NextResponse } from "next/server";
import ts from "typescript";
import type { CardOrderForVerification } from "../lib/tagada/verify-payment";
import type { Order, OrderStatus } from "../lib/orders/types";
import type { ensureFinanceTransactionForPaidOrder, safeRecordPaidOrderFinance } from "../lib/finance/record";

const FIXTURE_KEY = "offline_fixture_secret_key";
const FIXTURE_SECRET = "offline_fixture_webhook_secret";
const localFixture: CardOrderForVerification & { status: string } = {
  orderId: "psl_fixture", paymentMethod: "card", invoiceId: "checkout_fixture",
  total: 59.99, currency: "USD", status: "pending",
};
const paymentFixture = {
  id: "pay_fixture", orderId: "order_fixture", storeId: "store_fixture", accountId: "acc_fixture",
  amount: 5999, currency: "USD", status: "succeeded", subStatus: "approved",
  transactions: [{
    id: "txn_fixture", paymentId: "pay_fixture", storeId: "store_fixture", accountId: "acc_fixture",
    type: "purchase", status: "succeeded", result: "approved", isTest: false, draft: false,
    amount: 5999, currency: "USD",
  }],
};
const providerOrderFixture = {
  id: "order_fixture", storeId: "store_fixture", accountId: "acc_fixture", status: "paid",
  currency: "USD", paidAmount: 5999, checkoutSessionId: "ch_fixture", draft: false,
  checkoutSession: { id: "ch_fixture", storeId: "store_fixture", checkoutToken: "checkout_fixture", draft: false },
  summaries: [{ orderId: "order_fixture", checkoutSessionId: "ch_fixture", totalAmount: 5999, currency: "USD" }],
  payments: [paymentFixture],
};
const browserBody = { orderId: "psl_fixture", paymentId: "pay_fixture", checkoutSessionId: "ch_fixture" };
const paidEvent = {
  id: "evt_fixture", type: "payment/succeeded",
  data: { paymentId: "pay_fixture", orderId: "order_fixture", metadata: { orderId: "psl_fixture" } },
};
const bitcoinInvoiceFixture = {
  id: "invoice_fixture", storeId: "store_fixture", type: "Standard", amount: "59.99", paidAmount: "59.99",
  currency: "USD", status: "Settled", additionalStatus: "None", metadata: { orderId: "psl_fixture" },
};
type LocalOrder = typeof localFixture;
type SettlementBinding = Pick<LocalOrder, "paymentMethod" | "total" | "currency">;
type Route = { POST: (request: Request) => Promise<Response> };
type CronRoute = { GET: (request: Request) => Promise<Response>; maxDuration: number };
type FinanceModule = {
  ensureFinanceTransactionForPaidOrder: typeof ensureFinanceTransactionForPaidOrder;
  safeRecordPaidOrderFinance: typeof safeRecordPaidOrderFinance;
};
type Effects = {
  fulfillment: Array<{ orderId: string; invoiceId: string }>;
  bindings: SettlementBinding[];
  settled: string[];
  finance: Array<{ order: LocalOrder; options: Record<string, unknown> }>;
  events: Record<string, unknown>[];
  processed: unknown[][];
  claims: string[];
  sent: string[];
  releases: string[];
  analytics: string[];
  ads: Array<{ order: LocalOrder; proof: { provider: string; paymentId: string } }>;
  googleReceipts: Array<{ order: LocalOrder; proof: { provider: string; paymentId: string } }>;
  forbidden: string[];
  reads: string[];
  upserts: Record<string, unknown>[];
  ledger: string[];
  cronReconciliations: number;
  flushLimits: Array<number | undefined>;
  bitcoinReads: string[];
  failedUpdates: string[];
};
type State = {
  configured: boolean;
  secret: string | undefined;
  orders: Map<string, LocalOrder>;
  payment: typeof paymentFixture;
  providerOrder: typeof providerOrderFixture;
  providerStatus: number;
  fulfillmentOk: boolean;
  localOrderRead: boolean;
  providerHook: (() => void) | undefined;
  afterFulfillmentHook: ((order: LocalOrder) => void) | undefined;
  btcpaySecret: string | undefined;
  btcpayStoreId: string | undefined;
  bitcoinInvoice: typeof bitcoinInvoiceFixture;
  bitcoinReadHook: (() => void) | undefined;
  cronSecret: string | undefined;
  reconcileReject: boolean;
  flushHook: (() => Promise<void>) | undefined;
  effects: Effects;
};
const ROOT = resolve(__dirname, "..");
let cases = 0;
let activeState: State | undefined;

function state(): State {
  return {
    configured: true, secret: FIXTURE_SECRET,
    orders: new Map([[localFixture.orderId, structuredClone(localFixture)]]),
    payment: structuredClone(paymentFixture), providerOrder: structuredClone(providerOrderFixture),
    providerStatus: 200, fulfillmentOk: true, localOrderRead: false, providerHook: undefined, afterFulfillmentHook: undefined,
    btcpaySecret: FIXTURE_SECRET, btcpayStoreId: "store_fixture", cronSecret: "offline_fixture_cron_secret",
    bitcoinInvoice: structuredClone(bitcoinInvoiceFixture), bitcoinReadHook: undefined,
    reconcileReject: false, flushHook: undefined,
    effects: { fulfillment: [], bindings: [], settled: [], finance: [], events: [], processed: [], claims: [], sent: [], releases: [], analytics: [], ads: [], googleReceipts: [], forbidden: [], reads: [], upserts: [], ledger: [], cronReconciliations: 0, flushLimits: [], bitcoinReads: [], failedUpdates: [] },
  };
}

/** This replaces fetch outright and never delegates to the original fetch. */
async function fixtureFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  assert(activeState, "provider fetch must belong to a test scenario");
  const s = activeState;
  const url = new URL(input instanceof Request ? input.url : String(input));
  const method = init?.method ?? (input instanceof Request ? input.method : "GET");
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  if (url.origin === "https://btcpay.fixture.invalid" && method === "GET" &&
      url.pathname === "/api/v1/stores/store_fixture/invoices/invoice_fixture" && !url.search) {
    assert.equal(headers.get("authorization"), `token ${FIXTURE_KEY}`);
    assert.equal(init?.cache, "no-store"); assert.equal(init?.redirect, "error");
    s.effects.bitcoinReads.push(url.pathname);
    if (s.bitcoinReadHook) { const hook = s.bitcoinReadHook; s.bitcoinReadHook = undefined; hook(); }
    return Response.json(structuredClone(s.bitcoinInvoice));
  }
  if (url.origin !== "https://api.tagada.io" || method !== "GET" ||
      !/^\/api\/public\/v1\/(?:payments\/pay_fixture|orders\/order_fixture)$/.test(url.pathname) || url.search) {
    s.effects.forbidden.push(`${method} ${url.origin}${url.pathname}`);
    throw new Error("Non-fixture request forbidden by offline regression");
  }
  assert.equal(headers.get("authorization"), `Bearer ${FIXTURE_KEY}`, "SDK read must use the server fixture key");
  s.effects.reads.push(url.pathname);
  if (s.providerHook && s.localOrderRead) { const hook = s.providerHook; s.providerHook = undefined; hook(); }
  if (s.providerStatus !== 200) {
    return Response.json({ error: { message: "Fixture lookup unavailable" } }, { status: s.providerStatus });
  }
  return Response.json(url.pathname.includes("/payments/")
    ? structuredClone(s.payment) : { order: structuredClone(s.providerOrder) });
}

/**
 * Compile source under an allowlisted loader. This runs production control flow
 * without importing any real persistence, SMTP, finance, or analytics module.
 * A newly introduced unmocked dependency fails closed instead of loading it.
 */
function harness(s: State, actualFinance = false) {
  const modules = new Map<string, Record<string, unknown>>();
  const context = createContext({
    Request, Response, URL, Headers, Buffer, AbortSignal, fetch: fixtureFetch,
    process: { env: { TAGADA_WEBHOOK_SECRET: s.secret, BTCPAY_WEBHOOK_SECRET: s.btcpaySecret,
      BTCPAY_STORE_ID: s.btcpayStoreId, BTCPAY_URL: "https://btcpay.fixture.invalid", BTCPAY_API_KEY: FIXTURE_KEY,
      CRON_SECRET: s.cronSecret } },
    console: { info() {}, warn() {}, error() {} },
  });
  const mocks: Record<string, Record<string, unknown>> = {
    "next/server": { NextResponse },
    "@tagadapay/node-sdk": { __esModule: true, default: Tagada },
    "crypto": { __esModule: true, default: crypto },
    "node:crypto": { __esModule: true, default: crypto },
    "@/lib/seo": { SITE_URL: "https://fixture.invalid", PAYMENTS_URL: "https://fixture.invalid" },
    "@/lib/tagada": {
      isTagadaConfigured: () => s.configured,
      getTagadaApiKey: () => FIXTURE_KEY,
      getTagadaStoreId: () => "store_fixture",
    },
    "@/lib/orders/store": {
      getOrder: async (id: string) => { s.localOrderRead = true; return structuredClone(s.orders.get(id) ?? null); },
      getOrderByInvoice: async (invoice: string) => {
        s.localOrderRead = true;
        return structuredClone([...s.orders.values()].find((order) => order.invoiceId === invoice) ?? null);
      },
      claimTagadaWebhook: async (id: string) => { s.effects.claims.push(id); return true; },
      markTagadaWebhookSent: async (id: string) => { s.effects.sent.push(id); },
      releaseTagadaWebhookClaim: async (id: string) => { s.effects.releases.push(id); },
      // Unexpected legacy mutation APIs fail rather than quietly pretending success.
      setInvoiceId: async () => { throw new Error("Payment confirmation must preserve the checkout binding"); },
      setPaymentMethod: async () => { throw new Error("Payment confirmation must preserve the original payment method"); },
      markStatusIfPending: async (id: string, status: string, binding?: SettlementBinding & { invoiceId: string }) => {
        assert(binding, "failed callback must retain exact verified invoice binding");
        assert.equal(binding.paymentMethod, "bitcoin");
        const order = s.orders.get(id);
        if (order?.status === "pending" && order.invoiceId === binding.invoiceId && order.paymentMethod === binding.paymentMethod &&
            order.total === binding.total && order.currency === binding.currency) {
          order.status = status; s.effects.failedUpdates.push(id);
        }
      },
    },
    "@/lib/orders/fulfill-paid-order": {
      fulfillPaidOrder: async (orderId: string, invoiceId: string, _prefix: string, binding?: SettlementBinding) => {
        s.effects.fulfillment.push({ orderId, invoiceId });
        if (_prefix !== "[btcpay-webhook]") {
          assert(binding, "card routes must pass their verified amount/currency/method snapshot to guarded settlement");
          assert.equal(binding.paymentMethod, "card");
        } else {
          assert(binding, "Bitcoin settlement must receive its independently verified snapshot");
          assert.equal(binding.paymentMethod, "bitcoin");
          assert(s.effects.bitcoinReads.length > 0, "Bitcoin must authenticate provider invoice before fulfillment");
        }
        if (binding) s.effects.bindings.push(structuredClone(binding));
        if (!s.fulfillmentOk) return { ok: false, stockDecrementFailed: false };
        const order = s.orders.get(orderId);
        assert(order, "fulfillment requires an existing local order");
        // In-memory model of the settlement guard. This checks that the route
        // provides the verified snapshot; it is NOT proof of database locking.
        if (invoiceId !== order.invoiceId || (binding && (binding.paymentMethod !== order.paymentMethod ||
            binding.total !== order.total || binding.currency !== order.currency)) ||
            !["pending", "paid", "shipped"].includes(order.status)) {
          return { ok: false, stockDecrementFailed: false };
        }
        if (order.status === "pending") { order.status = "paid"; s.effects.settled.push(orderId); }
        s.afterFulfillmentHook?.(order);
        return { ok: true, stockDecrementFailed: false };
      },
    },
    "@/lib/finance/record": {
      recordProviderEvent: async (event: Record<string, unknown>) => {
        s.effects.events.push(structuredClone(event));
        return { eventId: s.effects.events.length, duplicate: false };
      },
      safeRecordPaidOrderFinance: async (order: LocalOrder, options: Record<string, unknown>) => {
        s.effects.finance.push({ order: structuredClone(order), options: structuredClone(options) });
      },
    },
    "@/lib/finance/store": {
      markPaymentEventProcessed: async (...args: unknown[]) => { s.effects.processed.push(args); },
      insertPaymentEventIdempotent: async (event: Record<string, unknown>) => {
        s.effects.events.push(structuredClone(event));
        return { event: { id: s.effects.events.length }, created: true };
      },
      upsertFinanceTransaction: async (input: Record<string, unknown>) => {
        s.effects.upserts.push(structuredClone(input));
        return { row: input, created: s.effects.upserts.length === 1 };
      },
    },
    "@/lib/products/catalog": { getCatalogProductByHandle: () => null },
    "@/lib/ledger/store": { logSaleIfNew: async (order: Order) => { s.effects.ledger.push(order.orderId); } },
    "@/lib/plausible": {
      trackPlausiblePurchase: async (order: LocalOrder) => { s.effects.analytics.push(order.orderId); },
    },
    "@/lib/openai-ads/delivery": {
      safeTrackVerifiedPurchase: async (order: LocalOrder, proof: { provider: string; paymentId: string }) => {
        assert(["paid", "shipped"].includes(order.status), "Ads receives a paid database snapshot after verified settlement");
        if (proof.provider === "tagada") assert(s.effects.reads.length >= 2, "Ads delivery must follow actual authenticated provider payment/order reads");
        s.effects.ads.push({ order: structuredClone(order), proof: structuredClone(proof) });
        return { status: "sent", reason: null };
      },
      flushOpenAIPurchases: async (limit?: number) => {
        s.effects.flushLimits.push(limit);
        await s.flushHook?.();
        return { configured: true, selected: 0, sent: 0, pending: 0, rejected: 0, skipped: 0, errors: 0, expired: 0, optOut: 0 };
      },
    },
    "@/lib/google-ads/purchase": {
      safeRecordVerifiedGooglePurchase: async (order: LocalOrder, proof: { provider: string; paymentId: string }) => {
        assert(["paid", "shipped"].includes(order.status));
        if (proof.provider === "tagada") assert(s.effects.reads.length >= 2);
        s.effects.googleReceipts.push({ order: structuredClone(order), proof: structuredClone(proof) });
      },
    },
    "@/lib/finance/reconciliation": {
      runFinanceReconciliation: async () => {
        s.effects.cronReconciliations++;
        if (s.reconcileReject) throw new Error("offline_fixture_finance_failure");
        return { fixture: true };
      },
    },
  };
  mocks["./store"] = mocks["@/lib/finance/store"];
  if (actualFinance) delete mocks["@/lib/finance/record"];
  const sources: Record<string, string> = {
    "@/lib/tagada/verify-payment": "lib/tagada/verify-payment.ts",
    "@/lib/tagada/server": "lib/tagada/server.ts",
    "@/lib/finance/webhook-verify": "lib/finance/webhook-verify.ts",
    "@/lib/payments/btcpay-verify": "lib/payments/btcpay-verify.ts",
    "@/lib/finance/record": "lib/finance/record.ts",
    "./sanitize": "lib/finance/sanitize.ts",
    "@/lib/cron/auth": "lib/cron/auth.ts",
    card: "app/api/checkout/card/route.ts",
    webhook: "app/api/tagada-webhook/route.ts",
    bitcoin: "app/api/btcpay-webhook/route.ts",
    cron: "app/api/cron/finance-reconcile/route.ts",
  };
  function load(id: string): Record<string, unknown> {
    if (mocks[id]) return mocks[id];
    const cached = modules.get(id);
    if (cached) return cached;
    const source = sources[id];
    assert(source, `Offline loader rejected unallowlisted dependency: ${id}`);
    const filename = resolve(ROOT, source);
    const compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
      fileName: filename,
    }).outputText;
    const output: Record<string, unknown> = {};
    modules.set(id, output);
    const run = new Script(`(function(require, module, exports) {\n${compiled}\n})`, { filename })
      .runInContext(context) as (require: typeof load, module: { exports: Record<string, unknown> }, exports: Record<string, unknown>) => void;
    const loadedModule = { exports: output };
    run(load, loadedModule, output);
    return loadedModule.exports;
  }
  return {
    card: load("card") as Route, webhook: load("webhook") as Route,
    bitcoin: load("bitcoin") as Route, cron: load("cron") as CronRoute,
    finance: load("@/lib/finance/record") as FinanceModule,
  };
}

function financeOrder(status: OrderStatus = "paid"): Order {
  return {
    ...localFixture, status,
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    email: "fixture@example.invalid",
    shipping: { firstName: "Fixture", lastName: "Only", address: "Fixture", city: "Fixture", state: "AZ", zip: "00000", country: "US" },
    items: [], subtotal: 59.99, discountCode: null, discountAmount: 0, taxRate: 0, tax: 0, shippingCost: 0,
    invoiceCreatedAt: null, paidAt: null, shippedAt: null, trackingNumber: null, trackingCarrier: null,
    emailSent: false, emailError: null, customerEmailSent: false, customerEmailError: null,
    feedbackEmailSent: false, trackingEmailSent: false, trackingSavedAt: null, deliveryFollowupSent: false,
    stockDecremented: true, attribution: null,
  };
}

function request(body: unknown, raw = false): Request {
  return new Request("https://fixture.invalid/api/checkout/card", {
    method: "POST", body: raw ? String(body) : JSON.stringify(body), headers: { "content-type": "application/json" },
  });
}
function signedRequest(event: unknown, signature: "valid" | "bad" | "missing" = "valid", raw = false): Request {
  const body = raw ? String(event) : JSON.stringify(event);
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (signature !== "missing") headers["x-tagadapay-signature"] = signature === "bad" ? "sha256=00" :
    `sha256=${crypto.createHmac("sha256", FIXTURE_SECRET).update(body, "utf8").digest("hex")}`;
  return new Request("https://fixture.invalid/api/tagada-webhook", { method: "POST", body, headers });
}
function signedBitcoinRequest(event: unknown, signature: "valid" | "bad" | "missing" = "valid", raw = false): Request {
  const body = raw ? String(event) : JSON.stringify(event);
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (signature !== "missing") headers["btcpay-sig"] = signature === "bad" ? "sha256=00" :
    `sha256=${crypto.createHmac("sha256", FIXTURE_SECRET).update(body, "utf8").digest("hex")}`;
  return new Request("https://fixture.invalid/api/btcpay-webhook", { method: "POST", body, headers });
}
function noSale(s: State) {
  assert.deepEqual(s.effects.fulfillment, [], "unverified evidence must not invoke fulfillment");
  assert.deepEqual(s.effects.finance, [], "unverified evidence must not record a sale");
  assert.deepEqual(s.effects.analytics, [], "unverified evidence must not track a purchase");
  assert.deepEqual(s.effects.ads, [], "unverified evidence must not enqueue or send an OpenAI purchase");
  assert.equal(s.orders.get("psl_fixture")?.status, "pending", "pending order remains pending");
  assert.equal(s.orders.get("psl_fixture")?.invoiceId, "checkout_fixture", "checkout binding is unchanged");
}
async function test(name: string, run: (s: State, routes: ReturnType<typeof harness>) => Promise<void>) {
  const s = state();
  activeState = s;
  try {
    await run(s, harness(s));
    assert.deepEqual(s.effects.googleReceipts, s.effects.ads,
      "Google receipts must follow exactly the same strictly verified payment hooks, including all rejection paths");
    if (s.effects.finance.length === 0) {
      assert.deepEqual(s.effects.ads, [], "early or unverified order state must not trigger Ads delivery");
    }
    assert.deepEqual(s.effects.forbidden, [], "test attempted a request outside its GET fixture allowlist");
    cases++;
  } catch (error) {
    throw new Error(`${name}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  } finally { activeState = undefined; }
}

async function main() {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = fixtureFetch;
  try {
    await test("disabled card configuration", async (s, routes) => {
      s.configured = false;
      assert.equal((await routes.card.POST(request(browserBody))).status, 503);
      noSale(s); assert.equal(s.effects.reads.length, 0);
    });
    for (const malformed of ["{", "null", "[]", '"string"', "123"]) {
      await test(`malformed browser JSON ${malformed}`, async (s, routes) => {
        assert.equal((await routes.card.POST(request(malformed, true))).status, 400);
        noSale(s); assert.equal(s.effects.reads.length, 0);
      });
    }
    await test("missing order", async (s, routes) => {
      assert.equal((await routes.card.POST(request({ paymentId: "pay_fixture" }))).status, 400); noSale(s);
    });
    await test("unknown local order", async (s, routes) => {
      assert.equal((await routes.card.POST(request({ ...browserBody, orderId: "psl_unknown" }))).status, 404); noSale(s);
    });
    for (const body of [{ orderId: "psl_fixture" }, { orderId: "psl_fixture", checkoutSessionId: "ch_fixture" },
      { ...browserBody, paymentId: 123 }, { ...browserBody, paymentId: "forged" }]) {
      await test("missing or malformed provider reference", async (s, routes) => {
        assert.equal((await routes.card.POST(request(body))).status, 409); noSale(s); assert.equal(s.effects.reads.length, 0);
      });
    }
    for (const method of ["bitcoin", null] as const) {
      await test(`wrong local payment method ${method}`, async (s, routes) => {
        s.orders.get("psl_fixture")!.paymentMethod = method;
        assert.equal((await routes.card.POST(request(browserBody))).status, 409); noSale(s); assert.equal(s.effects.reads.length, 0);
      });
    }
    const mismatches: Array<[string, (s: State) => void]> = [
      ["different payment store", (s) => { s.payment.storeId = "store_other"; }],
      ["different provider store", (s) => { s.providerOrder.storeId = "store_other"; }],
      ["different session store", (s) => { s.providerOrder.checkoutSession.storeId = "store_other"; }],
      ["different checkout token", (s) => { s.providerOrder.checkoutSession.checkoutToken = "checkout_other"; }],
      ["different session", (s) => { s.providerOrder.checkoutSession.id = "ch_other"; }],
      ["different provider payment ID", (s) => { s.payment.id = "pay_other"; }],
      ["different provider order ID", (s) => { s.providerOrder.id = "order_other"; }],
      ["different amount", (s) => { s.payment.amount = 5998; }],
      ["different order total", (s) => { s.providerOrder.paidAmount = 6000; }],
      ["different summary total", (s) => { s.providerOrder.summaries[0].totalAmount = 5998; }],
      ["different currency", (s) => { s.payment.currency = "EUR"; }],
      ["draft provider order", (s) => { s.providerOrder.draft = true; }],
      ["test transaction", (s) => { s.payment.transactions[0].isTest = true; }],
      ["missing charge", (s) => { s.payment.transactions = []; }],
      ["refunded payment", (s) => { Object.assign(s.payment, { refundedAmount: 5999 }); }],
      ["unknown action object", (s) => { Object.assign(s.payment, { requireAction: { type: "redirect" } }); }],
      ["unknown action boolean", (s) => { Object.assign(s.payment, { requireAction: true }); }],
    ];
    for (const [name, alter] of mismatches) {
      await test(name, async (s, routes) => {
        alter(s); assert.equal((await routes.card.POST(request(browserBody))).status, 409); noSale(s);
        assert(s.effects.reads.length >= 2, "actual SDK payment and order GETs are required");
      });
    }
    await test("authorization is not capture", async (s, routes) => {
      s.payment.status = "authorized"; s.payment.subStatus = "authorized";
      const response = await routes.card.POST(request(browserBody));
      assert.equal(response.status, 202); assert.equal((await response.json()).pendingConfirmation, true); noSale(s);
    });
    for (const status of ["pending", "authorized"]) {
      await test(`retained redirect on ${status} does not prove capture`, async (s, routes) => {
        s.payment.status = status; Object.assign(s.payment, { requireAction: "redirect" });
        const response = await routes.card.POST(request(browserBody));
        assert.equal(response.status, 202); assert.equal((await response.json()).pendingConfirmation, true); noSale(s);
      });
    }
    for (const route of ["card", "webhook"] as const) {
      await test(`${route} final successful charge accepts retained 3DS redirect`, async (s, routes) => {
        Object.assign(s.payment, { requireAction: "redirect" });
        assert.equal((await routes[route].POST(route === "card" ? request(browserBody) : signedRequest(paidEvent))).status, 200);
        assert.equal(s.effects.settled.length, 1); assert.equal(s.effects.finance.length, 1);
      });
    }
    await test("provider lookup failure permits confirmation retry", async (s, routes) => {
      s.providerStatus = 404;
      const response = await routes.card.POST(request(browserBody));
      assert.equal(response.status, 202); assert.equal((await response.json()).pendingConfirmation, true); noSale(s);
    });
    await test("legitimate browser purchase verified once and reference preserved", async (s, routes) => {
      assert.equal((await routes.card.POST(request(browserBody))).status, 200);
      assert.deepEqual(s.effects.fulfillment, [{ orderId: "psl_fixture", invoiceId: "checkout_fixture" }]);
      assert.equal(s.effects.finance.length, 1);
      assert.equal(s.effects.finance[0].options.providerPaymentId, "pay_fixture");
      assert.equal(s.effects.ads.length, 1, "verified card POST triggers Ads once");
      assert.deepEqual(s.effects.ads[0].proof, { provider: "tagada", paymentId: "pay_fixture" });
      assert.equal(s.effects.ads[0].order.orderId, "psl_fixture");
      assert.equal(s.effects.ads[0].order.status, "paid");
      assert.deepEqual(s.effects.bindings.map(({ paymentMethod, total, currency }) => ({ paymentMethod, total, currency })),
        [{ paymentMethod: "card", total: 59.99, currency: "USD" }]);
      assert.equal(s.effects.settled.length, 1);
      assert.equal(s.orders.get("psl_fixture")!.invoiceId, "checkout_fixture");
      assert.equal((await routes.card.POST(request({ ...browserBody, paymentId: "forged" }))).status, 200);
      assert.equal(s.effects.fulfillment.length, 1); assert.equal(s.effects.finance.length, 1);
      assert.equal(s.effects.ads.length, 1, "unverified browser alreadyPaid shortcut does not enqueue another purchase");
      assert.equal(s.orders.get("psl_fixture")!.invoiceId, "checkout_fixture");
    });
    for (const status of ["paid", "shipped"]) {
      await test(`browser ${status} cannot refulfill or downgrade reference`, async (s, routes) => {
        s.orders.get("psl_fixture")!.status = status;
        assert.equal((await routes.card.POST(request({ ...browserBody, paymentId: "forged" }))).status, 200);
        assert.deepEqual(s.effects.fulfillment, []); assert.deepEqual(s.effects.finance, []);
        assert.equal(s.orders.get("psl_fixture")!.status, status); assert.equal(s.orders.get("psl_fixture")!.invoiceId, "checkout_fixture");
      });
    }
    for (const status of ["failed", "cancelled"]) {
      await test(`browser ${status} cannot revive`, async (s, routes) => {
        s.orders.get("psl_fixture")!.status = status;
        assert.equal((await routes.card.POST(request(browserBody))).status, 409);
        assert.deepEqual(s.effects.fulfillment, []); assert.deepEqual(s.effects.finance, []);
        assert.equal(s.orders.get("psl_fixture")!.status, status);
      });
    }
    await test("fulfillment failure records no sale", async (s, routes) => {
      s.fulfillmentOk = false;
      assert.equal((await routes.card.POST(request(browserBody))).status, 500);
      assert.equal(s.effects.fulfillment.length, 1); assert.equal(s.effects.finance.length, 0);
    });
    const races: Array<[string, (order: LocalOrder) => void]> = [
      ["cancelled", (order) => { order.status = "cancelled"; }],
      ["failed", (order) => { order.status = "failed"; }],
      ["checkout binding changed", (order) => { order.invoiceId = "checkout_changed"; }],
      ["payment method changed", (order) => { order.paymentMethod = "bitcoin"; }],
      ["total changed", (order) => { order.total = 60; }],
      ["currency changed", (order) => { order.currency = "EUR"; }],
    ];
    for (const [name, alter] of races) {
      for (const route of ["card", "webhook"] as const) {
        await test(`${route} passes snapshot to guard after ${name} during provider read`, async (s, routes) => {
          s.providerHook = () => { alter(s.orders.get("psl_fixture")!); };
          const response = await routes[route].POST(route === "card" ? request(browserBody) : signedRequest(paidEvent));
          assert([409, 500].includes(response.status), "late binding/state changes must deny settlement");
          assert.equal(s.effects.settled.length, 0); assert.equal(s.effects.finance.length, 0);
          assert.equal(s.effects.analytics.length, 0);
          assert.equal(s.effects.bindings.length, 1, "the verified snapshot reaches guarded settlement");
        });
      }
    }
    await test("shipped during provider read remains shipped", async (s, routes) => {
      s.providerHook = () => { s.orders.get("psl_fixture")!.status = "shipped"; };
      assert.equal((await routes.card.POST(request(browserBody))).status, 200);
      assert.equal(s.orders.get("psl_fixture")!.status, "shipped");
      assert.equal(s.effects.settled.length, 0);
    });
    for (const [name, alter] of races.filter(([name]) => !["cancelled", "failed"].includes(name))) {
      for (const route of ["card", "webhook"] as const) {
        await test(`${route} changed ${name} after fulfillment cannot emit conversion`, async (s, routes) => {
          s.afterFulfillmentHook = alter;
          assert.equal((await routes[route].POST(route === "card" ? request(browserBody) : signedRequest(paidEvent))).status, 200);
          assert.equal(s.effects.settled.length, 1, "fixture settlement succeeded before later snapshot change");
          assert.deepEqual(s.effects.ads, [], "postfulfillment snapshot must retain all verified binding fields");
        });
      }
    }
    await test("webhook missing secret", async (s) => {
      s.secret = undefined;
      assert.equal((await harness(s).webhook.POST(signedRequest(paidEvent))).status, 503); noSale(s);
      assert.equal(s.effects.events.length, 0); assert.equal(s.effects.reads.length, 0);
    });
    for (const signature of ["missing", "bad"] as const) {
      await test(`webhook ${signature} signature`, async (s, routes) => {
        assert.equal((await routes.webhook.POST(signedRequest(paidEvent, signature))).status, 401); noSale(s);
        assert.equal(s.effects.events.length, 0); assert.equal(s.effects.reads.length, 0);
      });
    }
    for (const malformed of ["{", "null", "[]", '"string"']) {
      await test("Bitcoin malformed signed payload makes no reads or writes", async (s, routes) => {
        assert.equal((await routes.bitcoin.POST(signedBitcoinRequest(malformed, "valid", true))).status, 400);
        assert.deepEqual(s.effects.bitcoinReads, []); assert.deepEqual(s.effects.events, []); assert.deepEqual(s.effects.fulfillment, []);
      });
    }
    for (const malformed of ["{", "null", "[]", '"string"']) {
      await test("webhook malformed signed JSON", async (s, routes) => {
        assert.equal((await routes.webhook.POST(signedRequest(malformed, "valid", true))).status, 400); noSale(s);
      });
    }
    await test("signed metadata cannot associate a different local order", async (s, routes) => {
      s.orders.delete("psl_fixture");
      s.orders.set("psl_other", { ...localFixture, orderId: "psl_other", invoiceId: "checkout_other" });
      const event = { ...paidEvent, data: { ...paidEvent.data, metadata: { orderId: "psl_other" } } };
      assert.equal((await routes.webhook.POST(signedRequest(event))).status, 409);
      assert.deepEqual(s.effects.fulfillment, []); assert.deepEqual(s.effects.finance, []);
      assert.equal(s.orders.get("psl_other")!.status, "pending");
    });
    await test("webhook resolves correct order through authenticated checkout token despite metadata", async (s, routes) => {
      s.orders.set("psl_other", { ...localFixture, orderId: "psl_other", invoiceId: "checkout_other" });
      const event = { ...paidEvent, data: { ...paidEvent.data, metadata: { orderId: "psl_other" } } };
      assert.equal((await routes.webhook.POST(signedRequest(event))).status, 200);
      assert.deepEqual(s.effects.fulfillment, [{ orderId: "psl_fixture", invoiceId: "checkout_fixture" }]);
      assert.equal(s.effects.finance[0].order.orderId, "psl_fixture");
      assert.equal(s.effects.ads.length, 1);
      assert.deepEqual(s.effects.ads[0].proof, { provider: "tagada", paymentId: "pay_fixture" });
      assert.equal(s.effects.ads[0].order.orderId, "psl_fixture", "Ads uses provider-bound local order rather than signed metadata hint");
      assert.equal(s.orders.get("psl_other")!.status, "pending");
      assert.equal(s.orders.get("psl_fixture")!.invoiceId, "checkout_fixture");
    });
    await test("signed webhook captured mismatch cannot record a sale", async (s, routes) => {
      s.payment.amount = 5998;
      assert.equal((await routes.webhook.POST(signedRequest(paidEvent))).status, 409); noSale(s);
      assert.equal(s.effects.claims.length, 0);
    });
    await test("signed authorization webhook requests a retry without fulfillment", async (s, routes) => {
      s.payment.status = "authorized"; s.payment.subStatus = "authorized";
      assert.equal((await routes.webhook.POST(signedRequest(paidEvent))).status, 503); noSale(s);
    });
    await test("signed metadata only cannot prove paid", async (s, routes) => {
      const event = { id: "evt_metadata", type: "order/paid", data: { metadata: { orderId: "psl_fixture" } } };
      assert.equal((await routes.webhook.POST(signedRequest(event))).status, 409); noSale(s);
    });
    await test("failed signed attempt cannot cancel unrelated reservation", async (s, routes) => {
      const event = { ...paidEvent, type: "payment/failed", data: { ...paidEvent.data, metadata: { orderId: "psl_fixture" } } };
      assert.equal((await routes.webhook.POST(signedRequest(event))).status, 200); noSale(s);
      assert.equal(s.effects.reads.length, 0);
    });
    for (const status of ["failed", "cancelled"]) {
      await test(`signed paid event cannot revive ${status}`, async (s, routes) => {
        s.orders.get("psl_fixture")!.status = status;
        assert.equal((await routes.webhook.POST(signedRequest(paidEvent))).status, 409);
        assert.deepEqual(s.effects.fulfillment, []); assert.deepEqual(s.effects.finance, []);
        assert.equal(s.orders.get("psl_fixture")!.status, status);
      });
    }
    for (const status of ["paid", "shipped"]) {
      await test(`webhook ${status} is verified before recording finance`, async (s, routes) => {
        s.orders.get("psl_fixture")!.status = status; s.payment.amount = 5998;
        assert.equal((await routes.webhook.POST(signedRequest(paidEvent))).status, 409);
        assert.deepEqual(s.effects.fulfillment, []); assert.deepEqual(s.effects.finance, []);
        assert.equal(s.orders.get("psl_fixture")!.status, status); assert.equal(s.effects.sent.length, 0);
      });
    }
    await test("legitimate signed webhook retry does not refulfill", async (s, routes) => {
      assert.equal((await routes.webhook.POST(signedRequest(paidEvent))).status, 200);
      assert.equal(s.effects.fulfillment.length, 1); assert.equal(s.effects.finance.length, 1);
      assert.equal(s.effects.settled.length, 1);
      assert.equal(s.effects.analytics.length, 1);
      assert.equal(s.effects.ads.length, 1);
      assert.deepEqual(s.effects.ads[0].proof, { provider: "tagada", paymentId: "pay_fixture" });
      assert.equal((await routes.webhook.POST(signedRequest(paidEvent))).status, 200);
      assert.equal(s.effects.fulfillment.length, 1); assert.equal(s.effects.analytics.length, 1);
      assert.equal(s.effects.ads.length, 2, "independently verified alreadyPaid webhook may resume durable delivery");
      assert(s.effects.ads.every((entry) => entry.order.status === "paid" && entry.proof.provider === "tagada" && entry.proof.paymentId === "pay_fixture"));
      assert.equal(s.orders.get("psl_fixture")!.invoiceId, "checkout_fixture");
      assert(s.effects.finance.every((entry) => entry.options.providerPaymentId === "pay_fixture"));
    });
    const bitcoinEvent = { deliveryId: "btc_evt_fixture", type: "InvoiceSettled", storeId: "store_fixture", invoiceId: "invoice_fixture", metadata: { orderId: "psl_fixture" } };
    const setBitcoinOrder = (s: State) => {
      const order = s.orders.get("psl_fixture")!;
      order.paymentMethod = "bitcoin"; order.invoiceId = "invoice_fixture";
    };
    for (const signature of ["missing", "bad"] as const) {
      await test(`Bitcoin ${signature} signature cannot deliver conversion`, async (s, routes) => {
        setBitcoinOrder(s);
        assert.equal((await routes.bitcoin.POST(signedBitcoinRequest(bitcoinEvent, signature))).status, 401);
        assert.deepEqual(s.effects.ads, []); assert.deepEqual(s.effects.fulfillment, []);
        assert.equal(s.effects.events.length, 0);
      });
    }
    await test("Bitcoin signed terminal invoice invokes exact conversion proof", async (s, routes) => {
      setBitcoinOrder(s);
      assert.equal((await routes.bitcoin.POST(signedBitcoinRequest(bitcoinEvent))).status, 200);
      assert.equal(s.effects.ads.length, 1);
      assert.deepEqual(s.effects.ads[0].proof, { provider: "btcpay", paymentId: "invoice_fixture" });
      assert.equal(s.effects.ads[0].order.invoiceId, "invoice_fixture");
      assert.equal((await routes.bitcoin.POST(signedBitcoinRequest(bitcoinEvent))).status, 200);
      assert.equal(s.effects.ads.length, 2, "signed settled redelivery can resume the durable queue");
      assert.equal(s.effects.analytics.length, 1, "redelivery retains existing Plausible behavior");
      assert.equal(s.effects.reads.length, 0, "signed Bitcoin evidence does not issue Tagada reads");
      assert.equal(s.effects.bitcoinReads.length, 2, "each delivery independently reads the exact authenticated Bitcoin invoice");
    });
    await test("Bitcoin callback metadata cannot select another order", async (s, routes) => {
      setBitcoinOrder(s);
      s.orders.set("psl_other", { ...localFixture, orderId: "psl_other", invoiceId: "other_invoice" });
      const event = { ...bitcoinEvent, metadata: { orderId: "psl_other" } };
      assert.equal((await routes.bitcoin.POST(signedBitcoinRequest(event))).status, 200);
      assert.equal(s.orders.get("psl_other")!.status, "pending");
      assert.equal(s.orders.get("psl_fixture")!.status, "paid");
      assert.equal(s.effects.events[0].pslOrderId, "psl_fixture");
      assert.equal(s.effects.finance[0].order.orderId, "psl_fixture");
    });
    const bitcoinMismatches: Array<[string, (value: State["bitcoinInvoice"]) => void]> = [
      ["wrong invoice", value => { value.id = "invoice_other"; }],
      ["wrong store", value => { value.storeId = "store_other"; }],
      ["wrong amount", value => { value.amount = "59.98"; }],
      ["underpaid", value => { value.paidAmount = "59.98"; }],
      ["wrong currency", value => { value.currency = "EUR"; }],
      ["wrong provider order", value => { value.metadata.orderId = "psl_other"; }],
      ["not settled", value => { value.status = "Processing"; }],
      ["manually marked", value => { value.additionalStatus = "Marked"; }],
      ["partial", value => { value.additionalStatus = "PaidPartial"; }],
    ];
    for (const [name, alter] of bitcoinMismatches) {
      await test(`Bitcoin ${name} cannot cause any local mutation`, async (s, routes) => {
        setBitcoinOrder(s); alter(s.bitcoinInvoice);
        assert.equal((await routes.bitcoin.POST(signedBitcoinRequest(bitcoinEvent))).status, 409);
        assert.deepEqual(s.effects.events, []); assert.deepEqual(s.effects.fulfillment, []); assert.deepEqual(s.effects.finance, []);
        assert.deepEqual(s.effects.failedUpdates, []); assert.equal(s.orders.get("psl_fixture")!.status, "pending");
      });
    }
    for (const [name, alter] of races) {
      await test(`Bitcoin ${name} during authenticated lookup cannot settle`, async (s, routes) => {
        setBitcoinOrder(s);
        s.bitcoinReadHook = () => {
          const current = s.orders.get("psl_fixture")!;
          if (name === "payment method changed") current.paymentMethod = "card"; else alter(current);
        };
        assert.equal((await routes.bitcoin.POST(signedBitcoinRequest(bitcoinEvent))).status, 503);
        assert.deepEqual(s.effects.settled, []); assert.deepEqual(s.effects.finance, []); assert.deepEqual(s.effects.ads, []);
        assert.deepEqual(s.effects.bindings, [{ paymentMethod: "bitcoin", total: 59.99, currency: "USD" }]);
      });
    }
    for (const [type, status, localStatus] of [["InvoiceExpired", "Expired", "cancelled"], ["InvoiceInvalid", "Invalid", "failed"]]) {
      await test(`Bitcoin ${type} only changes its independently bound pending invoice`, async (s, routes) => {
        setBitcoinOrder(s); s.bitcoinInvoice.status = status;
        assert.equal((await routes.bitcoin.POST(signedBitcoinRequest({ ...bitcoinEvent, type }))).status, 200);
        assert.equal(s.orders.get("psl_fixture")!.status, localStatus); assert.deepEqual(s.effects.failedUpdates, ["psl_fixture"]);
        assert.deepEqual(s.effects.fulfillment, []); assert.deepEqual(s.effects.finance, []);
      });
      await test(`Bitcoin stale ${type} cannot cancel a provider-settled invoice`, async (s, routes) => {
        setBitcoinOrder(s);
        assert.equal((await routes.bitcoin.POST(signedBitcoinRequest({ ...bitcoinEvent, type }))).status, 409);
        assert.deepEqual(s.effects.events, []); assert.deepEqual(s.effects.failedUpdates, []);
        assert.equal(s.orders.get("psl_fixture")!.status, "pending");
      });
      await test(`Bitcoin ${type} lookup race cannot cancel a changed invoice`, async (s, routes) => {
        setBitcoinOrder(s); s.bitcoinInvoice.status = status;
        s.bitcoinReadHook = () => { s.orders.get("psl_fixture")!.invoiceId = "changed_invoice"; };
        assert.equal((await routes.bitcoin.POST(signedBitcoinRequest({ ...bitcoinEvent, type }))).status, 200);
        assert.deepEqual(s.effects.failedUpdates, []); assert.equal(s.orders.get("psl_fixture")!.status, "pending");
      });
    }
    for (const change of [
      { type: "InvoiceProcessing" }, { type: "InvoiceReceivedPayment" }, { storeId: "store_other" },
      { storeId: undefined }, { invoiceId: "invoice_other" }, { invoiceId: undefined },
    ]) {
      await test("Bitcoin nonterminal, wrong store or mismatched invoice cannot deliver conversion", async (s, routes) => {
        setBitcoinOrder(s);
        const expected = change.storeId === "store_other" || ("storeId" in change && !change.storeId) ||
          ("invoiceId" in change && !change.invoiceId) ? 409 : 200;
        assert.equal((await routes.bitcoin.POST(signedBitcoinRequest({ ...bitcoinEvent, ...change }))).status, expected);
        assert.deepEqual(s.effects.ads, []);
        assert.deepEqual(s.effects.fulfillment, []); assert.deepEqual(s.effects.finance, []); assert.deepEqual(s.effects.events, []);
      });
    }
    for (const [name, alter] of races.filter(([name]) => !["cancelled", "failed"].includes(name))) {
      await test(`Bitcoin changed ${name} after fulfillment cannot emit conversion`, async (s, routes) => {
        setBitcoinOrder(s); s.afterFulfillmentHook = name === "payment method changed" ? (order) => { order.paymentMethod = "card"; } : alter;
        assert.equal((await routes.bitcoin.POST(signedBitcoinRequest(bitcoinEvent))).status, 200);
        assert.deepEqual(s.effects.ads, []);
      });
    }
    await test("Bitcoin terminal invoice for local card order cannot deliver conversion", async (s, routes) => {
      s.orders.get("psl_fixture")!.invoiceId = "invoice_fixture";
      assert.equal((await routes.bitcoin.POST(signedBitcoinRequest(bitcoinEvent))).status, 409);
      assert.deepEqual(s.effects.ads, []);
      assert.deepEqual(s.effects.fulfillment, []); assert.deepEqual(s.effects.finance, []);
    });
    await test("Bitcoin missing configured store and undefined event store cannot deliver conversion", async (s) => {
      setBitcoinOrder(s); s.btcpayStoreId = undefined;
      const routes = harness(s);
      assert.equal((await routes.bitcoin.POST(signedBitcoinRequest({ ...bitcoinEvent, storeId: undefined }))).status, 503);
      assert.deepEqual(s.effects.ads, [], "undefined store values must never count as configured-store proof");
    });
    await test("Bitcoin original wrong method cannot be upgraded into conversion proof", async (s, routes) => {
      s.orders.get("psl_fixture")!.invoiceId = "invoice_fixture";
      s.afterFulfillmentHook = (order) => { order.paymentMethod = "bitcoin"; };
      assert.equal((await routes.bitcoin.POST(signedBitcoinRequest(bitcoinEvent))).status, 409);
      assert.deepEqual(s.effects.ads, [], "both original and paid order must retain Bitcoin payment method");
    });
    const unauthorizedCronHeaders: Array<Record<string, string>> = [{}, { authorization: "Bearer wrong_fixture" }, { "x-cron-secret": "wrong_fixture" }];
    for (const headers of unauthorizedCronHeaders) {
      await test("unauthorized finance cron cannot flush conversion queue", async (s, routes) => {
        assert.equal((await routes.cron.GET(new Request("https://fixture.invalid/api/cron/finance-reconcile", { headers }))).status, 401);
        assert.deepEqual(s.effects.flushLimits, []); assert.equal(s.effects.cronReconciliations, 0);
      });
    }
    const authorizedCronHeaders: Array<Record<string, string>> = [{ authorization: "Bearer offline_fixture_cron_secret" }, { "x-cron-secret": "offline_fixture_cron_secret" }];
    for (const headers of authorizedCronHeaders) {
      await test("authorized finance cron invokes existing bounded conversion helper", async (s, routes) => {
        assert.equal(routes.cron.maxDuration, 60);
        assert.equal((await routes.cron.GET(new Request("https://fixture.invalid/api/cron/finance-reconcile", { headers }))).status, 200);
        assert.deepEqual(s.effects.flushLimits, [undefined], "route uses helper's production default bound of three");
        assert.equal(s.effects.cronReconciliations, 1);
      });
    }
    await test("failed finance cron awaits delayed conversion flush and preserves500", async (s, routes) => {
      s.reconcileReject = true;
      let release: (() => void) | undefined;
      s.flushHook = () => new Promise<void>((resolve) => { release = resolve; });
      let returned = false;
      const responsePromise = routes.cron.GET(new Request("https://fixture.invalid/api/cron/finance-reconcile", {
        headers: { authorization: "Bearer offline_fixture_cron_secret" },
      })).then((response) => { returned = true; return response; });
      await new Promise<void>((resolve) => setImmediate(resolve));
      assert.equal(s.effects.cronReconciliations, 1);
      assert.deepEqual(s.effects.flushLimits, [undefined]);
      assert(release, "delayed fixture flush has started");
      assert.equal(returned, false, "finance rejection must not let cron return while conversion work still runs");
      release();
      const response = await responsePromise;
      assert.equal(response.status, 500, "waiting for conversion work preserves the finance failure status");
      assert.equal((await response.json()).ok, false);
    });
    await test("actual finance card backfill does not invent checkout token as payment ID", async (s) => {
      const finance = harness(s, true).finance;
      await finance.ensureFinanceTransactionForPaidOrder(financeOrder());
      assert.equal(s.effects.upserts.length, 1);
      assert.equal(s.effects.upserts[0].providerPaymentId, null);
      assert.equal(s.effects.ledger.length, 1);
    });
    await test("actual finance preserves supplied verified payment, then null on later backfill", async (s) => {
      const finance = harness(s, true).finance;
      await finance.ensureFinanceTransactionForPaidOrder(financeOrder(), { provider: "tagada", providerPaymentId: "pay_fixture" });
      await finance.ensureFinanceTransactionForPaidOrder(financeOrder());
      assert.equal(s.effects.upserts[0].providerPaymentId, "pay_fixture");
      assert.equal(s.effects.upserts[1].providerPaymentId, null, "a null upsert cannot replace the verified payment through SQL COALESCE");
    });
    await test("actual finance does not invent evidence from legacy card invoice", async (s) => {
      await harness(s, true).finance.ensureFinanceTransactionForPaidOrder({ ...financeOrder(), invoiceId: "pay_legacy" });
      assert.equal(s.effects.upserts[0].providerPaymentId, null);
    });
    await test("actual finance retains existing Bitcoin invoice behavior", async (s) => {
      await harness(s, true).finance.ensureFinanceTransactionForPaidOrder({ ...financeOrder(), paymentMethod: "bitcoin", invoiceId: "bitcoin_fixture_invoice" });
      assert.equal(s.effects.upserts[0].providerPaymentId, "bitcoin_fixture_invoice");
    });
    for (const status of ["pending", "failed", "cancelled"] as const) {
      await test(`actual finance does not record ${status} as a sale`, async (s) => {
        await harness(s, true).finance.ensureFinanceTransactionForPaidOrder(financeOrder(status));
        assert.deepEqual(s.effects.upserts, []); assert.deepEqual(s.effects.ledger, []);
      });
    }
    console.log(`Card routes: ${cases} fully offline control-flow regressions passed (actual verifier, SDK, and HMAC; no external effects).`);
  } finally { globalThis.fetch = previousFetch; }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
