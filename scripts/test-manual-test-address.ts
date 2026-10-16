/** Actual address/parser/database boundaries under isolated offline mocks; no database or network. */
import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { readFileSync } from "node:fs";
import { createContext, Script } from "node:vm";
import ts from "typescript";
import { MANUAL_TEST_ORDER, MANUAL_TEST_RECIPIENT, MANUAL_TEST_SCHEMA } from "../lib/fulfillment/manual-test-constants";
import type { ManualFulfillmentTestAddress } from "../lib/fulfillment/manual-test-types";
import type { Order } from "../lib/orders/types";

let checks = 0;
const plain = (value: unknown) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const eq = (actual: unknown, expected: unknown, message: string) => { assert.deepEqual(plain(actual), plain(expected), message); checks++; };
const ok = (actual: unknown, message: string) => { assert(actual, message); checks++; };
function load<T>(file: string, dependencies: Record<string, unknown>, env: Record<string, string | undefined> = {}) {
  const code = ts.transpileModule(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const output = {};
  const run = new Script(`(function(require,module,exports){${code}\n})`).runInContext(createContext({
    Error, Date, URL, console: { ...console, warn: () => undefined }, process: { env },
  }));
  run((name: string) => { assert(name in dependencies, `Unmocked dependency: ${name}`); return dependencies[name]; }, { exports: output }, output);
  return output as T;
}
const constants = { MANUAL_TEST_ORDER, MANUAL_TEST_RECIPIENT, MANUAL_TEST_SCHEMA };
const states = load<typeof import("../lib/checkout/us-states")>("lib/checkout/us-states.ts", {});
const request = load<typeof import("../lib/shipping/request")>("lib/shipping/request.ts", {
  "@/lib/payments/products": {}, "@/lib/products/catalog": {}, "@/lib/checkout/us-states": states,
});
const parser = load<typeof import("../lib/fulfillment/manual-test-address")>("lib/fulfillment/manual-test-address.ts", {
  "@/lib/shipping/request": request,
});
const address: ManualFulfillmentTestAddress = { address: "1000 Offline Test Loop", street2: "Unit 9", city: "Fixture City", state: "AZ", zip: "85016" };
const sender = { name: "OFFLINE ONLY", street1: "999 Offline Sender Lane", street2: "Suite 2", city: "Fixture City", state: "AZ", zip: "85016", country: "US" };
const digest = (value: unknown) => `offline-digest:${JSON.stringify(value)}`;
type Sql = (parts: TemplateStringsArray, ...values: unknown[]) => Promise<Record<string, unknown>[]>;
type Scope = { sql: Sql; testAddress?: ManualFulfillmentTestAddress };
const scopes = new AsyncLocalStorage<Scope>();
const scopedSql = {
  getSql: () => { const scope = scopes.getStore(); assert(scope, "Public SQL is forbidden in this offline test"); return scope.sql; },
  getManualFulfillmentTestScope: () => scopes.getStore() ?? null,
  withManualFulfillmentTestSql: <T>(sql: Sql, action: () => Promise<T>, options: Record<string, unknown> = {}) => scopes.run({ sql, ...options }, action),
};
const destination = load<typeof import("../lib/fulfillment/manual-test-destination")>("lib/fulfillment/manual-test-destination.ts", {
  "node:assert/strict": { default: assert }, "@/lib/db/sql": scopedSql,
  "@/lib/btcpostage/config": { getBtcpostageFromAddress: () => sender }, "./manual-test-constants": constants,
});
function fakeOrder(): Order {
  return { orderId: MANUAL_TEST_ORDER, email: MANUAL_TEST_RECIPIENT, status: "paid", trackingNumber: null,
    shipping: { firstName: "TEST", lastName: "ONLY", address: `${sender.street1}, ${sender.street2}`, city: sender.city, state: sender.state, zip: sender.zip, country: "US" } } as unknown as Order;
}
type Evidence = { order?: string; label?: string; outbox?: boolean; receipt?: boolean };
type QueryLog = { pool: string; client: number | null; query: string; values: unknown[]; transaction: boolean };
function databaseHarness() {
  let order = fakeOrder(), savedAddress: ManualFulfillmentTestAddress | null = null;
  let cache = { verified: "OLD VERIFIED CACHE", previews: ["OLD PREVIEW"] };
  let evidence: Evidence = {}, failAt = "", wrongScope = false, owner = true, clientId = 0;
  const log: QueryLog[] = [];
  let lastLock = Promise.resolve();
  const pools: string[] = [];
  class OfflinePool {
    readonly pool: string;
    constructor(options: { options: string }) {
      this.pool = options.options.includes("pg_catalog") ? "control" : "isolated";
      assert.equal(options.options, this.pool === "control" ? "-c search_path=pg_catalog" : `-c search_path=${MANUAL_TEST_SCHEMA}`);
      pools.push(this.pool);
    }
    async query(query: string, values: unknown[] = []) {
      log.push({ pool: this.pool, client: null, query, values, transaction: false });
      assert.equal(this.pool, "control", "Only the separate control pool can run pool-level queries");
      if (query.includes("pg_get_userbyid")) { assert.equal(values[0], MANUAL_TEST_SCHEMA); return { rows: [{ owned: owner }] }; }
      if (query.includes("to_regclass")) return { rows: [{ present: true }] };
      if (query.includes("SELECT order_id,recipient_hash,sender_fingerprint")) return { rows: [{ order_id: MANUAL_TEST_ORDER, recipient_hash: digest(MANUAL_TEST_RECIPIENT), sender_fingerprint: digest(sender) }] };
      if (query.includes("mail_authorizations WHERE authorization_key")) return { rows: evidence.receipt ? [{ exists: 1 }] : [] };
      throw new Error(`Unexpected control SQL: ${query}`);
    }
    async connect() {
      assert.equal(this.pool, "isolated");
      const id = ++clientId;
      let transaction = false, releaseLock: (() => void) | undefined;
      let snapshot: { order: Order; address: ManualFulfillmentTestAddress | null; cache: typeof cache } | undefined;
      return {
        release(discard?: boolean) { log.push({ pool: "release", client: id, query: String(discard), values: [], transaction }); assert.equal(transaction, false, "No open transaction may return to the pool"); },
        async query(query: string, values: unknown[] = []) {
          log.push({ pool: "isolated", client: id, query, values, transaction });
          if (query.includes("pg_advisory_lock(")) {
            const previous = lastLock;
            lastLock = new Promise<void>(resolve => { releaseLock = resolve; });
            await previous;
            return { rows: [] };
          }
          if (query.includes("pg_advisory_unlock(")) { releaseLock?.(); return { rows: [{ unlocked: true }] }; }
          if (query === "BEGIN") { transaction = true; snapshot = plain({ order, address: savedAddress, cache }); return { rows: [] }; }
          if (query === "COMMIT") { transaction = false; return { rows: [] }; }
          if (query === "ROLLBACK") { order = snapshot!.order; savedAddress = snapshot!.address; cache = snapshot!.cache; transaction = false; return { rows: [] }; }
          if (query.includes("current_schema()")) return { rows: [{ schema: MANUAL_TEST_SCHEMA, scopes: [wrongScope ? "public" : MANUAL_TEST_SCHEMA] }] };
          if (failAt && query.includes(failAt)) throw new Error("Injected offline failure");
          if (query.includes("to_regclass")) return { rows: [{ present: savedAddress !== null }] };
          if (query.includes("SELECT address FROM manual_fixture_address")) return { rows: savedAddress ? [{ address: savedAddress }] : [] };
          if (query.includes("FOR UPDATE")) return { rows: [{ order_id: MANUAL_TEST_ORDER }] };
          if (query.includes("LEFT JOIN btcpostage_labels")) {
            assert.equal(values[0], MANUAL_TEST_ORDER); assert.equal(values[1], MANUAL_TEST_RECIPIENT);
            // Inspect every evidence gate independently. This mock models the predicate only
            // when its required column is present, so deleting a guard fails its own case.
            const common = /o\.order_id=\$1/.test(query) && /o\.email=\$2/.test(query) && /o\.status='paid'/.test(query);
            const blocked = evidence.order ? query.includes(`o.${evidence.order}`) : evidence.label ? query.includes(`l.${evidence.label}`) : evidence.outbox ? query.includes("NOT EXISTS(SELECT 1 FROM fulfillment_tracking_outbox") : false;
            return { rows: common && !blocked ? [{ order_id: MANUAL_TEST_ORDER }] : [] };
          }
          if (query.startsWith("CREATE TABLE IF NOT EXISTS manual_fixture_address")) return { rows: [] };
          if (query.startsWith("INSERT INTO manual_fixture_address")) { assert.equal(values[0], MANUAL_TEST_ORDER); savedAddress = JSON.parse(values[1] as string); return { rows: [] }; }
          if (query.startsWith("UPDATE orders SET shipping=")) {
            assert.equal(values[1], MANUAL_TEST_ORDER); assert.equal(values[2], MANUAL_TEST_RECIPIENT);
            assert.match(query, /WHERE order_id=\$2 AND email=\$3 RETURNING order_id/);
            order.shipping = JSON.parse(values[0] as string); return { rows: [{ order_id: MANUAL_TEST_ORDER }] };
          }
          if (query.startsWith("UPDATE btcpostage_labels SET verified_street1=NULL")) { assert.equal(values[0], MANUAL_TEST_ORDER); assert.match(query, /WHERE psl_order_id=\$1/); cache.verified = ""; return { rows: [] }; }
          if (query.startsWith("DELETE FROM fulfillment_label_previews")) { assert.equal(values[0], MANUAL_TEST_ORDER); assert.match(query, /WHERE order_id=\$1/); cache.previews = []; return { rows: [] }; }
          throw new Error(`Unexpected isolated SQL: ${query}`);
        },
      };
    }
  }
  const diagnostics = load<typeof import("../lib/fulfillment/manual-test-diagnostics")>("lib/fulfillment/manual-test-diagnostics.ts", {});
  const db = load<typeof import("../lib/fulfillment/manual-test-db")>("lib/fulfillment/manual-test-db.ts", {
    "node:assert/strict": { default: assert }, pg: { Pool: OfflinePool }, "@/lib/db/sql": scopedSql,
    "@/lib/design-preview": { isDesignPreview: () => false }, "@/lib/btcpostage/config": { getBtcpostageFromAddress: () => sender },
    "@/lib/btcpostage/schema": {}, "@/lib/inventory/store": {}, "@/lib/finance/schema": {}, "./schema": {}, "./store": {},
    "./shipping-flow-store": { privateDigest: digest }, "@/lib/orders/store": { getOrder: async () => { await scopedSql.getSql()`SELECT order_id FROM orders WHERE order_id=${MANUAL_TEST_ORDER} FOR UPDATE`; return plain(order); } },
    "@/lib/products/catalog": {}, "@/lib/shipping/policy": {}, "./manual-test-constants": constants,
    "./manual-test-diagnostics": diagnostics, "./manual-test-address": parser, "./test-mail-authorization": { QA_MAIL_AUTHORIZATION: "offline-auth@example.invalid" },
  }, { DATABASE_URL: "postgresql://offline:offline@ep-offline.us-east-2.aws.neon.tech/offline?sslmode=require" });
  return { db, log, pools, state: () => plain({ order, savedAddress, cache }),
    setEvidence: (value: Evidence) => { evidence = value; }, setFailure: (value: string) => { failAt = value; },
    setWrongScope: () => { wrongScope = true; }, setWrongOwner: () => { owner = false; } };
}

async function main() {
  let externalCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { externalCalls++; throw new Error("Network forbidden"); };
  try {
    eq(parser.parseManualTestAddress({ ...address, state: " az ", street2: " Unit 9 ", address: ` ${address.address} ` }), address, "Actual parser trims fields and normalizes state while retaining street2");
    eq(parser.parseManualTestAddress({ ...address, street2: undefined }), { ...address, street2: "" }, "street2 is optional");
    for (const invalid of [null, [], "address", {}, { ...address, street2: 9 }, { ...address, state: "XX" }, { ...address, state: "AA" },
      { ...address, zip: "8501" }, { ...address, zip: "00000" }, { ...address, zip: "99999" }, { ...address, zip: "85016-123" },
      { ...address, address: "PO BOX 4" }, { ...address, street2: "Post Office Box 4" }, { ...address, address: "GENERAL DELIVERY" },
      { ...address, city: "APO" }, { ...address, address: "FPO 4" }, { ...address, address: "" }, { ...address, city: " " },
      { ...address, address: "A".repeat(201) }, { ...address, city: "A".repeat(201) }, { ...address, street2: "A".repeat(201) },
      { ...address, address: "A".repeat(195), street2: "Unit 99" },
      ...["\0", "\n", "\r", "\t", "\x1f", "\x7f"].flatMap(char => ["address", "street2", "city", "state", "zip"].map(key => ({ ...address, [key]: `${address[key as keyof typeof address]}${char}X` }))),
    ]) eq(parser.parseManualTestAddress(invalid), null, "Invalid, nonphysical, oversized, or control-character address rejected");
    eq(parser.parseManualTestAddress({ ...address, zip: "85016-1234" }), { ...address, zip: "85016-1234" }, "ZIP+4 remains supported");
    const order = fakeOrder();
    order.shipping = { ...order.shipping, ...address, address: `${address.address}\n${address.street2}`, country: "US" };
    eq(destination.manualTestDestination(order), null, "Outside private scope destination override is absent");
    const unusedSql: Sql = async () => { throw new Error("Destination helper must not query"); };
    await scopedSql.withManualFulfillmentTestSql(unusedSql, async () => {
      eq(destination.manualTestDestination(order), { name: "TEST ONLY", street1: address.address, street2: address.street2, city: address.city, state: address.state, zip: address.zip, country: "US", phone: "" }, "Server-saved test address preserves separate provider suite");
      for (const changed of [{ ...order, orderId: "REAL-OFFLINE-ORDER" }, { ...order, email: "other@example.invalid" },
        ...["address", "city", "state", "zip", "country"].map(key => ({ ...order, shipping: { ...order.shipping, [key]: "MISMATCH" } }))]) {
        assert.throws(() => destination.manualTestDestination(changed), /server-saved test address/); checks++;
      }
    }, { testAddress: address });

    const success = databaseHarness();
    const before = success.state();
    await success.db.updateManualTestAddress(address);
    eq(success.pools, ["control", "isolated"], "Control and fixed-schema pools are separate");
    eq(success.state().savedAddress, address, "Actual update stores parsed test address");
    eq(success.state().order.shipping.address, `${address.address}\n${address.street2}`, "Actual update writes both address lines to only the fixture");
    eq(success.state().cache, { verified: "", previews: [] }, "Actual update invalidates prior address verification and previews");
    eq(success.state().order.email, before.order.email, "Update preserves the fixed email");
    const writes = success.log.filter(entry => /^(?:UPDATE|INSERT|DELETE|CREATE TABLE)/.test(entry.query));
    ok(writes.every(entry => entry.pool === "isolated" && entry.transaction), "All address/cache writes run in one isolated transaction");
    eq(new Set(writes.map(entry => entry.client)).size, 1, "Every write reuses the locked isolated client");
    ok(success.log.some(entry => entry.pool === "control" && entry.query.includes("mail_authorizations")), "Email receipt check uses independent control pool while fixture client is held");
    const updateLog = success.log.find(entry => entry.query.startsWith("UPDATE btcpostage_labels"))!;
    ok(!/tracking_number|purchase_status|btcp_order_id|purchase_claimed_at|label_url/.test(updateLog.query), "Address editing never clears shipment/purchase evidence");
    eq(success.log.filter(entry => ["BEGIN", "COMMIT", "ROLLBACK"].includes(entry.query)).map(entry => entry.query), ["BEGIN", "COMMIT"], "Successful edit commits once");

    const rejectedEvidence: Evidence[] = [
      ...["tracking_number", "tracking_saved_at", "shipped_at", "tracking_email_sent"].map(order => ({ order })),
      ...["purchase_status", "btcp_order_id", "purchase_claimed_at", "raw_response", "tracking_number", "shipment_id", "label_url", "purchased_at"].map(label => ({ label })),
      { outbox: true }, { receipt: true },
    ];
    for (const evidence of rejectedEvidence) {
      const harness = databaseHarness(); harness.setEvidence(evidence);
      const original = harness.state();
      await assert.rejects(harness.db.updateManualTestAddress(address), /check_unused/); checks++;
      eq(harness.state(), original, `Shipment/email evidence ${JSON.stringify(evidence)} blocks all fixture changes`);
      eq(harness.log.filter(entry => ["BEGIN", "COMMIT", "ROLLBACK"].includes(entry.query)).map(entry => entry.query), ["BEGIN", "ROLLBACK"], "Blocked change rolls back before writes");
    }
    const failed = databaseHarness(), original = failed.state();
    failed.setFailure("DELETE FROM fulfillment_label_previews");
    await assert.rejects(failed.db.updateManualTestAddress(address), /clear_address_cache/); checks++;
    eq(failed.state(), original, "Late failure rolls back address, order, verification and previews together");
    ok(failed.log.some(entry => entry.query === "ROLLBACK"), "Late failure uses transaction rollback");
    const unsafe = databaseHarness(); unsafe.setWrongScope();
    await assert.rejects(unsafe.db.updateManualTestAddress(address), /fixed private schema/); checks++;
    eq(unsafe.log.filter(entry => /^(?:UPDATE|INSERT|DELETE)/.test(entry.query)).length, 0, "Wrong schema fails before mutation");
    const unowned = databaseHarness(); unowned.setWrongOwner();
    await assert.rejects(unowned.db.updateManualTestAddress(address), /current application role/); checks++;
    eq(unowned.log.filter(entry => entry.client !== null).length, 0, "Wrong schema owner fails before isolated connection use");
    const sqlGuards = databaseHarness();
    for (const query of ["SELECT * FROM public.orders", "SET search_path=public", "SELECT set_config('search_path','public',false)", "DROP SCHEMA fixture", "GRANT ALL ON orders TO PUBLIC"]) {
      await assert.rejects(sqlGuards.db.inManualTestScope(async () => {
        const parts = Object.assign([query], { raw: [query] }) as unknown as TemplateStringsArray;
        await scopedSql.getSql()(parts);
      }), /cannot access public data or change its scope/); checks++;
    }

    const concurrency = databaseHarness();
    let unblock!: () => void, started!: () => void;
    const holding = new Promise<void>(resolve => { unblock = resolve; });
    const entered = new Promise<void>(resolve => { started = resolve; });
    const first = concurrency.db.inManualTestScope(async () => { started(); await holding; await scopedSql.getSql()`SELECT order_id FROM orders WHERE order_id=${MANUAL_TEST_ORDER} FOR UPDATE`; });
    await entered;
    let secondEntered = false;
    const second = concurrency.db.inManualTestScope(async () => { secondEntered = true; });
    await new Promise(resolve => setTimeout(resolve, 5));
    eq(secondEntered, false, "Second request waits on fixed fixture lock");
    unblock(); await Promise.all([first, second]);
    eq(secondEntered, true, "Lock waiter proceeds after first request releases");
    eq(concurrency.log.filter(entry => ["BEGIN", "COMMIT", "ROLLBACK"].includes(entry.query)).length, 0, "Normal quote/provider scope is autocommit, never wrapped in a database transaction");
    eq(scopes.getStore(), undefined, "Scope ends after request completion");
    eq(externalCalls, 0, "Every check stayed offline");
    console.log(`PASS: ${checks} manual test address parser, destination, private transaction, evidence and concurrency checks. No database, provider, or SMTP calls.`);
  } finally { globalThis.fetch = originalFetch; }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
