/** Actual checkout preparation with real catalog/totals, fixture stock, and no database or provider calls. */
import assert from "node:assert/strict";
import * as crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createContext, Script } from "node:vm";
import ts from "typescript";
import * as pricing from "../lib/payments/products";
import * as catalog from "../lib/products/catalog";
import * as totals from "../lib/checkout/totals";
import * as countries from "../lib/checkout/us-states";
import * as attribution from "../lib/attribution/logic";
import type { CheckoutBody, PrepareOrderResult } from "../lib/checkout/prepare-order";
import type { Order } from "../lib/orders/types";

const ROOT = resolve(__dirname, "..");
const SHIPPING = { firstName: "Offline", lastName: "Fixture", address: "123 Fixture Street", city: "Phoenix", state: "AZ", zip: "85001", country: "US" };
const ACTIVE = catalog.getActiveCatalogProducts();
let checks = 0;
let reservations = 0;
let schemaCalls = 0;
let databaseCalls = 0;
const orders: Order[] = [];

function load(file: string, mocks: Record<string, unknown>): Record<string, unknown> {
  const filename = resolve(ROOT, file);
  const compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const context = createContext({ console: { error() {} }, Date, process: { env: {} } });
  const output: Record<string, unknown> = {};
  const evaluate = new Script(`(function(require,module,exports){${compiled}\n})`, { filename }).runInContext(context);
  evaluate((id: string) => { assert(id in mocks, `Offline loader rejected ${id}`); return mocks[id]; }, { exports: output }, output);
  return output;
}

const prepare = load("lib/checkout/prepare-order.ts", {
  "node:crypto": crypto, "@/lib/checkout/totals": totals, "@/lib/checkout/us-states": countries,
  "@/lib/attribution/logic": attribution, "@/lib/payments/products": pricing, "@/lib/products/catalog": catalog,
  "@/lib/checkout/discount-codes": { DISCOUNT_CODES_ENABLED: false, lookupActiveDiscountCode: async () => { throw new Error("Unexpected discount lookup"); } },
  "@/lib/inventory/store": {
    checkoutWithStockCheck: async (order: Order) => {
      reservations++; orders.push(structuredClone(order));
      // Ten units exist for each product. The old per-line stock check would
      // accept duplicate 10+10 lines; rejection must precede this boundary.
      return order.items.every(item => item.quantity <= 10) ? { ok: true } : { ok: false, error: "Insufficient stock" };
    },
  },
}) as { prepareReservedOrder: (body: CheckoutBody, options?: { paymentMethod: "card" | "bitcoin" }) => Promise<PrepareOrderResult> };

const inventory = load("lib/inventory/store.ts", {
  "@/lib/db/sql": { getSql: () => { databaseCalls++; throw new Error("Database access forbidden"); } },
  "@/lib/orders/store": { ensureOrdersSchema: async () => { schemaCalls++; throw new Error("Schema writes forbidden"); } },
  "@/lib/products/catalog": catalog,
  "./constants": { INVOICE_EXPIRY_MINUTES: 15, PENDING_GRACE_MINUTES: 5, LOW_STOCK_THRESHOLD: 15, availabilityToStockStatus: () => "in_stock" },
}) as { checkoutWithStockCheck: (order: Order) => Promise<{ ok: boolean }> };

async function main() {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("Network is forbidden in checkout validation tests"); };
  try {
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
    console.log(`PASS: Checkout validation (${checks} checks; valid card/Bitcoin totals preserved; duplicate 20-vs-10 carts rejected before writes; no database/provider calls).`);
  } finally { globalThis.fetch = previousFetch; }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
