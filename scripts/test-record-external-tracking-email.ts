/** Execute actual external-email flow/route/store guards with offline dependencies only. */
import assert from "node:assert/strict";
import * as crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { createContext, Script } from "node:vm";
import ts from "typescript";
import * as guards from "../lib/btcpostage/shipping-guard";
import { standardShippingSelection } from "../lib/shipping/policy";
import type { BtcpostageLabelPublic } from "../lib/btcpostage/types";
import type { Order } from "../lib/orders/types";

type ExternalInput = { orderId: string; externalReceipt: string; confirmRecorded: boolean };
type RecordInput = { orderId: string; trackingNumber: string; carrier: string; recipientHash: string; recipientEmail: string; externalReceipt: string };
type ExternalFlow = { recordExternalFulfillmentTrackingEmail(input: ExternalInput): Promise<Record<string, unknown>> };
type ExternalStore = { recordExternallySentTrackingNotification(input: RecordInput): Promise<void>; finishTrackingNotification(orderId: string): Promise<void> };
let checks = 0;
const plain = (value: unknown) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
function eq(actual: unknown, expected: unknown, note: string) { assert.deepEqual(plain(actual), plain(expected), note); checks++; }
function ok(actual: unknown, note: string) { assert(actual, note); checks++; }
async function reject(action: () => Promise<unknown>, note: string) { await assert.rejects(action, () => true, note); checks++; }
const digest = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
function load<T>(file: string, dependencies: Record<string, unknown>, env: Record<string, string | undefined> = {}): T {
  const code = ts.transpileModule(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const output = {};
  const run = new Script(`(function(require,module,exports){${code}\n})`).runInContext(createContext({ console, Error, Date, URL, process: { env } }));
  run((name: string) => { assert(name in dependencies, `Unmocked dependency ${name}`); return dependencies[name]; }, { exports: output }, output);
  return output as T;
}
function fixture() {
  const order = { orderId: "OFFLINE-EXTERNAL-RECORD", email: "owner-test@example.invalid", status: "paid",
    shipping: { firstName: "OFFLINE", lastName: "ONLY", address: "1000 Offline Test Loop", city: "Fixture City", state: "AZ", zip: "85016", country: "US", selection: standardShippingSelection() },
    trackingNumber: null, trackingCarrier: null } as unknown as Order;
  const label = { pslOrderId: order.orderId, btcpOrderId: "OFFLINE-PURCHASE", purchaseStatus: "purchased", testMode: false, isRealShipment: true, trackingNumber: "OFFLINE-NOT-A-SHIPMENT", carrier: "usps", service: "GroundAdvantage" } as BtcpostageLabelPublic;
  let orderExists = true, labelExists = true, blocked = false, storeFails = false, manualTest = false;
  const records: RecordInput[] = [], calls: string[] = [];
  const forbidden = async () => { calls.push("FORBIDDEN-PROVIDER-OR-MAIL"); throw new Error("No provider or mail allowed"); };
  const flow = load<ExternalFlow>("lib/fulfillment/shipping-flow.ts", {
    "node:crypto": crypto, "@/lib/orders/store": { getOrder: async () => orderExists ? structuredClone(order) : null },
    "@/lib/btcpostage/config": { getBtcpostagePublicConfig: () => ({ configured: false, testMode: false }), getBtcpostageFromAddress: forbidden },
    "@/lib/btcpostage/service": { getOrderLabelPublic: async () => labelExists ? structuredClone(label) : null, getOrderRates: forbidden, verifyOrderAddress: forbidden, buyOrderLabel: forbidden },
    "@/lib/btcpostage/store": { getBtcpostageLabel: forbidden }, "@/lib/btcpostage/client": { getRates: forbidden },
    "@/lib/btcpostage/shipping-guard": guards, "@/lib/shipping/policy": {}, "@/lib/shipping/request": {}, "./store": {},
    "./shipping-flow-store": { privateDigest: digest, shippingPaymentBlocked: async () => blocked,
      recordExternallySentTrackingNotification: async (input: RecordInput) => { if (storeFails) throw new Error("Offline store failure"); records.push(input); },
      getTrackingNotification: async () => ({ status: "sent", lastError: null }), saveTrackingAndQueue: forbidden,
    }, "./tracking-notification": { dispatchTrackingNotification: forbidden }, "@/lib/db/sql": { getManualFulfillmentTestScope: () => manualTest ? {} : null },
  });
  return { order, label, records, calls, flow, setMissingOrder: () => { orderExists = false; }, setMissingLabel: () => { labelExists = false; },
    setBlocked: () => { blocked = true; }, setStoreFailure: () => { storeFails = true; }, setManualTest: () => { manualTest = true; } };
}
const valid: ExternalInput = { orderId: "OFFLINE-EXTERNAL-RECORD", externalReceipt: "gmail:OFFLINE-123@example.invalid", confirmRecorded: true };

async function main() {
  const originalFetch = globalThis.fetch;
  let networkCalls = 0;
  globalThis.fetch = async () => { networkCalls++; throw new Error("Network forbidden"); };
  try {
    for (const externalReceipt of [valid.externalReceipt, "manual/email-ID_5@example.invalid", "A".repeat(150)]) {
      const h = fixture(), reply = await h.flow.recordExternalFulfillmentTrackingEmail({ ...valid, externalReceipt });
      eq(h.records, [{ orderId: h.order.orderId, trackingNumber: h.label.trackingNumber, carrier: "USPS", recipientHash: digest(h.order.email), recipientEmail: h.order.email, externalReceipt }], "Flow binds recorded email to actual saved order, label, recipient and receipt");
      eq(reply.ok, true, "Recording returns successful fulfillment result");
      eq(reply.trackingSaved, true, "Recording reports saved tracking");
      eq(reply.notification, { status: "sent", lastError: null }, "Recorded external delivery reports sent");
      eq(reply.testMode, false, "Recorded delivery never pretends test postage is real");
      eq(h.calls, [], "Recording never buys, verifies, quotes, dispatches mail, or asks for a sender");
    }
    const noConfirm = fixture();
    for (const confirmRecorded of [false, undefined, "true", 1]) await reject(() => noConfirm.flow.recordExternalFulfillmentTrackingEmail({ ...valid, confirmRecorded } as ExternalInput), "Only explicit boolean confirmation can record delivery");
    eq(noConfirm.records, [], "Missing confirmation never mutates store");
    for (const externalReceipt of ["", "  ", "A".repeat(151), "bad receipt", "-starts-with-symbol", "/starts-with-slash", "bad\nreceipt", "bad\0receipt", "bad?receipt", "bad#receipt", "bad\\receipt"]) {
      const h = fixture(); await reject(() => h.flow.recordExternalFulfillmentTrackingEmail({ ...valid, externalReceipt }), "Malformed or oversized receipt rejected");
      eq(h.records.length, 0, "Invalid receipt never reaches durable recording");
    }
    for (const externalReceipt of [undefined, null, 123, { receipt: "OFFLINE" }]) {
      const h = fixture(); await reject(() => h.flow.recordExternalFulfillmentTrackingEmail({ ...valid, externalReceipt } as unknown as ExternalInput), "Receipt cannot be coerced from a non-string value");
      eq(h.records.length, 0, "Non-string receipt never reaches durable recording");
    }
    const invalidCases: Array<[string, (h: ReturnType<typeof fixture>) => void]> = [
      ["missing order", h => h.setMissingOrder()], ["missing label", h => h.setMissingLabel()], ["payment reconciliation blocked", h => h.setBlocked()],
      ...["none", "failed", "purchasing", "needs_review"].map(status => [`label status ${status}`, (h: ReturnType<typeof fixture>) => { h.label.purchaseStatus = status as BtcpostageLabelPublic["purchaseStatus"]; }] as [string, (h: ReturnType<typeof fixture>) => void]),
      ["test label", h => { h.label.testMode = true; }], ["non-real label", h => { h.label.isRealShipment = false; }],
      ["private manual test scope", h => { h.setManualTest(); }],
      ...["pending", "cancelled", "failed"].map(status => [`order status ${status}`, (h: ReturnType<typeof fixture>) => { h.order.status = status as Order["status"]; }] as [string, (h: ReturnType<typeof fixture>) => void]),
      ...[null, "", "   ", "X".repeat(65)].map(tracking => [`invalid tracking ${JSON.stringify(tracking)}`, (h: ReturnType<typeof fixture>) => { h.label.trackingNumber = tracking; }] as [string, (h: ReturnType<typeof fixture>) => void]),
      ["wrong service", h => { h.label.service = "Priority"; }], ["wrong carrier", h => { h.label.carrier = "UPS"; }],
      ["missing label carrier", h => { h.label.carrier = null; }], ["missing label service", h => { h.label.service = null; }],
      ["different label order", h => { h.label.pslOrderId = "OTHER-OFFLINE-ORDER"; }], ["missing purchase ID", h => { h.label.btcpOrderId = null; }],
      ["different returned order", h => { h.order.orderId = "OTHER-OFFLINE-ORDER"; }],
      ["blank purchase ID", h => { h.label.btcpOrderId = "   "; }],
      ["conflicting saved order tracking", h => { h.order.trackingNumber = "OTHER-OFFLINE-TRACKING"; }],
      ["conflicting saved order carrier", h => { h.order.trackingCarrier = "UPS"; }],
      ["empty saved provider code", h => { h.order.shipping.selection!.providerServiceCode = ""; }],
      ["missing customer email", h => { h.order.email = ""; }], ["invalid customer email", h => { h.order.email = "not-an-email"; }],
    ];
    for (const [note, change] of invalidCases) {
      const h = fixture(); change(h);
      await reject(() => h.flow.recordExternalFulfillmentTrackingEmail(valid), note);
      eq(h.records.length, 0, `${note} cannot mark a notification sent`);
      eq(h.calls, [], `${note} never invokes provider or mail`);
    }
    const shipped = fixture(); shipped.order.status = "shipped";
    await shipped.flow.recordExternalFulfillmentTrackingEmail(valid); eq(shipped.records.length, 1, "Paid or shipped order may record an existing external email");
    const historical = fixture(); delete historical.order.shipping.selection;
    await historical.flow.recordExternalFulfillmentTrackingEmail(valid);
    eq(historical.records.length, 1, "Historical absent selection can record already sent evidence for its order-bound real purchase without buying or sending");
    eq(historical.calls, [], "Historical recording does not bypass quote requirements by purchasing anything");
    const matching = fixture(); matching.order.trackingNumber = matching.label.trackingNumber; matching.order.trackingCarrier = "USPS";
    await matching.flow.recordExternalFulfillmentTrackingEmail(valid); eq(matching.records.length, 1, "Existing matching tracking remains recordable");
    const brokenStore = fixture(); brokenStore.setStoreFailure();
    await reject(() => brokenStore.flow.recordExternalFulfillmentTrackingEmail(valid), "Persistence failure does not return success");
    eq(brokenStore.calls, [], "Persistence failure does not trigger fallback mail or purchase");

    const json = (data: unknown, init?: { status?: number; headers?: HeadersInit }) => ({ data, status: init?.status ?? 200, headers: new Headers(init?.headers) });
    let forwarded: unknown, invoked = 0;
    const api = (authorized = true) => load<typeof import("../app/api/admin/fulfillment-shipping/route")>("app/api/admin/fulfillment-shipping/route.ts", {
      "next/server": { NextResponse: { json } }, "@/lib/admin/require-auth": { requireAdminAuth: async () => authorized ? null : json({ error: "Unauthorized" }, { status: 401 }) },
      "@/lib/fulfillment/shipping-flow": { recordExternalFulfillmentTrackingEmail: async (input: unknown) => { invoked++; forwarded = input; return { ok: true }; } },
    });
    const request = (body: unknown, origin = "https://psllabs.org") => new Request("https://psllabs.org/api/admin/fulfillment-shipping", {
      method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const payload = { ...valid, action: "record_external_email", orderId: ` ${valid.orderId} `, recipientEmail: "other@example.invalid", trackingNumber: "OTHER", carrier: "UPS", testMode: false };
    const unauthorized = await api(false).POST(request(payload));
    eq(unauthorized.status, 401, "Recording API requires admin login"); eq(unauthorized.headers.get("Cache-Control"), "private, no-store", "Unauthorized result is private");
    eq((await api().POST(request(payload, "https://evil.invalid"))).status, 403, "Cross-origin recording rejected");
    eq(invoked, 0, "Denied API requests invoke no recording");
    const accepted = await api().POST(request(payload));
    eq(accepted.status, 200, "Authorized same-origin recording accepted");
    eq(forwarded, valid, "API forwards only trimmed order ID, receipt and boolean confirmation");
    eq(accepted.headers.get("Cache-Control"), "private, no-store", "Recording response is private");
    await api().POST(request({ ...payload, confirmRecorded: "true", externalReceipt: 123 }));
    eq(forwarded, { orderId: valid.orderId, externalReceipt: "", confirmRecorded: false }, "API does not coerce truthy confirmation or non-string receipt");

    const statements: Array<{ query: string; values: unknown[] }> = [];
    let updateAllowed = true;
    const sql = async (parts: TemplateStringsArray, ...values: unknown[]) => {
      const query = parts.reduce((text, part, i) => text + (i ? `$${i}` : "") + part, "");
      statements.push({ query, values });
      return query.includes("WITH ") && updateAllowed ? [{ order_id: valid.orderId }] : [];
    };
    const store = load<ExternalStore>("lib/fulfillment/shipping-flow-store.ts", {
      "node:crypto": crypto, "@/lib/db/sql": { getSql: () => sql, ensureSqlSchema: async () => undefined },
      "@/lib/orders/store": { ensureOrdersSchema: async () => undefined }, "@/lib/finance/schema": { ensureFinanceSchema: async () => undefined },
    });
    const record: RecordInput = { orderId: valid.orderId, trackingNumber: "OFFLINE-NOT-A-SHIPMENT", carrier: "USPS", recipientHash: digest("owner-test@example.invalid"), recipientEmail: "owner-test@example.invalid", externalReceipt: valid.externalReceipt };
    await store.recordExternallySentTrackingNotification(record);
    eq(statements.length, 1, "External recording uses one atomic SQL statement");
    const normalized = statements[0].query.replace(/\s+/g, " ");
    for (const [condition, note] of [
      [/status IN \('paid', 'shipped'\)/, "Requires paid or shipped order"],
      [/tracking_number IS NULL.*tracking_number = \$/, "Tracking must be absent or match saved label"],
      [/tracking_carrier IS NULL.*tracking_carrier = \$/, "Carrier must be absent or match saved label"],
      [/lower\(trim\((?:o\.)?email\)\) = \$/, "Binds actual normalized order email"],
      [/recipient_hash/, "Binds recipient identity to notification"],
      [/ON CONFLICT\s*\(order_id\)/, "Per-order conflict is idempotent"],
      [/fulfillment_tracking_outbox\.tracking_number = EXCLUDED\.tracking_number/, "Conflicting tracking cannot be overwritten"],
      [/fulfillment_tracking_outbox\.recipient_hash = EXCLUDED\.recipient_hash/, "Conflicting recipient cannot be overwritten"],
      [/fulfillment_tracking_outbox\.carrier = EXCLUDED\.carrier/, "Conflicting carrier cannot be overwritten"],
      [/'pending'.*'sent'|'sent'.*'pending'/, "Only pending or already sent notification may be recorded"],
      [/tracking_email_sent = true/, "Order notification flag is saved atomically"],
      [/l\.purchase_status = 'purchased' AND l\.test_mode = false/, "Database rechecks purchased real label"],
      [/l\.tracking_number = \$.*upper\(trim\(l\.carrier\)\) = \$/, "Database rechecks exact label tracking and normalized carrier"],
      [/FOR UPDATE OF o/, "Eligible order is locked before recording"],
      [/WHERE order_id IN \(SELECT order_id FROM recorded\)/, "Only a successfully recorded outbox row updates the order"],
      [/external_receipt = COALESCE\(fulfillment_tracking_outbox\.external_receipt, EXCLUDED\.external_receipt\)/, "An idempotent record preserves earlier evidence"],
    ] as const) ok(condition.test(normalized), note);
    ok(statements[0].values.includes(valid.externalReceipt), "External receipt is parameterized and persisted");
    ok(!normalized.includes(valid.externalReceipt) && !normalized.includes(record.recipientEmail), "SQL never interpolates receipt or recipient into source");
    ok(/sending|needs_review/.test(normalized) || /status IN \('pending', 'sent'\)/.test(normalized), "Active or uncertain send cannot be overwritten");
    updateAllowed = false;
    await reject(() => store.recordExternallySentTrackingNotification(record), "No affected order surfaces conflict rather than false success");
    const count = statements.length;
    for (const receipt of ["", "bad receipt", "A".repeat(151)]) await reject(() => store.recordExternallySentTrackingNotification({ ...record, externalReceipt: receipt }), "Store independently rejects invalid evidence");
    eq(statements.length, count, "Malformed receipts do not execute any store statement");
    await store.finishTrackingNotification(record.orderId);
    const finishSql = statements.at(-1)!.query.replace(/\s+/g, " ");
    ok(/WITH eligible AS \( SELECT order_id FROM orders WHERE order_id = \$1 FOR UPDATE \), sent AS/.test(finishSql), "SMTP completion locks the order before its outbox to match external recording");
    ok(/WHERE order_id IN \(SELECT order_id FROM eligible\) AND status = 'sending'/.test(finishSql), "Outbox finalization depends on the acquired order lock and exclusive sending claim");
    ok(/WHERE order_id IN \(SELECT order_id FROM sent\)/.test(finishSql), "Only finalized sends update the order notification flag");
    eq(networkCalls, 0, "All regression checks remained offline");
    console.log(`PASS: ${checks} external tracking-email flow, API and atomic-store guard checks. No database, provider or SMTP calls.`);
  } finally { globalThis.fetch = originalFetch; }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
