/** Real PostgreSQL-compatible engine in memory only. Never loads env files or contacts integrations. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createContext, Script } from "node:vm";
import * as crypto from "node:crypto";
import ts from "typescript";
import { getReceiptProductDefinitions } from "../lib/inventory/receipt-products";
import { InventoryReceiptError, validateInventoryReceipt } from "../lib/inventory/receipt-validation";
import { getActiveCatalogProducts, getCatalogProductBySku } from "../lib/products/catalog";
import { isSameOriginMutation } from "../lib/security/request-origin";
import type { InventoryReceiptInput, InventoryReceiptResult } from "../lib/inventory/receipt-types";

const require = createRequire(import.meta.url);
const { PGlite } = require(process.env.PSL_PGLITE_MODULE_PATH || "@electric-sql/pglite") as {
  PGlite: new () => { exec(sql: string): Promise<unknown>; query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>; close(): Promise<void> };
};
let checks = 0;
const eq = (actual: unknown, expected: unknown, note: string) => { assert.deepEqual(actual, expected, note); checks++; };
const ok = (condition: unknown, note: string) => { assert.ok(condition, note); checks++; };
const definitions = getReceiptProductDefinitions();

function loadModule(file: string, mocks: Record<string, unknown>) {
  const compiled = ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports: Record<string, unknown> = {};
  const fn = new Script(`(function(require,module,exports){${compiled}\n})`).runInContext(createContext({
    Error, URL, JSON, Number, Map, Date, Promise, Response,
  }));
  fn((id: string) => { assert(id in mocks, `Unexpected dependency ${id}`); return mocks[id]; }, { exports }, exports);
  return exports;
}

const input = (reference: string, extra: Partial<InventoryReceiptInput> = {}): InventoryReceiptInput => ({
  reference, sourceNote: "Synthetic supplier receipt; fictional quantities and costs.",
  lines: [{ sku: "PSL-RT-10MG", quantity: 4, unitCostUsd: 2.5 },
    { sku: "PSL-GHKCU-50MG", quantity: 2, unitCostUsd: 1.75 },
    { sku: "PSL-BW-10ML", quantity: 3, unitCostUsd: 0.8 }],
  releaseToSellable: false, closeInboundLotIds: [1, 2], ...extra,
});

async function main() {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("No network permitted in receipt checks"); };
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE TABLE products(handle TEXT PRIMARY KEY,name TEXT NOT NULL,stock INTEGER NOT NULL CHECK(stock>=0),
        sku TEXT UNIQUE,low_stock_alert_sent_at TIMESTAMPTZ);
      CREATE TABLE stock_history(id BIGSERIAL PRIMARY KEY,handle TEXT,sku TEXT,old_stock INTEGER,new_stock INTEGER,changed_at TIMESTAMPTZ DEFAULT now());
      CREATE TABLE inventory_pipeline_lots(id BIGSERIAL PRIMARY KEY,sku TEXT,supplier_lot_reference TEXT,
        quantity_ordered INTEGER NOT NULL,quantity_received INTEGER,status TEXT NOT NULL,ordered_at TIMESTAMPTZ DEFAULT now(),
        received_at TIMESTAMPTZ,expected_release_at TIMESTAMPTZ,testing_started_at TIMESTAMPTZ,
        testing_cost NUMERIC(12,2),released_at TIMESTAMPTZ,created_at TIMESTAMPTZ DEFAULT now(),
        notes TEXT,updated_at TIMESTAMPTZ DEFAULT now());
      CREATE TABLE inventory_monitor_baselines(sku TEXT PRIMARY KEY,baseline_stock INTEGER,source TEXT,set_at TIMESTAMPTZ,updated_at TIMESTAMPTZ);
      CREATE TABLE financial_ledger(id SERIAL PRIMARY KEY,record_type VARCHAR(20),order_id VARCHAR(255),sku VARCHAR(50),quantity INTEGER,
        gross_revenue_usd NUMERIC(10,2),transaction_fees NUMERIC(10,2),expense_name VARCHAR(255),notes TEXT);
      CREATE TABLE orders(status TEXT,items JSONB,invoice_created_at TIMESTAMPTZ,created_at TIMESTAMPTZ);
      INSERT INTO inventory_pipeline_lots(sku,quantity_ordered,status,notes) VALUES
        ('PSL-RT-10MG',25,'ordered','Synthetic old tracking A'),
        ('PSL-RS-5ML',12,'in_transit','Synthetic old tracking B'),
        ('PSL-MOTSC-10MG',99,'ordered','Unselected tracking must survive');
      INSERT INTO orders VALUES('pending','[{"handle":"retatrutide","quantity":5}]',now(),now());
    `);
    const reserved = readFileSync(new URL("../lib/inventory/store.ts", import.meta.url), "utf8")
      .match(/CREATE OR REPLACE FUNCTION inventory_reserved_qty\([\s\S]+?\$\$ LANGUAGE sql STABLE/)?.[0];
    assert(reserved); await db.exec(reserved);
    for (const [index, product] of getActiveCatalogProducts().entries()) {
      await db.query("INSERT INTO products(handle,name,stock,sku) VALUES($1,$2,$3,$4)",
        [product.handle, product.name, [17, 9, 8, 3, 11][index], product.sku]);
    }
    const sql = Object.assign(async (parts: TemplateStringsArray, ...values: unknown[]) => {
      const text = parts.reduce((text, piece, index) => text + (index ? `$${index}` : "") + piece, "");
      return (await db.query(text, values)).rows;
    }, { query: async (text: string, values: unknown[] = []) => (await db.query(text, values)).rows });
    const caches = new Map<string, Promise<void>>();
    const service = loadModule("../lib/inventory/receipts.ts", {
      "node:crypto": crypto,
      "@/lib/db/sql": { getSql: () => sql, ensureSqlSchema: (name: string, initialize: () => Promise<void>) => {
        if (!caches.has(name)) caches.set(name, initialize()); return caches.get(name);
      } },
      "./monitor/schema": { ensureInventoryMonitorSchema: async () => undefined },
      "@/lib/ledger/store": { ensureLedgerSchema: async () => undefined },
      "./constants": { LOW_STOCK_THRESHOLD: 15 },
      "./receipt-products": { getReceiptProductDefinitions },
      "./receipt-validation": { InventoryReceiptError, validateInventoryReceipt,
        inventoryReceiptReferenceKey: (value: string) => value.normalize("NFKC").trim().toUpperCase() },
    }) as unknown as typeof import("../lib/inventory/receipts");
    const pipeline = loadModule("../lib/inventory/monitor/pipeline.ts", {
      "@/lib/db/sql": { getSql: () => sql },
      "@/lib/inventory/store": { ensureProductTracked: async () => undefined },
      "@/lib/products/catalog": { getCatalogProductBySku, getActiveCatalogProducts },
      "./schema": { ensureInventoryMonitorSchema: async () => undefined },
      "./baselines": { resetInventoryBaseline: async () => undefined },
    }) as unknown as typeof import("../lib/inventory/monitor/pipeline");
    const pipelineSchemaSource = readFileSync(new URL("../lib/inventory/monitor/schema.ts", import.meta.url), "utf8");
    for (const functionName of ["inventory_increment_stock", "inventory_release_pipeline_lot"]) {
      const statement = pipelineSchemaSource.match(new RegExp(`CREATE OR REPLACE FUNCTION ${functionName}\\([\\s\\S]+?\\$\\$ LANGUAGE plpgsql`))?.[0];
      assert(statement); await db.exec(statement);
    }
    const count = async (table: string) => Number((await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n);
    const stock = async (sku: string) => Number((await db.query<{ stock: number }>("SELECT stock FROM products WHERE sku=$1", [sku])).rows[0].stock);
    const first = await service.recordInventoryReceipt(input("SYNTHETIC-RECEIPT-A"));
    eq(first.replayed, false, "first receipt applied");
    eq(first.receipt.merchandiseTotalUsd, 15.9, "merchandise cents total exact");
    eq(first.receipt.totalQuantity, 9, "quantity total exact");
    eq(await stock("PSL-RT-10MG"), 17, "default awaiting-testing keeps sellable stock unchanged");
    eq(await stock("PSL-RS-5ML"), 11, "closing stale 5mL tracking never changes old 5mL stock");
    eq(await count("financial_ledger"), 1, "one linked expense");
    eq(await count("stock_history"), 0, "awaiting receipt does not create sellable stock changes");
    eq(await count("inventory_receipt_tracking_closures"), 2, "only explicit tracking records closed");
    eq((await db.query<{ status: string }>("SELECT status FROM inventory_pipeline_lots WHERE id=3")).rows[0].status,
      "ordered", "unselected tracking remains intact");
    const closed = (await db.query<{ notes: string }>("SELECT notes FROM inventory_pipeline_lots WHERE id=2")).rows[0].notes;
    ok(closed.includes("Synthetic old tracking B") && closed.includes("no supplier order cancellation"), "closure preserves old notes and clearly labels administrative scope");
    await assert.rejects(pipeline.updatePipelineLotStage({ lotId: 1, status: "received_awaiting_testing", quantityReceived: 25 }),
      /closed\/released/); checks++;
    eq((await db.query<{ status: string }>("SELECT status FROM inventory_pipeline_lots WHERE id=1")).rows[0].status,
      "cancelled", "stale stage update cannot resurrect receipt-closed inbound tracking");
    const closedRelease = await pipeline.releasePipelineLotToSellable(1, true);
    eq([closedRelease.ok, closedRelease.error], [false, "lot is cancelled"], "existing release procedure refuses superseded tracking");
    eq(await stock("PSL-RT-10MG"), 17, "stale update/release attempt cannot create phantom stock");
    const snapshot = await service.getInventoryReceiptSnapshot("synthetic-receipt-a");
    const water = snapshot.products.find(p => p.sku === "PSL-BW-10ML")!;
    eq([water.stock, water.awaitingTesting, water.physicalOnHand, water.listedForSale], [3, 0, 3, false], "private10mL physical stock is explicitly unlisted");
    const reta = snapshot.products.find(p => p.sku === "PSL-RT-10MG")!;
    eq([reta.stock, reta.awaitingTesting, reta.physicalOnHand], [17, 4, 21], "received awaiting quantity included in physical count");
    eq(snapshot.openInboundLots.map(lot => lot.id), [3], "received and superseded lots are not reported as unreceived inbound");
    eq(await count("products"), 5, "internal10mL never enters public products table");
    eq(getActiveCatalogProducts().some(p => p.sku === "PSL-BW-10ML"), false, "internal SKU never becomes a public listing");
    const replay = await service.recordInventoryReceipt(input(" synthetic-receipt-a ", { lines: [...input("x").lines].reverse(), closeInboundLotIds: [2, 1] }));
    eq(replay.replayed, true, "case/whitespace reference and reordered canonical lines safely replay");
    eq(JSON.stringify(replay.receipt), JSON.stringify(first.receipt), "replay returns the original immutable receipt");
    eq(await count("financial_ledger"), 1, "replay does not duplicate expense");
    eq(await count("inventory_receipts"), 1, "replay does not duplicate receipt");
    await assert.rejects(service.recordInventoryReceipt(input("SYNTHETIC-RECEIPT-A", { releaseToSellable: true })),
      (error: unknown) => error instanceof InventoryReceiptError && error.status === 409); checks++;

    const beforeFailure = await service.getInventoryReceiptSnapshot();
    await assert.rejects(service.recordInventoryReceipt(input("SYNTHETIC-BAD-LOT", { closeInboundLotIds: [3, 9999] }))); checks++;
    eq(await count("inventory_receipts"), 1, "bad tracking ID rolls back receipt insertion");
    eq(await count("financial_ledger"), 1, "bad tracking ID creates no expense");
    eq(JSON.stringify((await service.getInventoryReceiptSnapshot()).products), JSON.stringify(beforeFailure.products), "bad tracking selection changes no physical inventory");
    await db.exec(`CREATE FUNCTION fail_receipt_ledger() RETURNS trigger AS $$ BEGIN
      IF NEW.expense_name LIKE '%SYNTHETIC-FAIL-COST%' THEN RAISE EXCEPTION 'OFFLINE_INJECTED_LEDGER_FAILURE'; END IF;
      RETURN NEW; END $$ LANGUAGE plpgsql;
      CREATE TRIGGER injected_ledger_failure BEFORE INSERT ON financial_ledger FOR EACH ROW EXECUTE FUNCTION fail_receipt_ledger();`);
    await assert.rejects(service.recordInventoryReceipt(input("SYNTHETIC-FAIL-COST", { releaseToSellable: true, closeInboundLotIds: [3] }))); checks++;
    eq(await count("inventory_receipts"), 1, "late ledger failure rolls back receipt header");
    eq(await count("stock_history"), 0, "late ledger failure rolls back stock history");
    eq(await count("inventory_monitor_baselines"), 0, "late ledger failure rolls back baseline");
    eq(await count("inventory_receipt_lines"), 3, "late failure rolls back receipt lines");
    eq(await count("inventory_receipt_tracking_closures"), 2, "late failure rolls back selected closure audit");
    eq(JSON.stringify((await service.getInventoryReceiptSnapshot()).products), JSON.stringify(beforeFailure.products), "late failure rolls back sellable and private stock together");
    eq((await db.query<{ status: string }>("SELECT status FROM inventory_pipeline_lots WHERE id=3")).rows[0].status,
      "ordered", "late failure restores selected incoming tracking");

    const releaseInput = input("SYNTHETIC-READY", { lines: [{ sku: "PSL-RT-10MG", quantity: 3, unitCostUsd: 1.01 },
      { sku: "PSL-BW-10ML", quantity: 2, unitCostUsd: 0.5 }], releaseToSellable: true, closeInboundLotIds: [3] });
    const ready = await service.recordInventoryReceipt(releaseInput);
    eq(ready.receipt.merchandiseTotalUsd, 4.03, "cent arithmetic preserves fractional-dollar totals");
    eq(await stock("PSL-RT-10MG"), 20, "release adds delta to latest stock instead of replacing it");
    const availability = (await db.query<{ reserved: number; available: number }>(`SELECT inventory_reserved_qty('retatrutide',15,5) AS reserved,
      stock-inventory_reserved_qty('retatrutide',15,5) AS available FROM products WHERE sku='PSL-RT-10MG'`)).rows[0];
    eq(availability, { reserved: 5, available: 15 }, "receipt preserves pending reservations and available-stock arithmetic");
    eq((await db.query<{ baseline_stock: number }>("SELECT baseline_stock FROM inventory_monitor_baselines WHERE sku='PSL-RT-10MG'")).rows[0].baseline_stock,
      20, "release baseline updated in same transaction");
    eq(await stock("PSL-RS-5ML"), 11, "5mL stock unchanged through all receipt modes");
    eq(await count("financial_ledger"), 2, "exactly one expense for each successful unique receipt");
    const simultaneous = await Promise.all([service.recordInventoryReceipt(releaseInput), service.recordInventoryReceipt(releaseInput)]);
    ok(simultaneous.every(result => result.replayed), "concurrent replay callers receive saved result without double effects");
    eq(await stock("PSL-RT-10MG"), 20, "concurrent replay creates no extra units");
    eq(await count("financial_ledger"), 2, "concurrent replay creates no extra cost");
    // Exercise the reference reconciliation once its receipt has left the recent-history window.
    await db.exec(`UPDATE inventory_receipts SET created_at='2000-01-01' WHERE reference_key='SYNTHETIC-RECEIPT-A';`);
    for (let index = 0; index < 31; index++) {
      await service.recordInventoryReceipt(input(`SYNTHETIC-HISTORY-${index}`, {
        lines: [{ sku: "PSL-BW-10ML", quantity: 1, unitCostUsd: 0.01 }], closeInboundLotIds: [],
      }));
    }
    eq((await service.getInventoryReceiptSnapshot()).receipts.some(r => r.reference === first.receipt.reference),
      false, "original receipt is outside the recent thirty receipts");
    eq((await service.getInventoryReceiptSnapshot("SYNTHETIC-RECEIPT-A")).receipts.filter(r => r.reference === first.receipt.reference).length,
      1, "reference lookup returns exact receipt for uncertain-outcome reconciliation");

    for (const invalid of [input("bad", { lines: [] }), input("bad", { lines: [{ sku: "PSL-BW-5ML", quantity: 1, unitCostUsd: 1 }] }),
      input("bad", { lines: [{ sku: "PSL-RT-10MG", quantity: 1.2, unitCostUsd: 1 }] }),
      input("bad", { lines: [{ sku: "PSL-RT-10MG", quantity: 1, unitCostUsd: 0.001 }] }),
      input("bad", { lines: [{ sku: "PSL-RT-10MG", quantity: 1, unitCostUsd: 1.005 }] }),
      input("bad", { lines: [input("x").lines[0], input("x").lines[0]] }),
      input("bad", { closeInboundLotIds: [1, 1] }), { ...input("bad"), testingCost: 1 },
      { ...input("bad"), releaseToSellable: undefined }]) {
      assert.throws(() => validateInventoryReceipt(invalid, definitions), InventoryReceiptError); checks++;
    }

    type Route = typeof import("../app/api/admin/inventory/receipts/route");
    const endpoint = "https://www.psllabs.org/api/admin/inventory/receipts";
    function routeHarness(authorized = true, fail = false) {
      const calls: string[] = [];
      const route = loadModule("../app/api/admin/inventory/receipts/route.ts", {
        "next/server": { NextResponse: Response },
        "@/lib/admin/require-auth": { requireAdminAuth: async () => authorized ? null : Response.json({ error: "Unauthorized" }, { status: 401 }) },
        "@/lib/security/request-origin": { isSameOriginMutation },
        "@/lib/inventory/receipt-validation": { InventoryReceiptError },
        "@/lib/inventory/receipts": {
          getInventoryReceiptSnapshot: async (reference?: string) => { calls.push(`GET:${reference ?? ""}`); return snapshot; },
          recordInventoryReceipt: async (body: unknown): Promise<InventoryReceiptResult> => {
            validateInventoryReceipt(body, definitions); calls.push("POST");
            if (fail) throw new Error("PRIVATE_DATABASE_SECRET"); return first;
          },
        },
      }) as unknown as Route;
      return { route, calls };
    }
    const post = (body: unknown, origin: string | null = "https://www.psllabs.org") => new Request(endpoint, {
      method: "POST", headers: { ...(origin ? { origin } : {}), "content-type": "application/json" }, body: JSON.stringify(body),
    });
    for (const method of ["GET", "POST"] as const) {
      const h = routeHarness(false); const response = method === "GET" ? await h.route.GET(new Request(endpoint)) : await h.route.POST(post(input("unauthorized")));
      eq(response.status, 401, "admin authentication required before any receipt I/O");
      eq(response.headers.get("cache-control"), "private, no-store", "unauthorized data never cached"); eq(h.calls, [], "unauthorized requests have no stock/cost action");
    }
    for (const origin of [null, "https://other.psllabs.org", "https://untrusted.invalid"]) {
      const h = routeHarness(); const response = await h.route.POST(post(input("bad-origin"), origin));
      eq(response.status, 403, "same exact origin required"); eq(h.calls, [], "CSRF rejection precedes receipt writes");
    }
    const read = routeHarness(); const readResponse = await read.route.GET(new Request(endpoint + "?reference=SYNTHETIC-READY"));
    eq(readResponse.status, 200, "authenticated lookup works"); eq(read.calls, ["GET:SYNTHETIC-READY"], "exact reference forwarded");
    eq(readResponse.headers.get("cache-control"), "private, no-store", "inventory/cost response private and uncached");
    const badJson = routeHarness(); const invalidResponse = await badJson.route.POST(new Request(endpoint, {
      method: "POST", headers: { origin: "https://www.psllabs.org" }, body: "{" }));
    eq(invalidResponse.status, 400, "malformed JSON rejected"); eq(badJson.calls, [], "malformed JSON has no side effects");
    const excessive = routeHarness(); const largeResponse = await excessive.route.POST(new Request(endpoint, {
      method: "POST", headers: { origin: "https://www.psllabs.org" }, body: " ".repeat(16001) }));
    eq(largeResponse.status, 413, "oversize body rejected before parsing"); eq(excessive.calls, [], "oversize has no side effects");
    const write = routeHarness(); const writeResponse = await write.route.POST(post(input("SYNTHETIC-HTTP")));
    eq(writeResponse.status, 200, "valid authenticated POST works"); eq(write.calls, ["POST"], "exactly one receipt action");
    const uncertain = routeHarness(true, true); const uncertainResponse = await uncertain.route.POST(post(input("SYNTHETIC-UNCERTAIN")));
    eq(uncertainResponse.status, 503, "unknown result is surfaced for reconciliation");
    const uncertainBody = await uncertainResponse.json(); eq(uncertainBody.checkReferenceFirst, true, "uncertain outcome directs reference readback");
    eq(JSON.stringify(uncertainBody).includes("PRIVATE_DATABASE_SECRET"), false, "database errors are not disclosed");
    eq(uncertain.calls, ["POST"], "unknown outcome is never automatically retried");
    console.log(`PASS: inventory receipt feature (${checks} checks; real isolated PGlite SQL, validation and auth/CSRF; no live DB, mail or provider calls).`);
  } finally { await db.close(); globalThis.fetch = originalFetch; }
}
void main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
