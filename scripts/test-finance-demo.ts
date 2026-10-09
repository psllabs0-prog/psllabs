import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import fixture from "../lib/finance-demo/fixture.json";
import { formatDemoDate, orderTotalCents, summarizeDemo } from "../lib/finance-demo/model";
import { isFinanceDemoPath } from "../lib/finance-demo/path";
import { PLAUSIBLE_TRANSFORM_REQUEST_JS } from "../lib/plausible/redact";

const summary = summarizeDemo(fixture);
assert.equal(fixture.periodStart, "2026-08-25");
assert.equal(fixture.periodEnd, "2026-10-09");
const dayMs = 86_400_000;
const startTime = Date.parse(`${fixture.periodStart}T00:00:00Z`);
const endTime = Date.parse(`${fixture.periodEnd}T00:00:00Z`);
const dates = Array.from({ length: (endTime - startTime) / dayMs + 1 }, (_, i) => new Date(startTime + i * dayMs).toISOString().slice(0, 10));
assert.equal(dates.length, 46);
for (const record of [...fixture.orders, ...fixture.expenses]) {
  assert.match(record.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(new Date(`${record.date}T00:00:00Z`).toISOString().slice(0, 10), record.date, `Invalid calendar date: ${record.date}`);
  assert(record.date >= fixture.periodStart && record.date <= fixture.periodEnd, `Out-of-range date: ${record.date}`);
  assert.equal(summary.weeks.filter(week => record.date >= week.startDate && record.date <= week.endDate).length, 1);
}
assert.equal(summary.weeks.length, 7);
assert.equal(summary.weeks[0].startDate, fixture.periodStart);
assert.equal(summary.weeks.at(-1)?.endDate, fixture.periodEnd);
assert.deepEqual(summary.weeks.map(week => week.label), ["Aug 25–31", "Sep 1–7", "Sep 8–14", "Sep 15–21", "Sep 22–28", "Sep 29–Oct 5", "Oct 6–9"]);
for (const date of dates) assert.equal(summary.weeks.filter(week => date >= week.startDate && date <= week.endDate).length, 1);
assert.equal(formatDemoDate("2026-08-25"), "Aug 25");
assert.equal(formatDemoDate("2026-10-09"), "Oct 9");
const boundaryOrders = ["2026-09-28", "2026-09-29", "2026-10-05", "2026-10-06"].map((date, i) => ({ ...fixture.orders[0], id: `DEMO-BOUNDARY-${i}`, date }));
const boundarySummary = summarizeDemo({ ...fixture, orders: boundaryOrders, expenses: [] });
const boundaryTotal = orderTotalCents(boundaryOrders[0]);
assert.equal(boundarySummary.weeks[4].revenueCents, boundaryTotal);
assert.equal(boundarySummary.weeks[5].revenueCents, boundaryTotal * 2);
assert.equal(boundarySummary.weeks[6].revenueCents, boundaryTotal);
assert(summary.revenueCents >= 2_200_000 && summary.revenueCents <= 2_300_000);
assert(summary.expenseCents >= 700_000 && summary.expenseCents <= 800_000);
assert.equal(summary.revenueCents, fixture.revenueTargetCents);
assert.equal(summary.expenseCents, fixture.expenseTargetCents);
assert.equal(summary.profitCents, summary.revenueCents - summary.expenseCents);
assert.equal(summary.closingCashCents, fixture.openingCashCents + summary.profitCents);
assert.equal(summary.cashLedger.length, fixture.orders.length + fixture.expenses.length);
assert.equal(new Set(summary.cashLedger.map(movement => movement.id)).size, summary.cashLedger.length);
assert.equal(summary.cashLedger.at(-1)?.balanceCents, summary.closingCashCents);
let cash = fixture.openingCashCents;
for (const movement of summary.cashLedger) {
  cash += movement.amountCents;
  assert.equal(movement.balanceCents, cash);
  assert(cash >= 0);
}

for (const field of ["revenueCents", "expenseCents", "profitCents"] as const) {
  assert.equal(summary.weeks.reduce((sum, week) => sum + week[field], 0), summary[field]);
}
assert.equal(summary.categories.reduce((sum, category) => sum + category.amountCents, 0), summary.expenseCents);
assert.equal(summary.customers.reduce((sum, customer) => sum + customer.salesCents, 0), summary.revenueCents);
assert.equal(summary.customers.reduce((sum, customer) => sum + customer.orderCount, 0), fixture.orders.length);
assert.equal(summary.inventory.reduce((sum, product) => sum + product.sold, 0), summary.unitsSold);

const ids = new Set<string>();
for (const record of [...fixture.orders, ...fixture.customers, ...fixture.expenses]) {
  assert(record.id.startsWith("DEMO-"));
  assert(!ids.has(record.id), `Duplicate identifier: ${record.id}`);
  ids.add(record.id);
}
for (const order of fixture.orders) {
  assert(fixture.customers.some(c => c.id === order.customerId));
  const product = fixture.products.find(p => p.sku === order.sku);
  assert(product);
  assert.equal(order.unitPriceCents, product.unitPriceCents);
  for (const amount of [order.quantity, order.unitPriceCents, order.discountCents, orderTotalCents(order)]) assert(Number.isSafeInteger(amount));
  assert(order.quantity > 0 && order.discountCents >= 0 && orderTotalCents(order) > 0);
  assert.equal(order.status, "Simulated paid");
}
for (const expense of fixture.expenses) {
  assert(Number.isSafeInteger(expense.amountCents) && expense.amountCents > 0);
  assert(expense.vendor.startsWith("Demo "));
  if ("sku" in expense) {
    const product = fixture.products.find(p => p.sku === expense.sku);
    assert(product);
    assert.equal(expense.amountCents, (expense.units ?? 0) * product.unitCostCents);
  }
}
for (const product of summary.inventory) {
  assert.equal(product.remaining, product.openingUnits + product.purchased - product.sold);
  assert(product.remaining >= 0);
  assert.equal(product.closingValueCents, product.remaining * product.unitCostCents);
  let stock = product.openingUnits;
  for (const date of dates) {
    stock += fixture.expenses.filter(e => "sku" in e && e.sku === product.sku && e.date === date).reduce((sum, e) => sum + ("units" in e ? e.units ?? 0 : 0), 0);
    stock -= fixture.orders.filter(o => o.sku === product.sku && o.date === date).reduce((sum, o) => sum + o.quantity, 0);
    assert(stock >= 0, `Negative stock for ${product.sku} on ${date}`);
  }
  assert.equal(stock, product.remaining);
  const movements = summary.stockLedger.filter(m => m.sku === product.sku);
  assert.equal(movements[0].date, fixture.periodStart);
  assert.equal(movements[0].type, "Opening stock");
  let runningStock = 0;
  for (const movement of movements) {
    runningStock += movement.units;
    assert.equal(movement.balance, runningStock);
    assert(runningStock >= 0);
  }
  assert.equal(movements.at(-1)?.balance, product.remaining);
}

// Demo requests are dropped even after a storefront script has already loaded.
const transform = runInNewContext(`(${PLAUSIBLE_TRANSFORM_REQUEST_JS})`, { URL }) as (payload: { u: string; r?: string }) => unknown;
for (const path of ["/admin-ledger.01", "/admin-ledger.01/", "/admin-ledger.01?utm_source=demo"]) {
  assert.equal(transform({ u: `https://www.psllabs.org${path}` }), null);
}
const whileOnDemo = runInNewContext(`(${PLAUSIBLE_TRANSFORM_REQUEST_JS})`, { URL, window: { location: { pathname: "/admin-ledger.01" } } }) as typeof transform;
assert.equal(whileOnDemo({ u: "https://www.psllabs.org/" }), null);
assert.deepEqual(JSON.parse(JSON.stringify(transform({ u: "https://www.psllabs.org/products/example?oppref=private#anchor" }))), { u: "https://www.psllabs.org/products/example" });
assert.equal(isFinanceDemoPath("/admin-ledger.01/"), true);
assert.equal(isFinanceDemoPath("/admin-ledger"), false);
assert.equal(isFinanceDemoPath("/products/example"), false);

const dataModule = readFileSync("lib/finance-demo/data.ts", "utf8");
assert.match(dataModule, /import "server-only"/);
assert(!/(?:fetch\(|DATABASE|sendMail|stripe|tagada|trackPurchase)/i.test(dataModule));
const page = readFileSync("app/admin-ledger.01/page.tsx", "utf8");
assert(page.indexOf("await isAdminAuthenticated()") < page.indexOf('await import("@/lib/finance-demo/data")'));
assert(!page.includes("AdminLedgerDashboard"));
assert(!page.includes("/api/admin/"));

console.log(`PASS: finance demo reconciliation and isolation. Revenue $${(summary.revenueCents / 100).toFixed(2)}; expenses $${(summary.expenseCents / 100).toFixed(2)}; cash profit $${(summary.profitCents / 100).toFixed(2)}; ${fixture.orders.length} fictional orders.`);
