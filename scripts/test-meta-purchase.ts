/** Offline service, SQL contract and actual route; no real order/provider/ad requests. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { NextResponse } from "next/server";
import { isIP } from "node:net";
import { createMetaPurchaseService, createMetaPurchaseSqlStore, isMetaPurchaseOrderId,
  type MetaPurchaseSnapshot } from "../lib/meta-ads/purchase";
import { PSL_META_DATASET_ID, type MetaEventPolicy } from "../lib/meta-ads/events";
import type { MetaServerConfig } from "../lib/meta-ads/config";
import type { sendPreparedMetaEvent } from "../lib/meta-ads/transport";
import type { getSql } from "../lib/db/sql";
import { UNKNOWN_PRIVACY_CONSENT } from "../lib/privacy/types";
import { isSameOriginMutation } from "../lib/security/request-origin";
import { metaEventId } from "../lib/meta-ads/event-id";

const NOW = Date.parse("2026-10-09T12:00:00Z");
const BINDING = { digest: "a".repeat(64), revision: 1, version: 1 };
const CONFIG: MetaServerConfig = { datasetId: PSL_META_DATASET_ID, accessToken: "OFFLINE_FIXTURE", apiVersion: "v26.0" };
const POLICY: MetaEventPolicy = { approvedPaths: { Purchase: ["/success"] }, approvedProductIds: ["PSL-RT-10MG"] };
const INPUT = { orderId: "psl_meta_fixture", binding: BINDING, sourceUrl: "https://www.psllabs.org/success",
  technical: { client_ip_address: "192.0.2.1", client_user_agent: "Offline fixture" } };
const SNAPSHOT: MetaPurchaseSnapshot = { paymentId: "pay_fixture", order: {
  orderId: INPUT.orderId, status: "paid", paidAt: new Date(NOW - 1000).toISOString(),
  total: 69.98, currency: "USD", paymentMethod: "card", invoiceId: "checkout_fixture",
  attribution: { privacyConsent: BINDING } as MetaPurchaseSnapshot["order"]["attribution"],
  items: [{ handle: "retatrutide", name: "Private stored name is never sent", strength: "10mg", quantity: 1, unitPrice: 59.99, lineTotal: 59.99 }],
} };
const PAYMENT = { id: "pay_fixture", orderId: "order_fixture", storeId: "store_fixture", accountId: "account_fixture",
  amount: 6998, currency: "USD", status: "succeeded", subStatus: "approved", refundedAmount: 0,
  transactions: [{ paymentId: "pay_fixture", storeId: "store_fixture", accountId: "account_fixture",
    type: "purchase", status: "succeeded", result: "approved", isTest: false, draft: false, amount: 6998, currency: "USD" }] };
const PROVIDER_ORDER = { id: "order_fixture", storeId: "store_fixture", accountId: "account_fixture", status: "paid",
  currency: "USD", paidAmount: 6998, checkoutSessionId: "session_fixture", draft: false,
  checkoutSession: { id: "session_fixture", storeId: "store_fixture", checkoutToken: "checkout_fixture", draft: false },
  summaries: [{ orderId: "order_fixture", checkoutSessionId: "session_fixture", totalAmount: 6998, currency: "USD" }],
  payments: [PAYMENT] };
let checks = 0;
function check(actual: unknown, expected: unknown, message?: string) { assert.deepEqual(actual, expected, message); checks++; }

function fixture() {
  const state = { snapshot: structuredClone(SNAPSHOT), payment: structuredClone(PAYMENT),
    providerOrder: structuredClone(PROVIDER_ORDER), config: CONFIG as MetaServerConfig | null,
    excluded: false, consent: true, revision: 1, reads: 0, confirms: 0, providerReads: 0,
    now: NOW, sent: [] as Parameters<typeof sendPreparedMetaEvent>[0][],
    afterProvider: undefined as (() => void) | undefined,
    beforeTransport: undefined as (() => void) | undefined };
  const dependencies = { getConfig: () => state.config, now: () => state.now, policy: POLICY,
    getStore: () => ({
      async read(orderId: string) { state.reads++; return !state.excluded && state.snapshot.order.orderId === orderId ? structuredClone(state.snapshot) : null; },
      async confirmCurrent(snapshot: MetaPurchaseSnapshot) {
        state.confirms++; return !state.excluded && JSON.stringify(snapshot) === JSON.stringify(state.snapshot);
      },
    }),
    currentPermission: async (binding: typeof BINDING) => state.consent && binding.digest === BINDING.digest &&
      binding.revision === state.revision && binding.version === BINDING.version,
    tagadaReads: { storeId: "store_fixture",
      async retrievePayment() { state.providerReads++; state.afterProvider?.(); return structuredClone(state.payment); },
      async retrieveOrder() { state.providerReads++; return { order: structuredClone(state.providerOrder) }; },
    },
    send: async (input: Parameters<typeof sendPreparedMetaEvent>[0]) => {
      state.beforeTransport?.();
      if (!await input.currentPermission()) return { ok: false, reason: "consent_unavailable" };
      state.sent.push(input); return { ok: true, received: 1 };
    },
  };
  return { state, dependencies, service: createMetaPurchaseService(dependencies) };
}

async function serviceChecks() {
  const base = fixture();
  check(await base.service.sendPurchase(INPUT), { ok: true, reason: "received" });
  check(base.state.sent.length, 1);
  const event = base.state.sent[0].event;
  check(event.event_name, "Purchase"); check(event.event_source_url, "https://www.psllabs.org/success");
  check(event.custom_data, { content_ids: ["PSL-RT-10MG"], content_type: "product", value: 69.98, currency: "USD" });
  check(event.event_time, Math.floor((NOW - 1000) / 1000));
  check(/^[a-f0-9]{64}$/.test(event.event_id), true);
  check(event.event_id, metaEventId("Purchase", INPUT.orderId));
  check(JSON.stringify(event).includes(INPUT.orderId), false);
  check(JSON.stringify(event).includes("Private stored"), false);
  await base.service.sendPurchase(INPUT);
  check(base.state.sent[1].event.event_id, event.event_id, "refresh/retry uses the same Meta deduplication key");
  check(base.state.providerReads, 4, "each requested attempt re-verifies provider evidence");

  for (const alter of [
    (f: ReturnType<typeof fixture>) => { f.state.config = null; },
    (f: ReturnType<typeof fixture>) => { f.state.consent = false; },
    (f: ReturnType<typeof fixture>) => { f.state.excluded = true; },
    (f: ReturnType<typeof fixture>) => { f.state.snapshot.order.attribution = null; },
    (f: ReturnType<typeof fixture>) => { f.state.snapshot.order.paymentMethod = "bitcoin"; },
    (f: ReturnType<typeof fixture>) => { f.state.snapshot.order.status = "pending"; },
    (f: ReturnType<typeof fixture>) => { f.state.snapshot.order.status = "cancelled"; },
    (f: ReturnType<typeof fixture>) => { f.state.snapshot.order.currency = "EUR"; },
    (f: ReturnType<typeof fixture>) => { f.state.snapshot.order.total = 69.981; },
    (f: ReturnType<typeof fixture>) => { f.state.snapshot.order.total = 0; },
    (f: ReturnType<typeof fixture>) => { f.state.snapshot.order.paidAt = new Date(NOW + 1).toISOString(); },
    (f: ReturnType<typeof fixture>) => { f.state.now = NOW + 86400000; },
    (f: ReturnType<typeof fixture>) => { f.state.snapshot.order.items = []; },
    (f: ReturnType<typeof fixture>) => { f.state.snapshot.order.items[0].quantity = 0; },
    (f: ReturnType<typeof fixture>) => { f.state.snapshot.order.items[0].handle = "mots-c"; },
    (f: ReturnType<typeof fixture>) => { f.state.snapshot.order.items[0].handle = "foundation"; },
    (f: ReturnType<typeof fixture>) => { f.state.snapshot.order.items.push({ ...f.state.snapshot.order.items[0], handle: "unknown" }); },
  ]) {
    const f = fixture(); alter(f); check((await f.service.sendPurchase(INPUT)).ok, false);
    check(f.state.sent.length, 0); check(f.state.providerReads, 0);
  }
  for (const input of [
    { ...INPUT, binding: null }, { ...INPUT, binding: { ...BINDING, revision: 2 } },
    { ...INPUT, binding: { ...BINDING, digest: "b".repeat(64) } },
    { ...INPUT, orderId: "synthetic_fixture" },
    { ...INPUT, sourceUrl: "https://www.psllabs.org/admin-ledger.01" },
    { ...INPUT, sourceUrl: `https://www.psllabs.org/success?orderId=${INPUT.orderId}` },
  ]) { const f = fixture(); check((await f.service.sendPurchase(input)).ok, false); check(f.state.sent.length, 0); }
  for (const alter of [
    (f: ReturnType<typeof fixture>) => { Object.assign(f.state.payment, { isTest: true }); },
    (f: ReturnType<typeof fixture>) => { Object.assign(f.state.payment, { draft: true }); },
    (f: ReturnType<typeof fixture>) => { f.state.payment.transactions[0].isTest = true; },
    (f: ReturnType<typeof fixture>) => { f.state.payment.transactions[0].draft = true; },
    (f: ReturnType<typeof fixture>) => { f.state.payment.amount = 1; },
    (f: ReturnType<typeof fixture>) => { f.state.payment.currency = "EUR"; },
    (f: ReturnType<typeof fixture>) => { f.state.payment.refundedAmount = 1; },
    (f: ReturnType<typeof fixture>) => { f.state.payment.status = "authorized"; },
    (f: ReturnType<typeof fixture>) => { f.state.providerOrder.draft = true; },
    (f: ReturnType<typeof fixture>) => { f.state.providerOrder.checkoutSession.draft = true; },
    (f: ReturnType<typeof fixture>) => { f.state.providerOrder.checkoutSession.checkoutToken = "another_order"; },
    (f: ReturnType<typeof fixture>) => { f.state.providerOrder.storeId = "another_store"; },
  ]) { const f = fixture(); alter(f); check((await f.service.sendPurchase(INPUT)).ok, false); check(f.state.sent.length, 0); }
  for (const stage of ["afterProvider", "beforeTransport"] as const) {
    for (const change of ["consent", "revision", "exclusion", "amount", "items"] as const) {
      const f = fixture();
      f.state[stage] = () => {
        if (change === "consent") f.state.consent = false;
        if (change === "revision") f.state.revision++;
        if (change === "exclusion") f.state.excluded = true;
        if (change === "amount") f.state.snapshot.order.total++;
        if (change === "items") f.state.snapshot.order.items[0].quantity++;
      };
      check((await f.service.sendPurchase(INPUT)).ok, false); check(f.state.sent.length, 0);
    }
  }
  const inactive = fixture(); inactive.state.config = null;
  check((await inactive.service.sendPurchase(INPUT)).reason, "inactive"); check(inactive.state.reads, 0);
  const noPolicy = fixture();
  check((await createMetaPurchaseService({ ...noPolicy.dependencies, policy: undefined }).sendPurchase(INPUT)).ok, false);
  check(noPolicy.state.providerReads, 0);
  const failure = fixture();
  check(await createMetaPurchaseService({ ...failure.dependencies,
    getStore: () => { throw new Error("PRIVATE_DB_SECRET"); } }).sendPurchase(INPUT), { ok: false, reason: "purchase_unavailable" });
  const hung = fixture();
  check(await createMetaPurchaseService({ ...hung.dependencies, providerTimeoutMs: 5,
    tagadaReads: { ...hung.dependencies.tagadaReads, retrievePayment: () => new Promise(() => {}) },
  }).sendPurchase(INPUT), { ok: false, reason: "purchase_unavailable" });
  check(hung.state.sent.length, 0);
}

async function sqlChecks() {
  const queries: string[] = [];
  let rows: Record<string, unknown>[] = [];
  const sql = (async (strings: TemplateStringsArray) => { queries.push(strings.join("?")); return rows; }) as unknown as ReturnType<typeof getSql>;
  const store = createMetaPurchaseSqlStore(sql);
  check(await store.read(INPUT.orderId), null);
  rows = [{ order_id: INPUT.orderId, status: "paid", paid_at: SNAPSHOT.order.paidAt,
    total: "69.98", currency: "USD", payment_method: "card", invoice_id: "checkout_fixture",
    attribution: JSON.stringify(SNAPSHOT.order.attribution), items: JSON.stringify(SNAPSHOT.order.items), provider_payment_id: "pay_fixture" }];
  check(await store.read(INPUT.orderId), SNAPSHOT);
  check(await store.confirmCurrent(SNAPSHOT), true);
  rows[0].total = "70.98";
  check(await store.confirmCurrent(SNAPSHOT), false);
  for (const query of queries) {
    check(query.includes("f.reporting_excluded = false"), true);
    check(query.includes("excluded.reporting_excluded = true"), true);
    check(query.includes("f.gross_amount = o.total"), true);
    check(query.includes("f.provider = 'tagada'"), true);
    check(/INSERT|UPDATE|DELETE|CREATE/.test(query), false);
  }
}

async function routeChecks() {
  const source = readFileSync("app/api/meta/purchase/route.ts", "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const state = { active: true, calls: 0, privacyReads: 0, limited: false,
    sent: [] as Record<string, unknown>[], consent: { ...UNKNOWN_PRIVACY_CONSENT,
      choice: "saved", measurement: true, personalization: true,
      capabilities: { metaMeasurement: true, metaPersonalization: true, googleMeasurement: false, openaiMeasurement: false } },
    binding: BINDING as typeof BINDING | null };
  const exports: { POST?: (request: Request) => Promise<Response> } = {};
  runInNewContext(compiled, { exports, URL, process: { env: { VERCEL: "1" } }, require: (name: string) => {
    if (name === "node:net") return { isIP };
    if (name === "next/server") return { NextResponse };
    if (name.endsWith("/meta-ads/config")) return { readMetaServerConfig: () => state.active ? CONFIG : null };
    if (name.endsWith("/meta-ads/purchase")) return { isMetaPurchaseOrderId, sendVerifiedMetaPurchase: async (input: Record<string, unknown>) => {
      state.calls++; state.sent.push(input); return { ok: true, reason: "received" };
    } };
    if (name.endsWith("/privacy/server")) return { readRequestPrivacyConsent: async () => {
      state.privacyReads++; return { consent: state.consent, binding: state.binding };
    }, requestCookie: () => undefined };
    if (name.endsWith("/security/request-origin")) return { isSameOriginMutation };
    if (name.endsWith("/security/request-rate-limit")) return { consumeRequestLimit: async () => state.limited ? NextResponse.json({}, { status: 429 }) : null };
    throw new Error(`Unexpected dependency: ${name}`);
  } });
  const request = (body: unknown = { orderId: INPUT.orderId }, extra: Record<string, string> = {}) => new Request("https://www.psllabs.org/api/meta/purchase", {
    method: "POST", headers: { origin: "https://www.psllabs.org", referer: `https://www.psllabs.org/success?orderId=${INPUT.orderId}`,
      "x-vercel-forwarded-for": "192.0.2.1", "user-agent": "Offline fixture", "content-type": "application/json", ...extra },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  const invoke = async (req: Request) => { const response = await exports.POST!(req); return { response, json: await response.json() }; };
  const good = await invoke(request()); check(good.json, { purchase: "received" });
  check(good.response.headers.get("cache-control"), "private, no-store, max-age=0");
  check(state.sent[0].sourceUrl, "https://www.psllabs.org/success");
  check(state.calls, 1);
  for (const headers of [
    { origin: "https://other.example" }, { origin: "https://psllabs.org" }, { origin: "null" },
    { "sec-fetch-site": "cross-site" }, { referer: "https://www.psllabs.org/admin-ledger.01" },
    { referer: "https://www.psllabs.org/success?orderId=psl_other" },
    { referer: `https://www.psllabs.org/success?orderId=${INPUT.orderId}&email=private` },
    { referer: `https://www.psllabs.org/success?orderId=${INPUT.orderId}&orderId=${INPUT.orderId}` },
    { referer: "" }, { "x-vercel-forwarded-for": "" },
  ] as Array<Record<string, string>>) { check((await invoke(request(undefined, headers))).json, { purchase: null }); }
  for (const body of [null, [], "invalid", { orderId: INPUT.orderId, settledPayment: true }, { orderId: INPUT.orderId, binding: BINDING },
    { orderId: "demo" }, { orderId: "x".repeat(600) }]) check((await invoke(request(body))).json, { purchase: null });
  check(state.calls, 1);
  for (const key of ["admin", "gpc"] as const) {
    state.consent[key] = true; check((await invoke(request())).json, { purchase: null }); state.consent[key] = false;
  }
  for (const key of ["measurement", "personalization"] as const) {
    state.consent[key] = false; check((await invoke(request())).json, { purchase: null }); state.consent[key] = true;
  }
  state.binding = null; check((await invoke(request())).json, { purchase: null }); state.binding = BINDING;
  state.limited = true; check((await invoke(request())).response.status, 429); state.limited = false;
  state.active = false; const reads = state.privacyReads;
  check((await invoke(request())).json, { purchase: null }); check(state.privacyReads, reads); check(state.calls, 1);
}

async function receiptComponentChecks() {
  const compiled = ts.transpileModule(readFileSync("components/analytics/meta-ads-purchase.tsx", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  function componentFixture() {
    const state = { consent: { ...UNKNOWN_PRIVACY_CONSENT, choice: "saved", revision: 1,
      measurement: true, personalization: true, expiresAt: NOW + 86400000,
      capabilities: { metaMeasurement: true, metaPersonalization: true, googleMeasurement: false, openaiMeasurement: false } },
      calls: [] as { url: string; init: RequestInit }[], received: false,
      fetchGate: null as Promise<void> | null, failed: false };
    const refs: { current: unknown }[] = [];
    let refIndex = 0, timerId = 0;
    let effect: (() => void | (() => void)) | undefined;
    let cleanup: (() => void) | undefined;
    const timers = new Map<number, () => void>();
    const exports: { MetaAdsPurchaseReceipt?: (props: { orderId: string; paid: boolean }) => null } = {};
    runInNewContext(compiled, { exports, AbortController,
      setTimeout: (callback: () => void, delay: number) => {
        check(delay, 2500); timers.set(++timerId, callback); return timerId;
      }, clearTimeout: (id: number) => { timers.delete(id); },
      fetch: async (url: string, init: RequestInit) => {
        state.calls.push({ url, init });
        if (state.fetchGate) await state.fetchGate;
        if (state.failed) throw new Error("OFFLINE_FAILURE");
        return { ok: true, json: async () => ({ purchase: state.received ? "received" : null }) };
      },
      require: (name: string) => {
        if (name === "react") return {
          useRef: (initial: unknown) => refs[refIndex++] ??= { current: initial },
          useSyncExternalStore: () => state.consent,
          useEffect: (callback: () => void | (() => void)) => { effect = callback; },
        };
        if (name.endsWith("/privacy/client")) return {
          readPrivacyConsent: () => state.consent, serverPrivacyConsent: () => UNKNOWN_PRIVACY_CONSENT,
          subscribePrivacyConsent: () => () => {},
        };
        throw new Error(`Unexpected component dependency: ${name}`);
      },
    });
    const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
    const render = async (orderId = INPUT.orderId, paid = true) => {
      cleanup?.(); cleanup = undefined; refIndex = 0;
      check(exports.MetaAdsPurchaseReceipt!({ orderId, paid }), null);
      cleanup = effect?.() || undefined;
      await flush();
    };
    const tick = async () => {
      const scheduled = [...timers.values()]; timers.clear(); scheduled.forEach(fn => fn()); await flush();
    };
    return { state, render, tick, flush, timers, unmount: () => { cleanup?.(); cleanup = undefined; } };
  }
  for (const change of ["measurement", "personalization", "metaMeasurement", "metaPersonalization", "gpc", "admin", "unknown"] as const) {
    const f = componentFixture();
    if (change === "measurement" || change === "personalization") f.state.consent[change] = false;
    else if (change === "metaMeasurement" || change === "metaPersonalization") f.state.consent.capabilities[change] = false;
    else if (change === "unknown") f.state.consent.choice = "unknown";
    else f.state.consent[change] = true;
    await f.render(); check(f.state.calls.length, 0); check(f.timers.size, 0); f.unmount();
  }
  for (const [orderId, paid] of [[INPUT.orderId, false], ["demo_order", true]] as Array<[string, boolean]>) {
    const f = componentFixture(); await f.render(orderId, paid); check(f.state.calls.length, 0); f.unmount();
  }
  const successful = componentFixture(); successful.state.received = true;
  await successful.render(); check(successful.state.calls.length, 1); check(successful.timers.size, 0);
  const request = successful.state.calls[0];
  check(request.url, "/api/meta/purchase"); check(JSON.parse(String(request.init.body)), { orderId: INPUT.orderId });
  check(request.init.credentials, "same-origin"); check(request.init.cache, "no-store");
  check(request.init.signal?.aborted, false);
  successful.state.consent = { ...successful.state.consent };
  await successful.render(); check(successful.state.calls.length, 1); successful.unmount();

  const retries = componentFixture();
  await retries.render(); await retries.tick(); await retries.tick(); await retries.tick();
  check(retries.state.calls.length, 3); check(retries.timers.size, 0);
  retries.state.consent = { ...retries.state.consent };
  await retries.render(); check(retries.state.calls.length, 3); retries.unmount();

  // An unrelated receipt refresh with the same consent revision must not reset
  // the bounded retry budget while earlier attempts are still pending.
  const rerenders = componentFixture();
  await rerenders.render();
  for (let i = 0; i < 5; i++) {
    rerenders.state.consent = { ...rerenders.state.consent };
    await rerenders.render();
  }
  await rerenders.tick(); check(rerenders.state.calls.length, 3); rerenders.unmount();

  for (const change of ["withdrawal", "revision", "unmount"] as const) {
    const f = componentFixture(); await f.render();
    if (change === "withdrawal") f.state.consent = { ...f.state.consent, measurement: false };
    if (change === "revision") f.state.consent = { ...f.state.consent, revision: f.state.consent.revision + 1 };
    if (change === "unmount") f.unmount();
    await f.tick(); check(f.state.calls.length, 1); check(f.timers.size, 0); f.unmount();
    check(f.state.calls[0].init.signal?.aborted, true);
  }
  const late = componentFixture();
  let release!: () => void;
  late.state.fetchGate = new Promise<void>(resolve => { release = resolve; });
  await late.render(); late.unmount(); release(); await late.flush();
  check(late.state.calls.length, 1); check(late.timers.size, 0); check(late.state.calls[0].init.signal?.aborted, true);
}

async function main() {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("Offline suite forbids all network requests"); };
  try { await serviceChecks(); await sqlChecks(); await routeChecks(); await receiptComponentChecks(); console.log(`Meta Purchase offline checks passed: ${checks}`); }
  finally { globalThis.fetch = originalFetch; }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
