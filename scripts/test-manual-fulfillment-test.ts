/** Actual request-local context/provider guards plus mocked transaction/API boundaries; no network. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createContext, Script } from "node:vm";
import ts from "typescript";
import { types as pgTypes } from "pg";
import { __setSqlClientForTests, ensureSqlSchema, getManualFulfillmentTestScope, getSql, withManualFulfillmentTestSql } from "../lib/db/sql";
import { ensureOrdersSchema } from "../lib/orders/store";
import { isBtcpostageTestMode } from "../lib/btcpostage/config";
import { createPurchase, getRates, verifyAddress } from "../lib/btcpostage/client";
import { shippingFlowConfig } from "../lib/fulfillment/shipping-flow";
import { MANUAL_TEST_ORDER, MANUAL_TEST_PACKAGE, MANUAL_TEST_RECIPIENT, MANUAL_TEST_SCHEMA } from "../lib/fulfillment/manual-test-constants";
import { privateDigest } from "../lib/fulfillment/shipping-flow-store";
import * as fixtureDiagnostics from "../lib/fulfillment/manual-test-diagnostics";
import { parseManualTestAddress } from "../lib/fulfillment/manual-test-address";
import { QA_MAIL_AUTHORIZATION } from "../lib/fulfillment/test-mail-authorization";

// pg's runtime parser registry supports array OIDs omitted from its TypeId union.
const pgArrayParser = (oid: 1003 | 1009) => pgTypes.getTypeParser(oid as Parameters<typeof pgTypes.getTypeParser>[0]);
let checks = 0;
const eq = (a: unknown, b: unknown, note: string) => { assert.deepEqual(a, b, note); checks++; };
function load<T>(path: string, deps: Record<string, unknown>, env: Record<string, string | undefined> = process.env): T {
  const code = ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const output: Record<string, unknown> = {};
  const run = new Script(`(function(require,module,exports){${code}\n})`).runInContext(createContext({ console, Error, Date, URL, process: { env } }));
  run((name: string) => { assert(name in deps, `Unmocked dependency ${name}`); return deps[name]; }, { exports: output }, output);
  return output as T;
}
async function main() {
  const original = { ...process.env }, originalFetch = globalThis.fetch;
  let external = 0;
  globalThis.fetch = async () => { external++; throw new Error("Network forbidden"); };
  Object.assign(process.env, { PSL_VISUAL_PREVIEW: "0", BTCPOSTAGE_TEST_MODE: "false", BTCPOSTAGE_API_KEY: "OFFLINE-KEY", BTCPOSTAGE_API_SECRET: "OFFLINE-SECRET",
    PSL_FULFILLMENT_LABEL_FLOW_ENABLED: "false", PSL_FULFILLMENT_TRACKING_EMAIL_ENABLED: "false" });
  const publicQueries: string[] = [], testQueries: string[] = [];
  const normalSql = (async (s: TemplateStringsArray) => { publicQueries.push(s.join("?")); return []; }) as never;
  const qaSql = (async (s: TemplateStringsArray) => { testQueries.push(s.join("?")); return []; }) as never;
  __setSqlClientForTests(normalSql);
  try {
    const envSnapshot = JSON.stringify(process.env);
    let publicInit = 0, qaInit = 0;
    await Promise.all([
      withManualFulfillmentTestSql(qaSql, async () => {
        eq(getSql(), qaSql, "test request owns its SQL client");
        await new Promise(resolve => setTimeout(resolve, 5));
        eq(getSql(), qaSql, "test SQL survives asynchronous work");
        eq(isBtcpostageTestMode(), true, "manual context forces carrier test mode");
        eq(shippingFlowConfig().enabled, true, "only manual context enables its test controls");
        eq(shippingFlowConfig().trackingEmailEnabled, false, "test label creation does not enable automatic email");
        await ensureSqlSchema("concurrent-boundary", async () => { qaInit++; });
        await ensureSqlSchema("concurrent-boundary", async () => { qaInit++; });
        await ensureOrdersSchema();
      }),
      (async () => {
        await new Promise(resolve => setTimeout(resolve, 1));
        eq(getSql(), normalSql, "concurrent normal request stays on its own SQL client");
        eq(getManualFulfillmentTestScope(), null, "normal request cannot see manual-test controls");
        eq(isBtcpostageTestMode(), false, "normal carrier mode remains unchanged");
        eq(shippingFlowConfig().enabled, false, "normal live workflow remains off");
        await ensureSqlSchema("concurrent-boundary", async () => { publicInit++; });
        await ensureOrdersSchema();
      })(),
    ]);
    eq([publicInit, qaInit], [1, 1], "schema-ready caches initialize separately once per actual client");
    eq(publicQueries.filter(q => /CREATE TABLE IF NOT EXISTS orders/.test(q)).length, 1, "normal schema initializes on normal SQL only");
    eq(testQueries.filter(q => /CREATE TABLE IF NOT EXISTS orders/.test(q)).length, 1, "test schema initialization cannot mask normal schema");
    eq(JSON.stringify(process.env), envSnapshot, "request scoping never mutates process environment");

    const address = { name: "TEST ONLY", street1: "1 Offline Fixture", city: "Phoenix", state: "AZ", zip: "85016", country: "US" };
    // The persisted fixture uses one address line; the provider expects a separate suite field.
    let destinationScope = false;
    const suiteSender = { ...address, street2: "Suite 456" };
    const destinationHelper = load<typeof import("../lib/fulfillment/manual-test-destination")>("lib/fulfillment/manual-test-destination.ts", {
      "node:assert/strict": { default: assert }, "@/lib/db/sql": { getManualFulfillmentTestScope: () => destinationScope ? {} : null },
      "@/lib/btcpostage/config": { getBtcpostageFromAddress: () => suiteSender },
      "./manual-test-constants": { MANUAL_TEST_ORDER, MANUAL_TEST_RECIPIENT },
    });
    const suiteOrder = { orderId: MANUAL_TEST_ORDER, email: MANUAL_TEST_RECIPIENT,
      shipping: { firstName: "TEST", lastName: "ONLY", address: `${address.street1}, ${suiteSender.street2}`,
        city: address.city, state: address.state, zip: address.zip, country: "US" } } as import("../lib/orders/types").Order;
    eq(destinationHelper.manualTestDestination(suiteOrder), null, "normal orders do not use manual destination reconstruction");
    destinationScope = true;
    eq(JSON.parse(JSON.stringify(destinationHelper.manualTestDestination(suiteOrder))), { ...suiteSender, phone: "" }, "manual fixture restores the actual configured suite in street2");
    for (const changed of [{ ...suiteOrder, orderId: "REAL-ORDER" }, { ...suiteOrder, email: "other@example.invalid" },
      { ...suiteOrder, shipping: { ...suiteOrder.shipping, address: "CHANGED ADDRESS" } },
      { ...suiteOrder, shipping: { ...suiteOrder.shipping, zip: "10001" } }]) {
      assert.throws(() => destinationHelper.manualTestDestination(changed), /fixed fixture/); checks++;
    }
    const verificationLogs: unknown[][] = [], savedWarn = console.warn;
    console.warn = (...args: unknown[]) => { verificationLogs.push(args); };
    try {
      await withManualFulfillmentTestSql(qaSql, async () => {
        const rejected = await verifyAddress({ ...suiteSender, street1: "DO-NOT-LOG-PRIVATE-ADDRESS" }, async (_url, init) => {
          const fields = new URLSearchParams(String(init?.body));
          eq(fields.get("street2"), suiteSender.street2, "actual verify form preserves suite separately");
          return { ok: true, status: 200, text: async () => JSON.stringify({ status: "success", is_valid: false,
            data: { address: { street1: "DO-NOT-LOG-PROVIDER-ADDRESS" }, verification: { is_valid: false, errors: ["DO-NOT-LOG-PROVIDER-ERROR"] } } }) } as Response;
        });
        eq(rejected.isValid, false, "actual carrier rejection remains blocked for the private fixture");
      });
      eq(verificationLogs.length, 1, "manual rejection emits one diagnostic");
      eq(JSON.stringify(verificationLogs).includes("DO-NOT-LOG"), false, "verification diagnostics contain no input/address/provider error text");
      eq((verificationLogs[0][1] as { rootValidity: boolean }).rootValidity, false, "diagnostics preserve negative validity as a boolean only");
    } finally { console.warn = savedWarn; }
    const base = { to: address, from: address, pkg: MANUAL_TEST_PACKAGE, carrier: "USPS", service: "GroundAdvantage", orderNotes: `PSL ${MANUAL_TEST_ORDER}` };
    let carrierCalls = 0;
    const fetchMock: typeof fetch = async (_url, init) => {
      carrierCalls++; const fields = new URLSearchParams(String(init?.body));
      eq(fields.get("test_mode"), "true", "actual provider form always includes test_mode=true");
      eq(init?.redirect, "error", "test API credentials cannot follow a redirect");
      return { ok: true, status: 200, text: async () => JSON.stringify({ order_id: "OFFLINE-PURCHASE", items: [] }) } as Response;
    };
    await withManualFulfillmentTestSql(qaSql, async () => {
      for (const bad of [{ testMode: false }, { testMode: true, carrier: "UPS" }, { testMode: true, orderNotes: "PSL REAL-ORDER" }]) {
        await assert.rejects(createPurchase({ ...base, ...bad, fetchImpl: fetchMock }), /no-debit USPS test label/); checks++;
      }
      eq(carrierCalls, 0, "malformed manual purchase stops before provider dispatch");
      await createPurchase({ ...base, testMode: true, fetchImpl: fetchMock });
    });
    eq(carrierCalls, 1, "one permitted test purchase reaches only the injected offline provider");
    await withManualFulfillmentTestSql(qaSql, async () => {
      await getRates({ to: address, from: address, pkg: MANUAL_TEST_PACKAGE, carrier: "USPS", fetchImpl: async (_url, init) => {
        eq(init?.redirect, "error", "manual rate reads also refuse redirects");
        return { ok: true, status: 200, text: async () => "[]" } as Response;
      } });
    });

    // Exercise the actual fixture creator's transaction boundary with offline PG clients.
    eq(pgArrayParser(1003)(`{${MANUAL_TEST_SCHEMA}}`), `{${MANUAL_TEST_SCHEMA}}`, "pg returns uncast name[] as a string");
    eq(pgArrayParser(1009)(`{${MANUAL_TEST_SCHEMA}}`), [MANUAL_TEST_SCHEMA], "pg decodes text[] for the strict scope guard");
    let seededOrder: Record<string, unknown> | null = null, marker: Record<string, unknown> | null = null, stock = 10, failMarker = true, wrongScope = false;
    let snapshot: { order: Record<string, unknown> | null; marker: Record<string, unknown> | null; stock: number } | null = null;
    const txLog: string[] = [];
    const client = {
      release() {},
      async query(query: string, values: unknown[] = []) {
        if (["BEGIN", "COMMIT", "ROLLBACK"].includes(query)) txLog.push(query);
        if (query === "BEGIN") snapshot = { order: seededOrder ? { ...seededOrder } : null, marker: marker ? { ...marker } : null, stock };
        if (query === "ROLLBACK") { seededOrder = snapshot!.order; marker = snapshot!.marker; stock = snapshot!.stock; }
        if (query.includes("current_schema()")) return { rows: [{ schema: MANUAL_TEST_SCHEMA,
          scopes: pgArrayParser(query.includes("::text[]") ? 1009 : 1003)(`{${wrongScope ? "public" : MANUAL_TEST_SCHEMA}}`) }] };
        if (query.includes("INSERT INTO manual_fixture_identity")) {
          if (failMarker) throw new Error("Offline failure before marker commit");
          marker = { recipient_hash: values[1], sender_fingerprint: values[2] };
        }
        if (query.includes("SELECT recipient_hash")) return { rows: marker ? [marker] : [] };
        return { rows: [] };
      },
    };
    class OfflinePool {
      constructor(_options: unknown) { void _options; }
      async connect() { return client; }
      async query(query: string) { return { rows: query.includes("pg_get_userbyid") ? [{ owned: true }] : [] }; }
    }
    const fixtureDb = load<typeof import("../lib/fulfillment/manual-test-db")>("lib/fulfillment/manual-test-db.ts", {
      "node:assert/strict": { default: assert }, pg: { Pool: OfflinePool }, "@/lib/db/sql": { getSql, withManualFulfillmentTestSql, getManualFulfillmentTestScope },
      "@/lib/design-preview": { isDesignPreview: () => false },
      "@/lib/btcpostage/config": { getBtcpostageFromAddress: () => address }, "@/lib/btcpostage/schema": { ensureBtcpostageSchema: async () => undefined },
      "@/lib/inventory/store": { ensureInventorySchema: async () => undefined, checkoutWithStockCheck: async (order: Record<string, unknown>) => { seededOrder = { ...order }; return { ok: true }; }, settlePaidOrder: async () => { stock--; return { ok: true }; } },
      "@/lib/finance/schema": { ensureFinanceSchema: async () => undefined }, "./schema": { ensureFulfillmentSchema: async () => undefined },
      "./store": { upsertFulfillmentWorkflow: async () => undefined }, "./shipping-flow-store": { ensureShippingFlowSchema: async () => undefined, privateDigest },
      "@/lib/orders/store": { getOrder: async () => seededOrder }, "@/lib/products/catalog": { getActiveCatalogProducts: () => [{ handle: "retatrutide", name: "Retatrutide", strength: "10mg", price: 59.99, sku: "PSL-RT-10MG" }] },
      "@/lib/shipping/policy": { standardShippingSelection: () => ({ method: "standard" }) }, "./manual-test-constants": { MANUAL_TEST_ORDER, MANUAL_TEST_RECIPIENT, MANUAL_TEST_SCHEMA },
      "./manual-test-diagnostics": fixtureDiagnostics,
      "./manual-test-address": { parseManualTestAddress }, "./test-mail-authorization": { QA_MAIL_AUTHORIZATION },
    }, { DATABASE_URL: "postgresql://qa:offline@ep-qa.us-east-2.aws.neon.tech/qa?sslmode=require" });
    const diagnosticLogs: unknown[][] = [], originalWarn = console.warn;
    console.warn = (...args: unknown[]) => { diagnosticLogs.push(args); };
    try {
    wrongScope = true;
    await assert.rejects(fixtureDb.createManualTestFixture(), (error: unknown) => error instanceof fixtureDiagnostics.ManualFixtureError && error.stage === "identity_schema" && error.operatorErrorCode === "GUARD_FAILED"); checks++;
    wrongScope = false;
    await assert.rejects(fixtureDb.createManualTestFixture(), (error: unknown) => error instanceof fixtureDiagnostics.ManualFixtureError && error.stage === "identity_marker" && error.operatorErrorCode === "SEED_FAILED"); checks++;
    eq([seededOrder, marker, stock], [null, null, 10], "failed seed rolls back order, inventory and identity marker together");
    failMarker = false; await fixtureDb.createManualTestFixture();
    eq(stock, 9, "safe retry creates only one fake order inventory deduction");
    await fixtureDb.createManualTestFixture(); eq(stock, 9, "repeated create preserves the existing fixture instead of resetting stock");
    eq(txLog.filter(x => x === "ROLLBACK").length, 2, "scope and marker failures both rolled back");
    eq(txLog.filter(x => x === "COMMIT").length, 2, "initial successful seed and idempotent lookup committed");
    const sanitized = fixtureDiagnostics.manualFixtureFailure("checkout", { code: "42P01", message: "DO-NOT-LOG-ADDRESS-TOKEN-SQL" }, true);
    eq(sanitized.operatorErrorCode, "42P01", "bounded SQLSTATE is retained for the owner");
    eq(JSON.stringify(diagnosticLogs).includes("DO-NOT-LOG-ADDRESS-TOKEN-SQL"), false, "diagnostics never log the underlying error message");
    } finally { console.warn = originalWarn; }

    const json = (data: unknown, init?: { status?: number; headers?: HeadersInit }) => ({ data, status: init?.status ?? 200, headers: new Headers(init?.headers) });
    // The retired route may import authentication only, never fixture, database, carrier or mail actions.
    const queriesBeforeRetiredRoute = [publicQueries.length, testQueries.length];
    const carrierCallsBeforeRetiredRoute = carrierCalls;
    let bodyReads = 0;
    const api = (authorized: boolean) => load<typeof import("../app/api/admin/fulfillment-test/route")>("app/api/admin/fulfillment-test/route.ts", {
      "next/server": { NextResponse: { json } }, "@/lib/admin/require-auth": { requireAdminAuth: async () => authorized ? null : json({ error: "Unauthorized" }, { status: 401 }) },
    });
    const post = (origin: string, body: unknown) => {
      const request = new Request("https://psllabs.org/api/admin/fulfillment-test", { method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
      request.json = async () => { bodyReads++; throw new Error("Retired actions must never read or execute request bodies."); };
      return request;
    };
    const anon = await api(false).GET(); eq(anon.status, 401, "anonymous test status blocked"); eq(anon.headers.get("Cache-Control"), "private, no-store", "anonymous test response private");
    const anonymousPost = await api(false).POST(post("https://psllabs.org", { action: "purchase" }));
    eq(anonymousPost.status, 401, "retired POST still requires owner authentication");
    eq(anonymousPost.headers.get("Cache-Control"), "private, no-store", "unauthenticated retired POST stays private");
    for (const origin of ["https://other.invalid", "null", ""]) {
      const denied = await api(true).POST(post(origin, { action: "purchase" }));
      eq(denied.status, 403, "retired POST still rejects cross-origin or missing origin");
      eq(denied.headers.get("Cache-Control"), "private, no-store", "origin denial stays private");
    }
    const gone = await api(true).GET();
    eq(gone.status, 410, "authenticated GET reports the test workflow retired");
    eq(gone.headers.get("Cache-Control"), "private, no-store", "retired status stays private");
    eq((gone as unknown as { data: { path: string } }).data.path, "/admin-fulfillment", "retired status points to real fulfillment");
    for (const action of ["create_test_order", "prepare", "purchase", "retrieve", "send_test_email", "update_test_address", "unknown"]) {
      const result = await api(true).POST(post("https://psllabs.org", { action, confirmPurchase: true, previewToken: "fixture", testMode: false }));
      eq(result.status, 410, action + " can no longer run through the retired endpoint");
      eq(result.headers.get("Cache-Control"), "private, no-store", action + " retirement response stays private");
    }
    eq(bodyReads, 0, "retired actions never parse purchase, address or email inputs");
    eq([publicQueries.length, testQueries.length], queriesBeforeRetiredRoute, "retired requests do not access production or fixture data");
    eq(carrierCalls, carrierCallsBeforeRetiredRoute, "retired requests never call the carrier");
    const retiredPage = load<{ default: () => never }>("app/admin-fulfillment/test/page.tsx", {
      "next/navigation": { redirect: (path: string) => { throw new Error("REDIRECT:" + path); } },
    });
    assert.throws(retiredPage.default, /REDIRECT:\/admin-fulfillment$/, "old page redirects without loading the test panel"); checks++;
    eq(external, 0, "all tests stayed offline");
  } finally {
    __setSqlClientForTests(null); globalThis.fetch = originalFetch;
    for (const key of Object.keys(process.env)) if (!(key in original)) delete process.env[key];
    Object.assign(process.env, original);
  }
  console.log(`PASS: ${checks} manual fulfillment isolation, transaction, provider and route checks. No real database, label or mail.`);
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
