/** Executes the real flow, purchase service and notification dispatcher with offline stores/providers. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createContext, Script } from "node:vm";
import * as crypto from "node:crypto";
import ts from "typescript";
import { BtcpostageApiError } from "../lib/btcpostage/client";
import * as guards from "../lib/btcpostage/shipping-guard";
import * as policy from "../lib/shipping/policy";
import { isPhysicalUSShippingAddress } from "../lib/shipping/request";
import { DEFAULT_PACKAGE, type BtcpostageLabelRecord, type BtcpostageRate } from "../lib/btcpostage/types";
import { toPublicLabel } from "../lib/btcpostage/store";
import type { Order } from "../lib/orders/types";
import type { FulfillmentShippingPreview, ShippingNotificationStatus } from "../lib/fulfillment/shipping-flow-types";
import { buildTrackingReadyEmail } from "../lib/email/tracking-ready";

let checks = 0;
const eq = (actual: unknown, expected: unknown, note: string) => { assert.deepEqual(actual, expected, note); checks++; };
const rejects = async (fn: () => Promise<unknown>, pattern: RegExp) => { await assert.rejects(fn, pattern); checks++; };
const digest = (v: unknown) => crypto.createHash("sha256").update(JSON.stringify(v)).digest("hex");
function load<T>(path: string, mocks: Record<string, unknown>, env: Record<string, string | undefined> = {}): T {
  const compiled = ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const output: Record<string, unknown> = {};
  const run = new Script(`(function(require,module,exports){${compiled}\n})`).runInContext(createContext({ console, Error, Date, URL, process: { env } }));
  run((id: string) => { assert(id in mocks, `Unmocked dependency: ${id}`); return mocks[id]; }, { exports: output }, output);
  return output as T;
}
function fixture(): Order {
  return { orderId: "psl_OFFLINE_only", createdAt: "2026-10-16T12:00:00Z", updatedAt: "2026-10-16T12:00:00Z",
    status: "paid", currency: "USD", email: "fixture@example.invalid",
    shipping: { firstName: "Fixture", lastName: "Buyer", address: "1 Fixture Street", city: "Phoenix", state: "AZ", zip: "85016", country: "US", selection: policy.standardShippingSelection() },
    items: [{ handle: "retatrutide", name: "Retatrutide", strength: "10 mg", quantity: 1, unitPrice: 59.99, lineTotal: 59.99 }],
    subtotal: 59.99, discountCode: null, discountAmount: 0, taxRate: 0, tax: 0, shippingCost: 9.99, total: 69.98,
    invoiceId: null, invoiceCreatedAt: null, paidAt: "2026-10-16T12:01:00Z", shippedAt: null, trackingNumber: null, trackingCarrier: null,
    paymentMethod: "card", emailSent: true, emailError: null, customerEmailSent: true, customerEmailError: null,
    feedbackEmailSent: false, trackingEmailSent: false, trackingSavedAt: null, deliveryFollowupSent: false, stockDecremented: true, attribution: null };
}
function blankLabel(order: Order): BtcpostageLabelRecord {
  return { pslOrderId: order.orderId, purchaseStatus: "none", btcpOrderId: null, shipmentId: null, carrier: null, service: null,
    postageCost: null, trackingNumber: null, labelUrl: null, labelFormat: null, testMode: false, purchasedAt: null,
    purchaseClaimedAt: null, lastError: null, verifiedStreet1: null, verifiedStreet2: null, verifiedCity: null,
    verifiedState: null, verifiedZip: null, verifiedCountry: null, weightLbs: 0, weightOz: 8, heightIn: 3, widthIn: 4, depthIn: 6, updatedAt: null };
}
type Flow = typeof import("../lib/fulfillment/shipping-flow");
type Notice = ShippingNotificationStatus & { tracking: string; recipient: string };
function harness(options: { enabled?: boolean; emailEnabled?: boolean; testMode?: boolean } = {}) {
  const order = fixture(), calls: string[] = [];
  let label: BtcpostageLabelRecord | null = null, notification: Notice | null = null;
  let workflow = "packed", blocked = false, invalidAddress = false, fromZip = "85016";
  let rate = "6.32", freshRate: string | null = null, providerFailure = false, savePurchaseFailure = false, queueFailure = false, smtpFailure = false;
  let creates = 0, sends = 0, retrieves = 0, verifies = 0, quotes = 0;
  const previews = new Map<string, { fingerprint: string; postageUsd: number; expiresAt: string; used: boolean }>();
  const env = { PSL_FULFILLMENT_LABEL_FLOW_ENABLED: String(options.enabled ?? true),
    PSL_FULFILLMENT_TRACKING_EMAIL_ENABLED: String(options.emailEnabled ?? true) };
  const from = () => ({ name: "Fixture Sender", street1: "2 Fixture Origin", city: "Phoenix", state: "AZ", zip: fromZip, country: "US" });
  const config = { getBtcpostagePublicConfig: () => ({ configured: true, testMode: options.testMode ?? false }),
    getBtcpostageFromAddress: from, isBtcpostageTestMode: () => options.testMode ?? false };
  const rateList = (price: string): BtcpostageRate[] => [
    { carrier: "USPS", service: "MediaMail", rate: "1.00", currency: "USD", serviceDisplay: "Wrong cheaper service", estDeliveryDays: 8 },
    { carrier: "USPS", service: order.shipping.selection!.providerServiceCode!, rate: price, currency: "USD", serviceDisplay: "Exact saved service", estDeliveryDays: 2 },
  ];
  const orderStore = { getOrder: async () => structuredClone(order) };
  const flowStore = {
    privateDigest: digest, shippingPaymentBlocked: async () => blocked,
    saveLabelPreview: async (p: { token: string; fingerprint: string; postageUsd: number; expiresAt: string }) => { previews.set(p.token, { ...p, used: false }); },
    consumeLabelPreview: async (_id: string, token: string) => {
      const p = previews.get(token); if (!p || p.used || Date.parse(p.expiresAt) <= Date.now()) throw new Error("preview expired or used");
      p.used = true; return p;
    },
    saveTrackingAndQueue: async (p: { trackingNumber: string; carrier: string; recipientHash: string; recipientEmail: string; markShipped?: boolean }) => {
      if (queueFailure) throw new Error("fixture persistence failure after purchase");
      assert(label?.purchaseStatus === "purchased", "purchase is durable before tracking save");
      assert(!order.trackingNumber || order.trackingNumber === p.trackingNumber);
      eq(p.recipientEmail, order.email, "recipient is server order email");
      calls.push("tracking-and-outbox"); order.trackingNumber = p.trackingNumber; order.trackingCarrier = p.carrier;
      if (p.markShipped) order.status = "shipped";
      notification ??= { status: "pending", lastError: null, tracking: p.trackingNumber, recipient: p.recipientHash };
    },
    getTrackingNotification: async () => notification ? { status: notification.status, lastError: notification.lastError } : null,
    claimTrackingNotification: async (_id: string, tracking: string, recipient: string, email: string) => {
      if (notification?.status !== "pending" || notification.tracking !== tracking || notification.recipient !== recipient || email !== order.email) return false;
      notification.status = "sending"; calls.push("email-claim"); return true;
    },
    finishTrackingNotification: async () => { assert(notification); notification.status = "sent"; order.trackingEmailSent = true; calls.push("email-saved"); },
    reviewTrackingNotification: async () => { assert(notification); notification.status = "needs_review"; notification.lastError = "Check Sent mail"; },
  };
  const send = async () => {
    assert(order.trackingNumber && notification?.status === "sending", "saved tracking and exclusive claim precede SMTP");
    sends++; calls.push("smtp"); if (smtpFailure) throw new Error("fixture accepted-then-timeout");
  };
  const dispatcher = load<typeof import("../lib/fulfillment/tracking-notification")>("lib/fulfillment/tracking-notification.ts", {
    "@/lib/orders/store": orderStore, "@/lib/email/order-shipped": { sendOrderShippedEmail: send }, "@/lib/email/tracking-ready": { sendTrackingReadyEmail: send }, "./shipping-flow-store": flowStore,
  });
  const client = {
    BtcpostageApiError,
    verifyAddress: async () => { verifies++; return { isValid: !invalidAddress, standardized: invalidAddress ? null : { ...order.shipping, name: "Fixture Buyer", street1: order.shipping.address, street2: "" }, errors: [] }; },
    getRates: async () => { quotes++; calls.push("quote"); return rateList(creates === 0 && previews.size > 0 ? freshRate ?? rate : rate); },
    createPurchase: async (input: { service: string; orderNotes: string; testMode?: boolean }) => {
      creates++; calls.push("provider-purchase"); eq(input.service, order.shipping.selection!.providerServiceCode, "purchase uses exact customer service");
      eq(input.orderNotes, `PSL ${order.orderId}`, "provider request bound to PSL order");
      if (providerFailure) throw new BtcpostageApiError("fixture unknown outcome", { uncertain: true });
      return { orderId: "fixture_purchase", orderNotes: input.orderNotes, items: [{ shipmentId: "fixture_shipment", carrier: "usps", service: input.service, price: rate, currency: "USD", filename: "https://fixture.invalid/label.pdf", trackingNo: "OFFLINE-NO-SHIPMENT", toName: "Fixture Buyer" }] };
    },
    retrievePurchase: async () => { retrieves++; throw new Error("not used in flow test"); },
  };
  const labelStore = {
    getBtcpostageLabel: async () => label ? structuredClone(label) : null, ensureLabelRow: async () => { label ??= blankLabel(order); },
    saveVerifiedAddress: async (_id: string, address: { street1: string; city: string; state: string; zip: string; country: string }) => {
      label ??= blankLabel(order); label.verifiedStreet1 = address.street1; label.verifiedCity = address.city;
      label.verifiedState = address.state; label.verifiedZip = address.zip; label.verifiedCountry = address.country;
    },
    claimLabelPurchase: async () => {
      label ??= blankLabel(order);
      if (label.purchaseStatus === "purchased") return { ok: false, reason: "already_purchased", label: structuredClone(label) };
      if (label.purchaseStatus === "needs_review") return { ok: false, reason: "needs_review", label: structuredClone(label) };
      if (label.purchaseStatus === "purchasing") return { ok: false, reason: "in_flight", label: structuredClone(label) };
      label.purchaseStatus = "purchasing"; return { ok: true };
    },
    markPurchaseSucceeded: async (input: Record<string, unknown>) => {
      if (savePurchaseFailure) throw new Error("fixture database failure after provider success");
      label = { ...blankLabel(order), ...input, purchaseStatus: "purchased" } as BtcpostageLabelRecord; calls.push("purchase-saved"); return label;
    },
    markPurchaseFailed: async () => { assert(label); label.purchaseStatus = "failed"; },
    markPurchaseNeedsReview: async (_id: string, error: string, partial?: { btcpOrderId?: string }) => { assert(label); label.purchaseStatus = "needs_review"; label.lastError = error; label.btcpOrderId = partial?.btcpOrderId ?? label.btcpOrderId; },
    toPublicLabel,
  };
  const btc = load<typeof import("../lib/btcpostage/service")>("lib/btcpostage/service.ts", {
    "@/lib/orders/store": orderStore, "@/lib/shipping/policy": policy, "@/lib/shipping/request": { isPhysicalUSShippingAddress },
    "./client": client, "./config": config, "./store": labelStore, "./types": { DEFAULT_PACKAGE }, "./shipping-guard": guards,
  });
  const flow = load<Flow>("lib/fulfillment/shipping-flow.ts", {
    "node:crypto": crypto, "@/lib/orders/store": orderStore, "@/lib/btcpostage/config": config, "@/lib/btcpostage/service": btc,
    "@/lib/btcpostage/store": labelStore, "@/lib/btcpostage/client": client, "@/lib/btcpostage/shipping-guard": guards,
    "@/lib/shipping/policy": policy, "@/lib/shipping/request": { isPhysicalUSShippingAddress },
    "./store": { getFulfillmentWorkflow: async () => ({ workflowStatus: workflow }) }, "./shipping-flow-store": flowStore,
    "./tracking-notification": dispatcher,
  }, env);
  return { order, calls, flow, dispatcher, previews,
    prepare: () => flow.prepareFulfillmentLabel(order.orderId),
    buy: (preview: FulfillmentShippingPreview) => flow.purchaseFulfillmentLabel({ orderId: order.orderId, previewToken: preview.token!, confirmPurchase: true }),
    complete: () => flow.completeFulfillmentTracking(order.orderId),
    state: () => ({ creates, sends, retrieves, verifies, quotes, label, notification }),
    set: (input: { workflow?: string; blocked?: boolean; invalidAddress?: boolean; fromZip?: string; rate?: string; freshRate?: string; providerFailure?: boolean; savePurchaseFailure?: boolean; queueFailure?: boolean; smtpFailure?: boolean }) => {
      workflow = input.workflow ?? workflow; blocked = input.blocked ?? blocked; invalidAddress = input.invalidAddress ?? invalidAddress; fromZip = input.fromZip ?? fromZip;
      rate = input.rate ?? rate; freshRate = input.freshRate ?? freshRate; providerFailure = input.providerFailure ?? providerFailure;
      savePurchaseFailure = input.savePurchaseFailure ?? savePurchaseFailure; queueFailure = input.queueFailure ?? queueFailure; smtpFailure = input.smtpFailure ?? smtpFailure;
    },
  };
}
async function main() {
  const oldFetch = globalThis.fetch; let external = 0;
  globalThis.fetch = async () => { external++; throw new Error("External calls forbidden"); };
  try {
    const h = harness(), p = (await h.prepare()).preview;
    eq(p.postageUsd, 6.32, "saved Ground Advantage chosen instead of cheaper Media Mail");
    eq(p.package.weightOz, 8, "approved 8 oz preset"); eq(p.canPurchase, true, "packed paid verified order can purchase after review");
    const result = await h.buy(p); eq(result.trackingSaved, true, "tracking attached automatically"); eq(result.notification?.status, "sent", "tracking-ready email sent automatically");
    eq(h.order.status, "paid", "label purchase does not claim carrier handoff");
    eq(h.calls.slice(-4), ["tracking-and-outbox", "email-claim", "smtp", "email-saved"], "tracking persisted and email claimed before send");
    await h.buy(p); eq(h.state().creates, 1, "repeated successful purchase cannot buy twice"); eq(h.state().sends, 1, "repeated completion cannot send twice");
    eq((await h.flow.getFulfillmentShippingStatus(h.order.orderId)).trackingSaved, true, "status reports saved tracking explicitly");

    const concurrent = harness(), cp = (await concurrent.prepare()).preview;
    const both = await Promise.allSettled([concurrent.buy(cp), concurrent.buy(cp)]);
    eq(both.filter(r => r.status === "fulfilled").length, 1, "single-use preview accepts one concurrent submission");
    eq(concurrent.state().creates, 1, "double-click causes one paid dispatch"); eq(concurrent.state().sends, 1, "double-click causes one notification");

    for (const mutation of [
      (x: ReturnType<typeof harness>) => { x.order.status = "cancelled"; },
      (x: ReturnType<typeof harness>) => { x.order.shipping.address = "9 Changed Fixture Street"; },
      (x: ReturnType<typeof harness>) => { x.order.total += 1; },
      (x: ReturnType<typeof harness>) => x.set({ blocked: true }),
      (x: ReturnType<typeof harness>) => x.set({ workflow: "hold" }),
      (x: ReturnType<typeof harness>) => x.set({ freshRate: "9.00" }),
    ]) {
      const changed = harness(), preview = (await changed.prepare()).preview; mutation(changed);
      await rejects(() => changed.buy(preview), /review|changed|ready|settlement|increased|packed/i);
      eq(changed.state().creates, 0, "changed order/payment/packing/address/rate stops before purchase");
    }
    const expired = harness(), ep = (await expired.prepare()).preview; expired.previews.get(ep.token!)!.expiresAt = "2000-01-01T00:00:00Z";
    await rejects(() => expired.buy(ep), /expired/); eq(expired.state().creates, 0, "expired quote never purchases");
    for (const change of [
      (x: ReturnType<typeof harness>) => { x.order.stockDecremented = false; },
      (x: ReturnType<typeof harness>) => { x.order.items[0].quantity = 11; },
      (x: ReturnType<typeof harness>) => { x.order.shipping.selection = undefined; },
      (x: ReturnType<typeof harness>) => x.set({ invalidAddress: true }),
      (x: ReturnType<typeof harness>) => x.set({ blocked: true }),
    ]) { const x = harness(); change(x); eq((await x.prepare()).preview.canPurchase, false, "unsettled/large/legacy/unverified/reconciled orders require review"); eq(x.state().creates, 0, "preparation never buys"); }
    const wrongOrigin = harness(); wrongOrigin.set({ fromZip: "10007" }); await rejects(() => wrongOrigin.prepare(), /origin.*85016/);
    const off = harness({ enabled: false }); const op = (await off.prepare()).preview; eq(op.canPurchase, false, "purchase flag off is server enforced"); await rejects(() => off.buy(op), /not enabled/);
    const noEmail = harness({ emailEnabled: false }); await noEmail.buy((await noEmail.prepare()).preview); eq(noEmail.state().sends, 0, "email flag off queues without sending"); eq(noEmail.state().notification?.status, "pending", "queued state remains visible");
    const test = harness({ testMode: true }); const tr = await test.buy((await test.prepare()).preview); eq(tr.testMode, true, "test purchase remains a test label"); eq(test.order.trackingNumber, null, "test label never copied to real order"); eq(test.state().sends, 0, "test label never emailed");
    const pri = harness(); pri.order.shipping.selection = { ...policy.standardShippingSelection(), method: "priority", providerServiceCode: "Priority", serviceDisplayName: "USPS Priority Mail", package: { ...policy.PRIORITY_PACKAGE }, quotedPostageUsd: 19.28, quotedAt: "2026-10-15T12:00:00.000Z", quoteExpiresAt: "2026-10-15T12:05:00.000Z" }; pri.order.shippingCost = 22.99; pri.set({ rate: "19.28" });
    const pp = (await pri.prepare()).preview; eq(pp.service, "Priority", "saved paid Priority upgrade retained"); await pri.buy(pp); eq(pri.state().creates, 1, "covered Priority succeeds");
    const loss = harness(); loss.order.shipping.selection = structuredClone(pri.order.shipping.selection); loss.order.shippingCost = 22.99; loss.set({ rate: "20.49" }); eq((await loss.prepare()).preview.canPurchase, false, "Priority cost reserve enforced before owner confirms");
    for (const flag of ["providerFailure", "savePurchaseFailure"] as const) {
      const x = harness(), preview = (await x.prepare()).preview; x.set({ [flag]: true });
      await rejects(() => x.buy(preview), /uncertain|review/i); eq(x.state().label?.purchaseStatus, "needs_review", "unknown provider/DB result is held");
      const retry = (await x.prepare()).preview; eq(retry.canPurchase, false, "unknown purchase cannot prepare another paid attempt"); eq(x.state().creates, 1, "unknown result dispatched once");
    }
    const failedQueue = harness(), qp = (await failedQueue.prepare()).preview; failedQueue.set({ queueFailure: true });
    await rejects(() => failedQueue.buy(qp), /persistence/); eq(failedQueue.state().label?.purchaseStatus, "purchased", "post-purchase tracking failure preserves purchased label");
    failedQueue.set({ queueFailure: false }); await failedQueue.complete(); eq(failedQueue.state().creates, 1, "recovery attaches tracking without repurchase");
    const emailFail = harness(), fp = (await emailFail.prepare()).preview; emailFail.set({ smtpFailure: true });
    await emailFail.buy(fp); eq(emailFail.state().notification?.status, "needs_review", "accepted-then-timeout SMTP held for Sent-mail reconciliation");
    await emailFail.complete(); eq(emailFail.state().sends, 1, "uncertain SMTP is never blindly resent");
    const emailRace = harness({ emailEnabled: false }); await emailRace.buy((await emailRace.prepare()).preview);
    await Promise.all([emailRace.dispatcher.dispatchTrackingNotification(emailRace.order.orderId, true), emailRace.dispatcher.dispatchTrackingNotification(emailRace.order.orderId, true)]);
    eq(emailRace.state().sends, 1, "two simultaneous notification workers get one exclusive claim");
    const changedEmail = harness({ emailEnabled: false }); await changedEmail.buy((await changedEmail.prepare()).preview);
    changedEmail.order.email = "changed@example.invalid";
    await changedEmail.dispatcher.dispatchTrackingNotification(changedEmail.order.orderId, true);
    eq(changedEmail.state().sends, 0, "changed notification recipient cannot use the prior claim");
    const refund = harness({ emailEnabled: false }); await refund.buy((await refund.prepare()).preview); refund.set({ blocked: true });
    await refund.dispatcher.dispatchTrackingNotification(refund.order.orderId, true);
    eq(refund.state().sends, 0, "new reconciliation warning prevents a queued notification");
    const body = buildTrackingReadyEmail({ ...fixture(), trackingNumber: "OFFLINE<&>", trackingCarrier: "USPS" });
    assert(!/has shipped/i.test(body.subject + body.text)); checks++;
    assert(body.html.includes("OFFLINE&lt;&amp;&gt;")); checks++;
    assert(body.text.includes("USPS Ground Advantage")); checks++;

    const json = (data: unknown, init?: { status?: number; headers?: HeadersInit }) => ({ data, status: init?.status ?? 200, headers: new Headers(init?.headers) });
    let routeCalls = 0;
    const api = (denied: boolean) => load<typeof import("../app/api/admin/fulfillment-shipping/route")>("app/api/admin/fulfillment-shipping/route.ts", {
      "next/server": { NextResponse: { json } }, "@/lib/admin/require-auth": { requireAdminAuth: async () => denied ? json({ error: "Unauthorized" }, { status: 401 }) : null },
      "@/lib/fulfillment/shipping-flow": {
        getFulfillmentShippingStatus: async () => { routeCalls++; return { trackingSaved: false }; },
        prepareFulfillmentLabel: async () => { routeCalls++; throw new Error("private provider body fixture@example.invalid api-secret-value"); },
        purchaseFulfillmentLabel: async () => { routeCalls++; throw new Error("Must not purchase in route tests"); },
        completeFulfillmentTracking: async () => { routeCalls++; return { ok: true }; },
      },
    });
    const denied = api(true), allowed = api(false);
    const req = (origin: string, action: string) => new Request("https://psllabs.org/api/admin/fulfillment-shipping", { method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify({ action, orderId: "psl_OFFLINE_only" }) });
    const deniedPost = await denied.POST(req("https://psllabs.org", "purchase"));
    eq(deniedPost.status, 401, "admin authentication required before any shipping action");
    eq(deniedPost.headers.get("Cache-Control"), "private, no-store", "unauthorized purchase responses cannot be publicly cached");
    const deniedGet = await denied.GET(new Request("https://psllabs.org/api/admin/fulfillment-shipping?orderId=psl_OFFLINE_only"));
    eq(deniedGet.status, 401, "read-only shipping status requires admin authentication");
    eq(deniedGet.headers.get("Cache-Control"), "private, no-store", "unauthorized status responses cannot be publicly cached");
    eq(routeCalls, 0, "denied authentication touches no order/provider service");
    eq((await allowed.POST(req("https://untrusted.invalid", "purchase")) as unknown as { status: number }).status, 403, "cross-origin purchase rejected");
    eq(routeCalls, 0, "cross-origin purchase never reaches service");
    const failedApi = await allowed.POST(req("https://psllabs.org", "prepare"));
    assert(!JSON.stringify(failedApi).includes("api-secret-value") && !JSON.stringify(failedApi).includes("fixture@example.invalid")); checks++;
    await allowed.GET(new Request("https://psllabs.org/api/admin/fulfillment-shipping?orderId=psl_OFFLINE_only"));
    eq(routeCalls, 2, "read-only status accepts normal browser GET with no Origin header");

    const ready = fixture(), packed = fixture(), labeled = fixture();
    ready.orderId = "ready"; packed.orderId = "packed"; labeled.orderId = "labeled"; labeled.trackingNumber = "OFFLINE-TRACKING";
    const boardOrders = [ready, packed, labeled];
    const boardSql = async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const query = strings.join("?");
      if (query.includes("SELECT o.order_id")) return boardOrders.map(o => ({ order_id: o.orderId }));
      if (query.includes("SELECT * FROM fulfillment_workflow")) return [{ workflow_status: values[0] === "ready" ? "ready" : "packed" }];
      throw new Error("Unexpected offline board query");
    };
    const boardModule = load<typeof import("../lib/fulfillment/store")>("lib/fulfillment/store.ts", {
      "@/lib/db/sql": { getSql: () => boardSql }, "@/lib/orders/store": { ensureOrdersSchema: async () => undefined, getOrder: async (id: string) => boardOrders.find(o => o.orderId === id) },
      "@/lib/products/catalog": { getCatalogProductByHandle: () => ({ sku: "PSL-RT-10MG" }) },
      "@/lib/finance/store": { listOpenReconciliationWarnings: async () => [] }, "./schema": { ensureFulfillmentSchema: async () => undefined },
    });
    const board = await boardModule.collectFulfillmentBoard();
    eq(Array.from(board.labeled, o => o.orderId), ["labeled"], "saved tracking remains visible in the label-ready queue");
    eq(board.summary.labelsReady, 1, "label-ready count accurate"); eq(board.summary.unitsToPick, 1, "labeled and packed parcels are not counted again in pick totals");
    eq(external, 0, "all providers, database writes and SMTP stayed inside offline fixtures");
  } finally { globalThis.fetch = oldFetch; }
  console.log(`PASS: fulfillment shipping flow (${checks} offline checks; no real labels, payments, mail or network).`);
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
