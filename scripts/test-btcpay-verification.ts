/** Offline only: actual invoice verifier and bound SQL, with fixture GETs and an in-memory SQL recorder. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createContext, Script } from "node:vm";
import ts from "typescript";
import { verifyBtcpayInvoice, type BtcpayOrderSnapshot } from "../lib/payments/btcpay-verify";
import type { PaymentSettlementBinding } from "../lib/inventory/store";

const ORDER: BtcpayOrderSnapshot = {
  orderId: "psl_btc_fixture", invoiceId: "invoice_fixture", paymentMethod: "bitcoin", status: "pending", total: 59.99, currency: "USD",
};
const INVOICE = {
  id: "invoice_fixture", storeId: "store_fixture", amount: "59.99", paidAmount: "59.99", currency: "USD",
  type: "Standard", status: "Settled", additionalStatus: "None", metadata: { orderId: ORDER.orderId },
};
let checks = 0;
let reads = 0;
let invoice: unknown = structuredClone(INVOICE);
let providerStatus = 200;
let unavailable = false;
const ROOT = resolve(__dirname, "..");

async function denied(altered: unknown, local = ORDER, expectedStatus: "Settled" | "Expired" | "Invalid" = "Settled") {
  invoice = altered;
  const result = await verifyBtcpayInvoice(local, "invoice_fixture", expectedStatus);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, 409);
  checks++;
}

async function sqlBindings() {
  const calls: { text: string; values: unknown[] }[] = [];
  const sql = async (parts: TemplateStringsArray, ...values: unknown[]) => {
    const text = parts.join("?"); calls.push({ text, values });
    return text.includes("FROM eligible") ? [{ result: { ok: true, was_newly_paid: true, stock_decrement_failed: false } }] : [];
  };
  function load(file: string, mocks: Record<string, unknown>): Record<string, unknown> {
    const source = readFileSync(resolve(ROOT, file), "utf8");
    const compiled = ts.transpileModule(source, { compilerOptions: {
      target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true,
    }}).outputText;
    const context = createContext({ process: { env: {} }, console, Date });
    const output: Record<string, unknown> = {};
    const evaluate = new Script(`(function(require,module,exports){${compiled}\n})`, { filename: file }).runInContext(context);
    evaluate((id: string) => {
      assert(id in mocks, `Offline SQL loader rejected dependency ${id}`);
      return mocks[id];
    }, { exports: output }, output);
    return output;
  }
  const inventory = load("lib/inventory/store.ts", {
    "@/lib/db/sql": { getSql: () => sql }, "@/lib/orders/store": { ensureOrdersSchema: async () => {} },
    "@/lib/products/catalog": { getActiveCatalogProducts: () => [] },
    "./constants": { INVOICE_EXPIRY_MINUTES: 15, PENDING_GRACE_MINUTES: 5, LOW_STOCK_THRESHOLD: 15, availabilityToStockStatus: () => "in_stock" },
  }) as { settlePaidOrder: (id: string, invoiceId: string, binding: PaymentSettlementBinding) => Promise<{ ok: boolean }> };
  for (const paymentMethod of ["card", "bitcoin"] as const) {
    assert.equal((await inventory.settlePaidOrder(ORDER.orderId, "invoice_fixture", { paymentMethod, total: ORDER.total, currency: ORDER.currency })).ok, true);
    const query = calls.at(-1)!;
    for (const pattern of [/WITH eligible AS MATERIALIZED/, /FOR UPDATE/, /payment_method = \?/, /invoice_id = \?/, /total = \?/, /currency = \?/, /status IN \('pending', 'paid', 'shipped'\)/]) {
      assert.match(query.text, pattern); checks++;
    }
    assert(query.values.includes(paymentMethod)); assert(query.values.includes("invoice_fixture")); checks += 2;
  }
  const orders = load("lib/orders/store.ts", { "@/lib/db/sql": { getSql: () => sql } }) as {
    markStatusIfPending: (id: string, status: string, binding: PaymentSettlementBinding & { invoiceId: string }) => Promise<void>;
  };
  await orders.markStatusIfPending(ORDER.orderId, "cancelled", { invoiceId: "invoice_fixture", paymentMethod: "bitcoin", total: ORDER.total, currency: ORDER.currency });
  const update = calls.at(-1)!;
  for (const pattern of [/status = 'pending'/, /invoice_id = \?/, /payment_method = \?/, /total = \? AND currency = \?/]) {
    assert.match(update.text, pattern); checks++;
  }
  assert(update.values.includes("bitcoin")); assert(update.values.includes("invoice_fixture")); checks += 2;
  // These capture the real statement contract; they do not simulate or prove PostgreSQL locks.
}

async function main() {
  const keys = ["BTCPAY_URL", "BTCPAY_API_KEY", "BTCPAY_STORE_ID"] as const;
  const old = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const oldFetch = globalThis.fetch;
  process.env.BTCPAY_URL = "https://btcpay.fixture.invalid";
  process.env.BTCPAY_API_KEY = "offline_fixture_key";
  process.env.BTCPAY_STORE_ID = "store_fixture";
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "https://btcpay.fixture.invalid/api/v1/stores/store_fixture/invoices/invoice_fixture");
    assert.equal(init?.method, "GET"); assert.equal(init?.cache, "no-store"); assert.equal(init?.redirect, "error");
    assert.equal(new Headers(init?.headers).get("authorization"), "token offline_fixture_key");
    assert(init?.signal); reads++;
    if (unavailable) throw new DOMException("fixture only", "AbortError");
    return Response.json(invoice, { status: providerStatus });
  };
  try {
    assert.equal((await verifyBtcpayInvoice(ORDER, "invoice_fixture", "Settled")).ok, true); checks++;
    for (const [additionalStatus, paidAmount] of [["None", "59.9900"], ["PaidOver", "60.125"], ["PaidLate", "59.99"]]) {
      invoice = { ...INVOICE, additionalStatus, paidAmount };
      assert.equal((await verifyBtcpayInvoice(ORDER, "invoice_fixture", "Settled")).ok, true); checks++;
    }
    for (const altered of [
      null, [], "invoice", { ...INVOICE, id: "other" }, { ...INVOICE, storeId: "other" },
      { ...INVOICE, currency: "EUR" }, { ...INVOICE, metadata: { orderId: "psl_other" } },
      { ...INVOICE, metadata: null }, { ...INVOICE, status: "Processing" },
      ...["Marked", "PaidPartial", "unknown", undefined].map(additionalStatus => ({ ...INVOICE, additionalStatus })),
      ...["59.98", "59.989999", "0", "NaN", "Infinity", undefined, 59.99].map(paidAmount => ({ ...INVOICE, paidAmount })),
      ...["59.98", "60.00", "59.990001", "0", "-59.99", "NaN", undefined, 59.99].map(amount => ({ ...INVOICE, amount })),
    ]) await denied(altered);
    for (const local of [
      { ...ORDER, paymentMethod: "card" as const }, { ...ORDER, invoiceId: "other" },
      { ...ORDER, status: "cancelled" as const }, { ...ORDER, status: "failed" as const },
      { ...ORDER, total: NaN }, { ...ORDER, total: 0 }, { ...ORDER, total: 59.991 },
    ]) {
      const before = reads; await denied(INVOICE, local); assert.equal(reads, before); checks++;
    }
    for (const status of ["Expired", "Invalid"] as const) {
      invoice = { ...INVOICE, status, paidAmount: "0" };
      assert.equal((await verifyBtcpayInvoice(ORDER, "invoice_fixture", status)).ok, true); checks++;
      await denied(INVOICE, ORDER, status);
    }
    invoice = INVOICE;
    for (const responseStatus of [401, 403, 404, 500]) {
      providerStatus = responseStatus;
      const result = await verifyBtcpayInvoice(ORDER, "invoice_fixture", "Settled");
      assert.equal(result.ok, false); if (!result.ok) assert.equal(result.status, 503); checks++;
    }
    providerStatus = 200; unavailable = true;
    const failed = await verifyBtcpayInvoice(ORDER, "invoice_fixture", "Settled");
    assert.equal(failed.ok, false); if (!failed.ok) assert.equal(failed.status, 503); checks++;
    unavailable = false; delete process.env.BTCPAY_API_KEY;
    const before = reads; const missing = await verifyBtcpayInvoice(ORDER, "invoice_fixture", "Settled");
    assert.equal(missing.ok, false); assert.equal(reads, before); checks += 2;
    await sqlBindings();
    console.log(`PASS: BTCPay verification and settlement binding (${checks} checks; ${reads} intercepted fixture GETs; no provider writes or database connection).`);
  } finally {
    globalThis.fetch = oldFetch;
    for (const key of keys) { if (old[key] === undefined) delete process.env[key]; else process.env[key] = old[key]; }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
