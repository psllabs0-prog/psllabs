/** Actual checkout preparation with real catalog/totals, fixture stock, and no database or provider calls. */
import assert from "node:assert/strict";
import * as crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createContext, Script } from "node:vm";
import ts from "typescript";
import { NextResponse } from "next/server";
import * as pricing from "../lib/payments/products";
import * as catalog from "../lib/products/catalog";
import * as totals from "../lib/checkout/totals";
import * as countries from "../lib/checkout/us-states";
import * as attribution from "../lib/attribution/logic";
import * as referralLogic from "../lib/partners/referral-logic";
import * as shippingPolicy from "../lib/shipping/policy";
import * as shippingRequest from "../lib/shipping/request";
import type { CheckoutBody, PrepareOrderOptions, PrepareOrderResult } from "../lib/checkout/prepare-order";
import type { Order } from "../lib/orders/types";
import { PRIVACY_CONSENT_VERSION, UNKNOWN_PRIVACY_CONSENT } from "../lib/privacy/types";

const ROOT = resolve(__dirname, "..");
const SHIPPING = { firstName: "Offline", lastName: "Fixture", address: "123 Fixture Street", city: "Phoenix", state: "AZ", zip: "85001", country: "US" };
const ACTIVE = catalog.getActiveCatalogProducts();
let checks = 0;
let reservations = 0;
let schemaCalls = 0;
let databaseCalls = 0;
let referralCalls = 0;
let allowReferralFixtures = false;
let referralPercent: 0 | 10 = 10;
const vmEnv: Record<string, string | undefined> = {};
const orders: Order[] = [];

function load(file: string, mocks: Record<string, unknown>): Record<string, unknown> {
  const filename = resolve(ROOT, file);
  const compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const context = createContext({ console: { error() {} }, Date, URL, process: { env: vmEnv } });
  const output: Record<string, unknown> = {};
  const evaluate = new Script(`(function(require,module,exports){${compiled}\n})`, { filename }).runInContext(context);
  evaluate((id: string) => { assert(id in mocks, `Offline loader rejected ${id}`); return mocks[id]; }, { exports: output }, output);
  return output;
}

const prepare = load("lib/checkout/prepare-order.ts", {
  "@/lib/shipping/policy": shippingPolicy,
  "@/lib/shipping/request": shippingRequest,
  "node:crypto": crypto, "@/lib/checkout/totals": totals, "@/lib/checkout/us-states": countries,
  "@/lib/attribution/logic": attribution, "@/lib/payments/products": pricing, "@/lib/products/catalog": catalog,
  "@/lib/checkout/discount-codes": { DISCOUNT_CODES_ENABLED: false, lookupActiveDiscountCode: async () => { throw new Error("Unexpected discount lookup"); } },
  "@/lib/partners/referral-logic": referralLogic,
  "@/lib/orders/store": { markStatusIfPending: async () => {} },
  "@/lib/partners/referral-config": { referralCodesEnabled: () => { referralCalls++; if (allowReferralFixtures) return true;
    throw new Error("Unexpected referral configuration lookup in ordinary checkout"); } },
  "@/lib/partners/referral-store": {
    lookupReferralDiscount: async () => { referralCalls++; if (allowReferralFixtures) return { code: "fixture-lab-1234abcd", percent: referralPercent };
      throw new Error("Unexpected referral lookup in ordinary checkout"); },
    reserveReferralOrder: async (order: Order) => { referralCalls++; if (allowReferralFixtures) { reservations++; orders.push(structuredClone(order)); return { ok: true }; }
      throw new Error("Unexpected referral reservation in ordinary checkout"); },
  },
  "@/lib/inventory/store": {
    ensureInventorySchema: async () => { schemaCalls++; if (allowReferralFixtures) return;
      throw new Error("Unexpected schema bootstrap in ordinary checkout fixture"); },
    checkoutWithStockCheck: async (order: Order) => {
      reservations++; orders.push(structuredClone(order));
      // Ten units exist for each product. The old per-line stock check would
      // accept duplicate 10+10 lines; rejection must precede this boundary.
      return order.items.every(item => item.quantity <= 10) ? { ok: true } : { ok: false, error: "Insufficient stock" };
    },
  },
}) as { prepareReservedOrder: (body: CheckoutBody, options?: PrepareOrderOptions) => Promise<PrepareOrderResult> };
const inventory = load("lib/inventory/store.ts", {
  "@/lib/db/sql": { getSql: () => { databaseCalls++; throw new Error("Database access forbidden"); } },
  "@/lib/orders/store": { ensureOrdersSchema: async () => { schemaCalls++; throw new Error("Schema writes forbidden"); } },
  "@/lib/products/catalog": catalog,
  "./constants": { INVOICE_EXPIRY_MINUTES: 15, PENDING_GRACE_MINUTES: 5, LOW_STOCK_THRESHOLD: 15, availabilityToStockStatus: () => "in_stock" },
}) as { checkoutWithStockCheck: (order: Order) => Promise<{ ok: boolean }> };

