/** Offline only: production receipt service/verifier/routes with in-memory persistence and provider reads. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createContext, Script } from "node:vm";
import ts from "typescript";
import { NextResponse } from "next/server";
import {
  createGooglePurchaseService, createGooglePurchaseSqlStore, GOOGLE_PURCHASE_MAX_AGE_MS,
  isGooglePurchaseOrderId, type GooglePurchaseOrder, type GooglePurchaseMarker,
  type GooglePurchaseStore,
} from "../lib/google-ads/purchase";
import type { GoogleAdsConfig } from "../lib/google-ads/config";
import type { getSql } from "../lib/db/sql";
import { PRIVACY_CONSENT_VERSION, UNKNOWN_PRIVACY_CONSENT, type PrivacyConsentBinding } from "../lib/privacy/types";

const NOW = Date.parse("2026-10-05T12:00:00.000Z");
const CONFIG = { tagId: "AW-123456789", conversionLabel: "fixture_label", sendTo: "AW-123456789/fixture_label" };
const PROOF = { provider: "tagada" as const, paymentId: "pay_fixture" };
const BINDING: PrivacyConsentBinding = { digest: "a".repeat(64), revision: 1, version: PRIVACY_CONSENT_VERSION };
const ORDER: GooglePurchaseOrder = {
  orderId: "psl_google_fixture", status: "paid", paidAt: new Date(NOW - 1000).toISOString(),
  total: 59.99, currency: "USD", invoiceId: "checkout_fixture", paymentMethod: "card",
  attribution: { googleAdsMeasurementConsent: true, privacyConsent: BINDING } as GooglePurchaseOrder["attribution"],
};
const PAYMENT = {
  id: "pay_fixture", orderId: "order_fixture", storeId: "store_fixture", accountId: "acc_fixture",
  amount: 5999, currency: "USD", status: "succeeded", subStatus: "approved", refundedAmount: 0,
  transactions: [{
    id: "txn_fixture", paymentId: "pay_fixture", storeId: "store_fixture", accountId: "acc_fixture",
    type: "purchase", status: "succeeded", result: "approved", isTest: false, draft: false,
    amount: 5999, currency: "USD",
  }],
};
const PROVIDER_ORDER = {
  id: "order_fixture", storeId: "store_fixture", accountId: "acc_fixture", status: "paid",
  currency: "USD", paidAmount: 5999, checkoutSessionId: "ch_fixture", draft: false,
  checkoutSession: { id: "ch_fixture", storeId: "store_fixture", checkoutToken: "checkout_fixture", draft: false },
  summaries: [{ orderId: "order_fixture", checkoutSessionId: "ch_fixture", totalAmount: 5999, currency: "USD" }],
  payments: [PAYMENT],
};

let checks = 0;
function check(actual: unknown, expected: unknown, message?: string) {
  assert.deepEqual(actual, expected, message); checks++;
}

function fixture() {
  const state = {
    order: structuredClone(ORDER), marker: null as GooglePurchaseMarker | null,
    config: CONFIG as GoogleAdsConfig | null, now: NOW, excluded: false,
    payment: structuredClone(PAYMENT), providerOrder: structuredClone(PROVIDER_ORDER),
    readCalls: 0, saves: 0, verifies: 0, confirms: 0,
    consentGranted: true, consentRevision: 1,
    readHook: undefined as (() => void) | undefined,
  };
  const current = (order: GooglePurchaseOrder) => !state.excluded &&
    state.order.attribution?.googleAdsMeasurementConsent === true &&
    ["paid", "shipped"].includes(state.order.status) &&
    ["orderId", "paidAt", "total", "currency", "invoiceId", "paymentMethod"]
      .every(key => state.order[key as keyof GooglePurchaseOrder] === order[key as keyof GooglePurchaseOrder]);
  const store: GooglePurchaseStore = {
    async saveFirst(order, marker) {
      state.saves++;
      if (state.marker || !current(order)) return false;
      state.marker = structuredClone(marker); return true;
    },
    async read(orderId) {
      state.readCalls++;
      return orderId === state.order.orderId && !state.excluded
        ? { order: structuredClone(state.order), marker: structuredClone(state.marker) } : null;
    },
    async confirmCurrent(order, marker) {
      state.confirms++;
      return current(order) && JSON.stringify(state.marker) === JSON.stringify(marker);
    },
  };
  const dependencies = {
    getConfig: () => state.config,
    getStore: () => store,
    nowMs: () => state.now,
    isCurrentMeasurementConsent: async (binding: PrivacyConsentBinding, provider: "google") =>
      provider === "google" && state.consentGranted && binding.digest === BINDING.digest &&
      binding.version === BINDING.version && binding.revision === state.consentRevision,
    tagadaReads: {
      storeId: "store_fixture",
      async retrievePayment() {
        state.verifies++; state.readHook?.();
        return structuredClone(state.payment);
      },
      async retrieveOrder() { state.verifies++; return { order: structuredClone(state.providerOrder) }; },
    },
    providerTimeoutMs: 30,
  };
  return { state, store, dependencies, service: createGooglePurchaseService(dependencies) };
}

async function prepared() {
  const f = fixture();
  await f.service.safeRecordVerifiedGooglePurchase(f.state.order, PROOF);
  assert(f.state.marker); return f;
}

async function sqlContract() {
  const calls: { text: string; values: unknown[] }[] = [];
  const sql = (async (parts: TemplateStringsArray, ...values: unknown[]) => {
    calls.push({ text: parts.join("?"), values }); return [];
  }) as unknown as ReturnType<typeof getSql>;
  const store = createGooglePurchaseSqlStore(sql);
  const f = await prepared();
  await store.saveFirst(ORDER, f.state.marker!, NOW);
  await store.read(ORDER.orderId);
  await store.confirmCurrent(ORDER, f.state.marker!, NOW);
  check(calls.length, 3);
  for (const call of calls) {
    assert.match(call.text, /reporting_excluded = true/);
    assert.match(call.text, /NOT EXISTS/);
    assert.match(call.text, /googleAdsMeasurementConsent' = 'true'::jsonb/);
    assert.match(call.text, /status IN \('paid', 'shipped'\)/);
    assert.doesNotMatch(call.text, /\b(?:CREATE|ALTER|DELETE)\b|\bemail\b|\bshipping\b/i);
    assert(call.values.includes(ORDER.orderId));
    checks += 6;
  }
  assert.match(calls[0].text, /NOT \(o.attribution \? 'googleAdsVerifiedPurchase'\)/);
  assert.match(calls[0].text, /SET attribution = jsonb_set/);
  assert.doesNotMatch(calls[0].text, /SET (?:invoice_id|total|status|paid_at)/);
  for (const index of [0, 2]) {
    assert.match(calls[index].text, /o.payment_method = \? AND o.invoice_id = \?/);
    assert.match(calls[index].text, /o.total = \?::numeric AND o.currency = \?/);
    assert.match(calls[index].text, /date_trunc\('milliseconds', o.paid_at\) = \?::timestamptz/);
    assert.match(calls[index].text, /o.paid_at >=/);
    assert.match(calls[index].text, /o.paid_at <=/);
    checks += 5;
  }
  assert.match(calls[2].text, /googleAdsVerifiedPurchase' = \?::jsonb/);
  checks += 4;
}

async function routeChecks() {
  const filename = resolve("app/api/google-ads/purchase/route.ts");
  const code = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: filename,
  }).outputText;
  let lookups = 0;
  let throws = false;
  let consentGranted = true;
  const receipt = { transactionId: "opaque_fixture", value: 59.99, currency: "USD" };
  const mocks: Record<string, unknown> = {
    "next/server": { NextResponse },
    "@/lib/google-ads/purchase": {
      isGooglePurchaseOrderId,
      getVerifiedGooglePurchaseReceipt: async (_id: string, binding: PrivacyConsentBinding) => {
        check(binding, BINDING); lookups++; if (throws) throw new Error("PRIVATE_PROVIDER_SECRET"); return receipt;
      },
    },
    "@/lib/privacy/server": { readRequestPrivacyConsent: async () => ({ binding: consentGranted ? BINDING : null,
      consent: { ...UNKNOWN_PRIVACY_CONSENT, choice: "saved", measurement: consentGranted,
        capabilities: { ...UNKNOWN_PRIVACY_CONSENT.capabilities, googleMeasurement: true } } }) },
  };
  const exports: Record<string, unknown> = {};
  const loader = (id: string) => { assert(id in mocks, `Unmocked route dependency: ${id}`); return mocks[id]; };
  new Script(`(function(require,exports){${code}\n})`).runInContext(createContext({ URL }))(loader, exports);
  const GET = exports.GET as (request: Request) => Promise<Response>;
  for (const path of ["", "?orderId=", "?orderId=bad", "?orderId=psl_%3Cscript%3E", `?orderId=psl_${"x".repeat(101)}`]) {
    check(await (await GET(new Request(`https://fixture.invalid/api/google-ads/purchase${path}`))).json(), { purchase: null });
  }
  const blocked = await GET(new Request(`https://fixture.invalid/api/google-ads/purchase?orderId=${ORDER.orderId}`, { headers: { "Sec-GPC": "1" } }));
  check(await blocked.json(), { purchase: null }); check(lookups, 0);
  check(blocked.headers.get("Vary"), "Cookie, Sec-GPC");
  assert.match(blocked.headers.get("Cache-Control")!, /no-store/); checks++;
  const response = await GET(new Request(`https://fixture.invalid/api/google-ads/purchase?orderId=${ORDER.orderId}`));
  check(await response.json(), { purchase: receipt }); check(lookups, 1);
  consentGranted = false;
  check(await (await GET(new Request(`https://fixture.invalid/api/google-ads/purchase?orderId=${ORDER.orderId}`))).json(), { purchase: null });
  check(lookups, 1);
  consentGranted = true;
  assert.match(response.headers.get("Cache-Control")!, /no-store/); checks++;
  throws = true;
  check(await (await GET(new Request(`https://fixture.invalid/api/google-ads/purchase?orderId=${ORDER.orderId}`))).json(), { purchase: null });
}

async function main() {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("Offline test blocked network access"); };
  try {
    {
      const f = await prepared();
      check(await f.service.getVerifiedGooglePurchaseReceipt(ORDER.orderId), null, "order ID alone cannot release an advertising receipt");
      for (const binding of [{ ...BINDING, digest: "b".repeat(64) }, { ...BINDING, revision: 2 },
        { ...BINDING, version: PRIVACY_CONSENT_VERSION - 1 }]) {
        check(await f.service.getVerifiedGooglePurchaseReceipt(ORDER.orderId, binding), null);
      }
      check(f.state.verifies, 0, "wrong browser consent receipt stops before provider reads");
      f.state.consentGranted = false;
      check(await f.service.getVerifiedGooglePurchaseReceipt(ORDER.orderId, BINDING), null);
      f.state.consentGranted = true; f.state.consentRevision++;
      check(await f.service.getVerifiedGooglePurchaseReceipt(ORDER.orderId, BINDING), null, "regrant cannot revive the earlier order binding");
    }
    {
      const f = fixture(); delete f.state.order.attribution!.privacyConsent;
      await f.service.safeRecordVerifiedGooglePurchase(f.state.order, PROOF);
      check(f.state.saves, 0, "legacy client consent flag does not authorize a marker");
    }
    {
      const f = await prepared(); f.state.readHook = () => { f.state.consentGranted = false; };
      check(await f.service.getVerifiedGooglePurchaseReceipt(ORDER.orderId, BINDING), null,
        "withdrawal during external verification blocks the response");
    }
    {
      const f = await prepared();
      const service = createGooglePurchaseService({ ...f.dependencies, isCurrentMeasurementConsent: async () => { throw new Error("offline consent DB unavailable"); } });
      check(await service.getVerifiedGooglePurchaseReceipt(ORDER.orderId, BINDING), null);
      check(f.state.verifies, 0);
    }
    {
      const f = fixture(); f.state.config = null;
      await f.service.safeRecordVerifiedGooglePurchase(f.state.order, PROOF);
      check(await f.service.getVerifiedGooglePurchaseReceipt(ORDER.orderId, BINDING), null);
      check([f.state.saves, f.state.readCalls, f.state.verifies], [0, 0, 0]);
    }
    for (const patch of [
      { status: "pending" }, { status: "cancelled" }, { status: "failed" },
      { attribution: null }, { attribution: { googleAdsMeasurementConsent: false } },
      { attribution: { googleAdsMeasurementConsent: "true" } },
      { total: 0 }, { total: -1 }, { total: NaN }, { total: 59.991 }, { currency: "EUR" },
      { paidAt: null }, { paidAt: "nonsense" },
      { paidAt: new Date(NOW - GOOGLE_PURCHASE_MAX_AGE_MS - 1).toISOString() },
      { paidAt: new Date(NOW + 60001).toISOString() },
      { orderId: "not a public id" }, { invoiceId: "pay_legacy" }, { paymentMethod: "bitcoin" },
    ]) {
      const f = fixture(); Object.assign(f.state.order, patch);
      await f.service.safeRecordVerifiedGooglePurchase(f.state.order, PROOF);
      check(f.state.marker, null);
      check(await f.service.getVerifiedGooglePurchaseReceipt(f.state.order.orderId, BINDING), null);
      check(f.state.verifies, 0);
    }
    {
      const f = fixture();
      check(await f.service.getVerifiedGooglePurchaseReceipt(ORDER.orderId, BINDING), null, "legacy paid state without a marker is never converted");
      check(f.state.verifies, 0);
      await f.service.safeRecordVerifiedGooglePurchase(f.state.order, { provider: "tagada", paymentId: "checkout_fixture" });
      check(f.state.marker, null);
    }
    {
      const f = await prepared();
      check(f.state.verifies, 0, "verified fulfillment hook records locally without making another external request");
      const first = structuredClone(f.state.marker);
      await Promise.all(Array.from({ length: 5 }, () => f.service.safeRecordVerifiedGooglePurchase(f.state.order, PROOF)));
      await f.service.safeRecordVerifiedGooglePurchase(f.state.order, { ...PROOF, paymentId: "pay_changed" });
      check(f.state.marker, first, "duplicate notifications preserve the original marker and payment proof");
      const receipt = await f.service.getVerifiedGooglePurchaseReceipt(ORDER.orderId, BINDING);
      check(receipt, { transactionId: first!.transactionId, value: 59.99, currency: "USD" });
      check(Object.keys(receipt!).sort(), ["currency", "transactionId", "value"]);
      assert.match(receipt!.transactionId, /^psl_[a-f0-9]{48}$/); checks++;
      assert(!JSON.stringify(receipt).includes(ORDER.orderId)); checks++;
      check(f.state.verifies, 2);
      check(await f.service.getVerifiedGooglePurchaseReceipt(ORDER.orderId, BINDING), receipt);
      check(f.state.verifies, 4, "each public read rechecks provider status");
      f.state.order.status = "shipped";
      check(await f.service.getVerifiedGooglePurchaseReceipt(ORDER.orderId, BINDING), receipt);
    }
    for (const edit of [
      (f: ReturnType<typeof fixture>) => { f.state.payment.status = "authorized"; },
      (f: ReturnType<typeof fixture>) => { f.state.payment.status = "failed"; },
      (f: ReturnType<typeof fixture>) => { f.state.payment.refundedAmount = 100; },
      (f: ReturnType<typeof fixture>) => { f.state.payment.amount = 1; },
      (f: ReturnType<typeof fixture>) => { f.state.providerOrder.checkoutSession.checkoutToken = "different_checkout"; },
      (f: ReturnType<typeof fixture>) => { f.state.providerOrder.storeId = "different_store"; },
      (f: ReturnType<typeof fixture>) => { f.state.payment.transactions[0].isTest = true; },
    ]) {
      const f = await prepared(); edit(f);
      check(await f.service.getVerifiedGooglePurchaseReceipt(ORDER.orderId, BINDING), null);
      check(f.state.confirms, 0);
    }
    for (const change of [
      { total: 61 }, { currency: "EUR" }, { invoiceId: "changed_checkout" },
      { paidAt: new Date(NOW - 5000).toISOString() }, { status: "cancelled" },
      { attribution: { googleAdsMeasurementConsent: false } },
    ]) {
      const f = await prepared(); Object.assign(f.state.order, change);
      check(await f.service.getVerifiedGooglePurchaseReceipt(ORDER.orderId, BINDING), null);
      check(f.state.verifies, 0, "changed local facts cannot reuse a verified marker");
    }
    for (const change of [{ transactionId: "invented" }, { version: 2 }, { amountCents: 1 }, { proof: { provider: "tagada", paymentId: "checkout_fixture" } }]) {
      const f = await prepared(); Object.assign(f.state.marker!, change);
      check(await f.service.getVerifiedGooglePurchaseReceipt(ORDER.orderId, BINDING), null); check(f.state.verifies, 0);
    }
    for (const mutate of [
      (f: ReturnType<typeof fixture>) => { f.state.excluded = true; },
      (f: ReturnType<typeof fixture>) => { f.state.order.attribution!.googleAdsMeasurementConsent = false; },
      (f: ReturnType<typeof fixture>) => { f.state.order.total = 1; },
      (f: ReturnType<typeof fixture>) => { f.state.config = null; },
      (f: ReturnType<typeof fixture>) => { f.state.now += GOOGLE_PURCHASE_MAX_AGE_MS; },
    ]) {
      const f = await prepared(); f.state.readHook = () => mutate(f);
      check(await f.service.getVerifiedGooglePurchaseReceipt(ORDER.orderId, BINDING), null,
        "concurrent consent, exclusion, amount, config or freshness changes suppress the receipt");
    }
    {
      const f = fixture(); f.state.excluded = true;
      await f.service.safeRecordVerifiedGooglePurchase(f.state.order, PROOF); check(f.state.marker, null);
      const g = await prepared(); g.state.excluded = true;
      check(await g.service.getVerifiedGooglePurchaseReceipt(ORDER.orderId, BINDING), null); check(g.state.verifies, 0);
    }
    {
      const f = await prepared(); f.state.config = { ...CONFIG, sendTo: "AW-999999999/new_label" };
      check(await f.service.getVerifiedGooglePurchaseReceipt(ORDER.orderId, BINDING), null); check(f.state.verifies, 0);
    }
    {
      const f = await prepared();
      const service = createGooglePurchaseService({ ...f.dependencies, getStore: () => { throw new Error("PRIVATE_DATABASE_SECRET"); } });
      check(await service.safeRecordVerifiedGooglePurchase(ORDER, PROOF), undefined);
      check(await service.getVerifiedGooglePurchaseReceipt(ORDER.orderId, BINDING), null);
      const hung = createGooglePurchaseService({ ...f.dependencies,
        tagadaReads: { ...f.dependencies.tagadaReads, retrievePayment: () => new Promise(() => {}) }, providerTimeoutMs: 10 });
      check(await hung.getVerifiedGooglePurchaseReceipt(ORDER.orderId, BINDING), null);
    }
    {
      const f = fixture(); f.state.order.paymentMethod = "bitcoin"; f.state.order.invoiceId = "invoice_fixture";
      await f.service.safeRecordVerifiedGooglePurchase(f.state.order, { provider: "btcpay", paymentId: "invoice_fixture" });
      assert(f.state.marker); checks++;
      for (const invoice of [
        { id: "invoice_fixture", processor: "btcpay", status: "settled" as const, metadata: { orderId: ORDER.orderId } },
        { id: "invoice_fixture", processor: "btcpay", status: "processing" as const, metadata: { orderId: ORDER.orderId } },
        { id: "invoice_fixture", processor: "btcpay", status: "invalid" as const, metadata: { orderId: ORDER.orderId } },
        { id: "different_invoice", processor: "btcpay", status: "settled" as const, metadata: { orderId: ORDER.orderId } },
        { id: "invoice_fixture", processor: "btcpay", status: "settled" as const, metadata: { orderId: "different_order" } },
      ]) {
        const service = createGooglePurchaseService({ ...f.dependencies, getInvoiceStatus: async () => invoice });
        const receipt = await service.getVerifiedGooglePurchaseReceipt(ORDER.orderId, BINDING);
        check(receipt !== null, invoice.status === "settled" && invoice.id === "invoice_fixture" && invoice.metadata.orderId === ORDER.orderId);
      }
      let aborted = false;
      const hung = createGooglePurchaseService({ ...f.dependencies, providerTimeoutMs: 10,
        getInvoiceStatus: async (_id, { signal }) => new Promise((_, reject) => {
          signal.addEventListener("abort", () => { aborted = true; reject(new Error("aborted")); });
        }),
      });
      check(await hung.getVerifiedGooglePurchaseReceipt(ORDER.orderId, BINDING), null); check(aborted, true);
    }
    await sqlContract(); await routeChecks();
    console.log(`Google verified-purchase receipt offline checks passed: ${checks}`);
  } finally { globalThis.fetch = originalFetch; }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
