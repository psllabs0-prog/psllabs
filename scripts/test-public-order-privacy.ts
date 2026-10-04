/**
 * Offline public-order privacy regression. Executes the actual serializer,
 * status route, success page, and status component with synthetic persistence.
 * Unknown imports and every network request fail closed. No customer data,
 * database connection, live provider request, or secret is used.
 * Run: npx tsx scripts/test-public-order-privacy.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createContext, Script } from "node:vm";
import { NextResponse } from "next/server";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as jsxRuntime from "react/jsx-runtime";
import ts from "typescript";
import { toPublicOrder, type Order, type OrderStatus, type PublicOrder } from "../lib/orders/types";

const PRIVATE_CANARY = "PRIVATE_CUSTOMER_PAYMENT_ATTRIBUTION_CANARY";
const ROOT = resolve(__dirname, "..");
const PUBLIC_KEYS = ["orderId", "createdAt", "status", "currency", "items", "subtotal", "discountCode", "discountAmount", "shippingCost", "total"].sort();
const ITEM_KEYS = ["handle", "name", "strength", "quantity", "unitPrice", "lineTotal"].sort();
let checks = 0;
let networkAttempts = 0;

function check(actual: unknown, expected: unknown, label: string) {
  assert.deepEqual(actual, expected, label);
  checks++;
}
function excludesPrivate(value: unknown, label: string) {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  check(serialized.includes(PRIVATE_CANARY), false, `${label}: no private fixture values`);
}
function fixture(status: OrderStatus = "paid"): Order {
  return {
    orderId: "psl_public_fixture", createdAt: "2026-10-04T00:00:00.000Z", updatedAt: PRIVATE_CANARY,
    status, currency: "USD", email: `${PRIVATE_CANARY}@example.invalid`,
    shipping: { firstName: PRIVATE_CANARY, lastName: PRIVATE_CANARY, address: PRIVATE_CANARY, city: PRIVATE_CANARY, state: PRIVATE_CANARY, zip: PRIVATE_CANARY, country: PRIVATE_CANARY },
    items: [{ handle: "fixture-product", name: "Fixture product", strength: "10 mg", quantity: 2, unitPrice: 59.99, lineTotal: 119.98 }],
    subtotal: 119.98, discountCode: null, discountAmount: 0, taxRate: 0, tax: 0, shippingCost: 9.99, total: 129.97,
    invoiceId: PRIVATE_CANARY, invoiceCreatedAt: PRIVATE_CANARY, paidAt: PRIVATE_CANARY, shippedAt: PRIVATE_CANARY,
    trackingNumber: PRIVATE_CANARY, trackingCarrier: PRIVATE_CANARY, paymentMethod: "card",
    emailSent: true, emailError: PRIVATE_CANARY, customerEmailSent: true, customerEmailError: PRIVATE_CANARY,
    feedbackEmailSent: false, trackingEmailSent: false, trackingSavedAt: PRIVATE_CANARY, deliveryFollowupSent: false,
    stockDecremented: true,
    attribution: {
      firstPaid: null, lastPaid: null, lastEmail: null, utmSource: PRIVATE_CANARY, utmMedium: PRIVATE_CANARY,
      utmCampaign: PRIVATE_CANARY, utmContent: PRIVATE_CANARY, utmTerm: PRIVATE_CANARY, gclid: PRIVATE_CANARY,
      fbclid: PRIVATE_CANARY, ttclid: PRIVATE_CANARY, msclkid: PRIVATE_CANARY, oppref: PRIVATE_CANARY,
      landingPage: PRIVATE_CANARY, referrer: PRIVATE_CANARY,
      firstPaidTouchAt: PRIVATE_CANARY, lastPaidTouchAt: PRIVATE_CANARY,
    },
  };
}
function adversarialFixture(status: OrderStatus = "paid"): Order {
  const order = fixture(status);
  Object.assign(order, {
    customerName: PRIVATE_CANARY, customer: { email: PRIVATE_CANARY },
    card: { pan: PRIVATE_CANARY, cvc: PRIVATE_CANARY },
    openaiAdsDelivery: { event: PRIVATE_CANARY, proof: { paymentId: PRIVATE_CANARY } },
    futureInternalField: { secret: PRIVATE_CANARY },
  });
  Object.assign(order.items[0], {
    email: PRIVATE_CANARY, shipping: order.shipping, invoiceId: PRIVATE_CANARY,
    internalAttribution: { oppref: PRIVATE_CANARY }, futureInternalField: PRIVATE_CANARY,
  });
  Object.assign(order.attribution!, { openaiAdsDelivery: { proof: { provider: "tagada", paymentId: PRIVATE_CANARY } } });
  return order;
}
type StatusProps = { orderId: string; initialOrder: PublicOrder | null };
type StatusComponent = (props: StatusProps) => React.ReactNode;
type Page = (props: { searchParams: Promise<{ orderId?: string }> }) => Promise<React.ReactNode>;
type Route = { GET: (request: Request) => Promise<Response> };

function harness(order: Order | null, failure = false) {
  let capturedProps: StatusProps | undefined;
  const reads: string[] = [];
  const modules = new Map<string, Record<string, unknown>>();
  const context = createContext({
    Request, Response, URL, Headers,
    console: { error() {} },
    fetch: async () => { networkAttempts++; throw new Error("Network is forbidden in public-order privacy tests"); },
  });
  const mocks: Record<string, Record<string, unknown>> = {
    "react": React,
    "react/jsx-runtime": jsxRuntime,
    "next/server": { NextResponse },
    "next/link": {
      __esModule: true,
      default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => React.createElement("a", { ...props, href }, children),
    },
    "@/lib/seo": { createPageMetadata: () => ({}) },
    "@/lib/orders/types": { toPublicOrder },
    "@/lib/orders/store": {
      getOrder: async (id: string) => {
        reads.push(id);
        if (failure) throw new Error(PRIVATE_CANARY);
        return order;
      },
    },
    "@/components/success/customer-feedback-card": { CustomerFeedbackCard: () => null },
    "@/components/success/order-status": {
      OrderStatus: (props: StatusProps) => {
        capturedProps = props;
        return React.createElement(load("status").OrderStatus as StatusComponent, props);
      },
    },
  };
  const sources: Record<string, string> = {
    route: "app/api/order-status/route.ts", page: "app/success/page.tsx", status: "components/success/order-status.tsx",
  };
  function load(id: string): Record<string, unknown> {
    if (mocks[id]) return mocks[id];
    const cached = modules.get(id);
    if (cached) return cached;
    const source = sources[id];
    assert(source, `Offline public-order loader rejected unknown dependency: ${id}`);
    const filename = resolve(ROOT, source);
    const compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
      fileName: filename,
    }).outputText;
    const output: Record<string, unknown> = {};
    modules.set(id, output);
    const run = new Script(`(function(require, module, exports) {\n${compiled}\n})`, { filename })
      .runInContext(context) as (require: typeof load, module: { exports: Record<string, unknown> }, exports: Record<string, unknown>) => void;
    const loaded = { exports: output };
    run(load, loaded, output);
    return loaded.exports;
  }
  return {
    route: load("route") as Route,
    page: load("page").default as Page,
    reads,
    captured: () => capturedProps,
  };
}
function request(orderId?: string) {
  return new Request(`https://fixture.invalid/api/order-status${orderId ? `?orderId=${encodeURIComponent(orderId)}` : ""}`);
}

async function main() {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => { networkAttempts++; throw new Error("Network is forbidden in public-order privacy tests"); };
  try {
    for (const status of ["pending", "paid", "shipped", "cancelled", "failed"] as const) {
      const privateOrder = adversarialFixture(status);
      const before = JSON.stringify(privateOrder);
      const summary = toPublicOrder(privateOrder);
      check(Object.keys(summary).sort(), PUBLIC_KEYS, `${status}: public order is an explicit subset`);
      check(Object.keys(summary.items[0]).sort(), ITEM_KEYS, `${status}: nested items are an explicit subset`);
      excludesPrivate(summary, `${status}: serializer`);
      check(summary.status, status, `${status}: useful status survives`);
      check(summary.total, 129.97, `${status}: useful price survives`);
      check(summary.items[0].quantity, 2, `${status}: useful quantity survives`);
      check(JSON.stringify(privateOrder), before, `${status}: private record is unchanged`);

      const h = harness(privateOrder);
      const response = await h.route.GET(request(privateOrder.orderId));
      const body = await response.json();
      check(response.status, 200, `${status}: API is still usable`);
      check(response.headers.get("cache-control"), "no-store", `${status}: API cannot cache order responses`);
      check(body, { order: summary }, `${status}: real API uses the safe serializer`);
      excludesPrivate(body, `${status}: real API`);

      const pageElement = await h.page({ searchParams: Promise.resolve({ orderId: privateOrder.orderId }) });
      const html = renderToStaticMarkup(pageElement);
      check(h.captured()?.initialOrder, summary, `${status}: success page serializes the same safe subset to its client component`);
      excludesPrivate(h.captured(), `${status}: success-page client props`);
      excludesPrivate(html, `${status}: rendered success page`);
      check(html.includes("Shipping details are included in your order confirmation email."), true, `${status}: useful shipping guidance remains`);
      check(html.includes("Shipping to"), false, `${status}: address block is removed`);
      check(html.includes("Fixture product"), true, `${status}: product summary still renders`);
      check(h.reads, [privateOrder.orderId, privateOrder.orderId], `${status}: API and page query only their explicit fixture reference`);
    }

    const untouchedPrivateFields = adversarialFixture();
    for (const key of ["shipping", "email", "invoiceId", "attribution", "card", "futureInternalField"]) {
      Object.defineProperty(untouchedPrivateFields, key, { get() { throw new Error(`Serializer accessed private ${key}`); } });
    }
    excludesPrivate(toPublicOrder(untouchedPrivateFields), "serializer never reads private fields or unknown extensions");

    const missingId = harness(adversarialFixture());
    check((await missingId.route.GET(request())).status, 400, "missing API reference remains rejected");
    check(missingId.reads, [], "missing API reference does not query persistence");
    const noReferenceHtml = renderToStaticMarkup(await missingId.page({ searchParams: Promise.resolve({}) }));
    excludesPrivate(noReferenceHtml, "no-reference success page");
    check(missingId.reads, [], "no-reference success page does not query persistence");

    const absent = harness(null);
    const missingResponse = await absent.route.GET(request("psl_absent_fixture"));
    check(missingResponse.status, 404, "unknown order remains missing");
    excludesPrivate(await missingResponse.text(), "missing API response");
    const absentHtml = renderToStaticMarkup(await absent.page({ searchParams: Promise.resolve({ orderId: "psl_absent_fixture" }) }));
    check(absent.captured()?.initialOrder, null, "missing success page exposes no private order");
    excludesPrivate(absentHtml, "missing success page");

    const failed = harness(adversarialFixture(), true);
    const failedResponse = await failed.route.GET(request("psl_error_fixture"));
    check(failedResponse.status, 500, "lookup error remains handled");
    excludesPrivate(await failedResponse.text(), "lookup error response does not expose internal exception");
    const failedHtml = renderToStaticMarkup(await failed.page({ searchParams: Promise.resolve({ orderId: "psl_error_fixture" }) }));
    check(failed.captured()?.initialOrder, null, "failed lookup cannot serialize a private order");
    excludesPrivate(failedHtml, "failed success page");
    check(networkAttempts, 0, "all privacy checks complete without any network request");
  } finally {
    globalThis.fetch = previousFetch;
  }
  console.log(`Public order privacy: ${checks} offline checks passed.`);
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