async function checkoutPrivacyChecks() {
  const binding = { digest: "a".repeat(64), version: PRIVACY_CONSENT_VERSION, revision: 1 };
  const privacy = { binding, consent: { ...UNKNOWN_PRIVACY_CONSENT,
    choice: "saved" as const, measurement: true, revision: 1,
    expiresAt: Date.now() + 600000,
    capabilities: { ...UNKNOWN_PRIVACY_CONSENT.capabilities, googleMeasurement: true },
  } };
  const touch = { utmSource: "google", utmMedium: "cpc", utmCampaign: "fixture",
    landingPage: "/products?fbclid=forbidden#private", referrer: "https://referrer.invalid/?ttclid=forbidden",
    capturedAt: new Date().toISOString(), gclid: "google_fixture", fbclid: "meta_fixture",
    ttclid: "tiktok_fixture", msclkid: "bing_fixture", oppref: "openai_fixture" };
  const body = { email: "fixture@example.invalid", shipping: SHIPPING,
    items: [{ handle: ACTIVE[0].handle, quantity: 1 }], attribution: {
      ...touch, firstPaid: touch, lastPaid: touch,
      googleAdsMeasurementConsent: true, openaiAdsMeasurementOptOut: false,
      privacyConsent: { digest: "forged", revision: 99, version: 99 },
    } };
  for (const context of [null, undefined, { ...privacy, binding: null },
    { ...privacy, consent: { ...privacy.consent, gpc: true } },
    { ...privacy, consent: { ...privacy.consent, admin: true } },
    { ...privacy, consent: { ...privacy.consent, measurement: false } },
    { ...privacy, consent: { ...privacy.consent, expiresAt: Date.now() - 1 } },
    { ...privacy, binding: { ...binding, revision: 2 } },
  ]) {
    const result = await prepare.prepareReservedOrder(body, { paymentMethod: "card", privacyConsent: context });
    assert(result.ok, "shopping remains available without optional consent");
    assert.equal(result.order.attribution, null, "body flags and fake receipt cannot authorize attribution"); checks += 2;
  }
  const result = await prepare.prepareReservedOrder(body, { paymentMethod: "card", privacyConsent: privacy });
  assert(result.ok); const saved = result.order.attribution!;
  assert.deepEqual(structuredClone(saved.privacyConsent), binding);
  assert.equal(saved.googleAdsMeasurementConsent, true); assert.equal(saved.openaiAdsMeasurementOptOut, true);
  for (const snapshot of [saved, saved.firstPaid!, saved.lastPaid!]) {
    assert.equal(snapshot.gclid, "google_fixture");
    for (const key of ["fbclid", "ttclid", "msclkid", "oppref"] as const) assert.equal(snapshot[key], null);
    assert.equal(snapshot.landingPage, "/products"); assert.equal(snapshot.referrer, "https://referrer.invalid/");
  }
  assert(!JSON.stringify(saved).includes("forged")); assert(!JSON.stringify(saved).includes("forbidden")); checks += 27;

  // Execute both actual checkout routes with consent storage failure and fixture-only payment effects.
  for (const filename of ["app/api/checkout/route.ts", "app/api/checkout/card/session/route.ts"]) {
    for (const consentFails of [false, true]) {
      let reads = 0; let shippingBindings = 0;
      const route = load(filename, {
        "next/server": { NextResponse }, "@/lib/checkout/prepare-order": prepare,
        "@/lib/checkout/us-states": countries,
        "@/lib/privacy/server": { readRequestPrivacyConsent: async (request: Request) => {
          reads++; assert.equal(request.headers.get("Sec-GPC"), "1");
          if (consentFails) throw new Error("offline consent storage unavailable");
          return { ...privacy, binding: null, consent: { ...privacy.consent, gpc: true, measurement: false } };
        } },
        "@/lib/orders/store": { setInvoiceId: async () => {}, setPaymentMethod: async () => {},
          setOrderShippingSelection: async (_id: string, selection: { tagadaShippingRateId: string }) => {
            assert.equal(selection.tagadaShippingRateId, "ship_fixture"); shippingBindings++;
          } },
        "@/lib/payments": { getPaymentProcessor: () => ({ createInvoice: async () => ({ id: "invoice_fixture", url: "https://checkout.example.invalid" }) }) },
        "@/lib/tagada": { isTagadaConfigured: () => true, getTagadaIdsForHandle: async () => ({ tagadaVariantId: "variant_fixture" }) },
        "@/lib/tagada/server": { createTagadaCheckoutSession: async () => ({ checkoutToken: "checkout_fixture", sessionToken: "session_fixture" }) },
        "@/lib/partners/referral-logic": referralLogic,
        "@/lib/tagada/referral-checkout": { configuredReferralPromotionCode: () => null,
          configureAndVerifyCardSession: async () => ({ shippingRateId: "ship_fixture" }) },
      }) as { POST: (request: Request) => Promise<Response> };
      const response = await route.POST(new Request("https://fixture.invalid/api/checkout", {
        method: "POST", headers: { "Content-Type": "application/json", "Sec-GPC": "1" }, body: JSON.stringify(body),
      }));
      assert.equal(response.status, 200); assert.equal(reads, 1);
      assert.equal(shippingBindings, filename.includes("card/session") ? 1 : 0); checks++;
      assert.equal(orders.at(-1)!.attribution, null); checks += 3;
    }
  }
}

async function main() {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("Network is forbidden in checkout validation tests"); };
  try {
    await checkoutPrivacyChecks();
    for (const paymentMethod of ["card", "bitcoin"] as const) {
      for (const product of ACTIVE) {
        for (const items of [
          [{ handle: product.handle, quantity: 10 }, { handle: product.handle, quantity: 10 }],
          [{ handle: product.handle, quantity: 1 }, { handle: ` ${product.handle.toUpperCase()} `, quantity: 1 }],
          Array.from({ length: ACTIVE.length + 1 }, () => ({ handle: product.handle, quantity: 1 })),
        ]) {
          const before = reservations;
          const result = await prepare.prepareReservedOrder({ email: "fixture@example.invalid", shipping: SHIPPING, items }, { paymentMethod });
          assert.equal(result.ok, false); if (!result.ok) assert.equal(result.status, 400);
          assert.equal(reservations, before, "invalid duplicate/oversized cart stops before inventory/provider work"); checks += 3;
        }
      }
      const items = ACTIVE.map(product => ({ handle: product.handle, quantity: 10 }));
      const result = await prepare.prepareReservedOrder({ email: "fixture@example.invalid", shipping: SHIPPING, items }, { paymentMethod });
      assert.equal(result.ok, true);
      assert.equal(result.order.items.length, ACTIVE.length);
      assert.deepEqual(structuredClone(result.order.items.map(item => [item.handle, item.quantity, item.unitPrice])), ACTIVE.map(product => [product.handle, 10, product.price]));
      const expected = totals.computeTotals(ACTIVE.reduce((sum, product) => sum + product.price * 10, 0), "AZ", null, { paymentMethod });
      assert.equal(result.order.total, expected.total); assert.equal(result.order.shippingCost, expected.shipping);
      assert.match(result.order.orderId, /^psl_\d+_[a-f0-9]{32}$/); checks += 6;
    }
    const normalized = await prepare.prepareReservedOrder({ email: "fixture@example.invalid", shipping: SHIPPING, items: [{ handle: " RETATRUTIDE ", quantity: 1 }] }, { paymentMethod: "card" });
    assert.equal(normalized.ok, true); if (normalized.ok) assert.equal(normalized.order.items[0].handle, "retatrutide"); checks += 2;
    for (const paymentMethod of ["card", "bitcoin"] as const) {
      for (const currency of ["EUR", "GBP", "BTC", "USDT"]) {
        const before = reservations;
        const result = await prepare.prepareReservedOrder({ email: "fixture@example.invalid", shipping: SHIPPING,
          currency, items: [{ handle: "bpc-157", quantity: 1 }] }, { paymentMethod });
        assert.equal(result.ok, false); if (!result.ok) assert.equal(result.status, 400);
        assert.equal(reservations, before, "non-USD pricing is rejected before order/inventory work"); checks += 3;
      }
      const result = await prepare.prepareReservedOrder({ email: "fixture@example.invalid", shipping: SHIPPING,
        currency: " usd ", items: [{ handle: "bpc-157", quantity: 1 }] }, { paymentMethod });
      assert(result.ok); assert.equal(result.order.currency, "USD"); checks += 2;
    }
    assert.equal(new Set(orders.map(order => order.orderId)).size, orders.length); checks++;
    const before = reservations;
    const malformed = await prepare.prepareReservedOrder(null as unknown as CheckoutBody);
    assert.equal(malformed.ok, false); assert.equal(reservations, before); checks += 2;

    const valid = orders[0];
    for (const items of [
      [valid.items[0], valid.items[0]],
      [valid.items[0], { ...valid.items[0], handle: valid.items[0].handle.toUpperCase() }],
      Array.from({ length: ACTIVE.length + 1 }, () => valid.items[0]),
    ]) {
      assert.equal((await inventory.checkoutWithStockCheck({ ...valid, items })).ok, false);
      assert.equal(schemaCalls, 0); assert.equal(databaseCalls, 0); checks += 3;
    }
    // The database function independently rejects duplicates before acquiring
    // product locks or inserting an order. No PostgreSQL execution is claimed.
    const source = readFileSync(resolve(ROOT, "lib/inventory/store.ts"), "utf8");
    const functionStart = source.indexOf("CREATE OR REPLACE FUNCTION checkout_create_order");
    const guard = source.indexOf("GROUP BY lower(btrim(elem->>'handle')) HAVING count(*) > 1", functionStart);
    assert(guard > functionStart);
    assert(guard < source.indexOf("PERFORM p.handle", functionStart));
    assert(guard < source.indexOf("INSERT INTO orders", functionStart)); checks += 3;
    assert.equal(referralCalls, 0, "ordinary card/Bitcoin checkout never enters referral configuration, lookup, or reservation"); checks++;
    allowReferralFixtures = true;
    const referralBody = { email: "fixture@example.invalid", shipping: SHIPPING, items: [{ handle: "retatrutide", quantity: 1 }], discountCode: "fixture-lab-1234abcd" };
    const beforeCard = reservations;
    const blocked = await prepare.prepareReservedOrder(referralBody, { paymentMethod: "card" });
    assert.equal(blocked.ok, false); if (!blocked.ok) assert.equal(blocked.status, 409);
    assert.equal(reservations, beforeCard, "missing provider discount blocks before any reservation"); checks += 3;
    for (const [method, percent, discountAmount, total] of [
      ["card", 10, 6, 63.98], ["bitcoin", 10, 6, 63.98], ["card", 0, 0, 69.98], ["bitcoin", 0, 3, 66.98],
    ] as const) {
      referralPercent = percent;
      const result = await prepare.prepareReservedOrder(referralBody, { paymentMethod: method, cardReferralPromotionConfigured: true });
      assert(result.ok); assert.equal(result.order.discountCode, "fixture-lab-1234abcd");
      assert.equal(result.order.discountAmount, discountAmount); assert.equal(result.order.total, total);
      assert.equal(result.order.paymentMethod, method); checks += 5;
    }
    referralPercent = 10;
    // Keep the historical half-cent regression independently of catalog prices.
    // PostgreSQL numeric round(369.95 * 10 / 100, 2) expects exactly 37.00.
    assert.equal(totals.computeTotals(369.95, "", { code: "fixture-lab-1234abcd", percent: 10, exclusive: true }, "card").discountAmount, 37); checks++;
    // Current sale prices: 2 × $47.99 plus 3 × $69.99 = $305.95. Its
    // first-order referral reduction is another exact half-cent boundary.
    const boundary = await prepare.prepareReservedOrder({ ...referralBody,
      items: [{ handle: "bpc-157", quantity: 2 }, { handle: "tesamorelin", quantity: 3 }],
    }, { paymentMethod: "card", cardReferralPromotionConfigured: true });
    assert(boundary.ok); assert.equal(boundary.order.subtotal, 305.95);
    assert.equal(boundary.order.discountAmount, 30.60); assert.equal(boundary.order.total, 275.35); checks += 4;
    // Positive decimal amounts have exact integer-cent expectations; exercise
    // both percentage rules across every cent, including their half-cent ties.
    for (let subtotalCents = 1; subtotalCents <= 100000; subtotalCents++) {
      const first = totals.computeTotals(subtotalCents / 100, "", { code: "fixture-lab-1234abcd", percent: 10, exclusive: true }, "card");
      const bitcoin = totals.computeTotals(subtotalCents / 100, "", null, "bitcoin");
      assert.equal(Math.round(first.discountAmount * 100), Math.floor((subtotalCents + 5) / 10));
      assert.equal(Math.round(bitcoin.discountAmount * 100), Math.floor((subtotalCents + 10) / 20));
    }
    checks += 200000;
    vmEnv.PSL_VISUAL_PREVIEW = "1";
    const beforePreview = reservations;
    const preview = await prepare.prepareReservedOrder(referralBody, { paymentMethod: "card", cardReferralPromotionConfigured: true });
    assert.equal(preview.ok, false); if (!preview.ok) assert.equal(preview.status, 503);
    assert.equal(reservations, beforePreview, "preview cannot reserve or persist orders"); checks += 3;
    delete vmEnv.PSL_VISUAL_PREVIEW;
    console.log(`PASS: Checkout validation (${checks} checks; valid card/Bitcoin totals preserved; duplicate 20-vs-10 carts rejected before writes; no database/provider calls).`);
  } finally { globalThis.fetch = previousFetch; }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
