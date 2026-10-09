/** Pure, integer-cent calculations. No persistence, network or real-business imports. */
export type DemoProduct = { sku: string; name: string; unitPriceCents: number; unitCostCents: number; openingUnits: number };
export type DemoCustomer = { id: string; name: string; state: string };
export type DemoOrder = { id: string; customerId: string; date: string; sku: string; quantity: number; unitPriceCents: number; discountCents: number; status: string };
export type DemoExpense = { id: string; date: string; category: string; amountCents: number; description: string; vendor: string; sku?: string; units?: number };
export type DemoFixture = { scenario: string; revenueTargetCents: number; expenseTargetCents: number; openingCashCents: number; products: DemoProduct[]; customers: DemoCustomer[]; orders: DemoOrder[]; expenses: DemoExpense[] };

export const orderTotalCents = (order: DemoOrder) => order.quantity * order.unitPriceCents - order.discountCents;

export function summarizeDemo(fixture: DemoFixture) {
  const revenueCents = fixture.orders.reduce((sum, order) => sum + orderTotalCents(order), 0);
  const expenseCents = fixture.expenses.reduce((sum, expense) => sum + expense.amountCents, 0);
  const profitCents = revenueCents - expenseCents;
  const weeks = Array.from({ length: 5 }, (_, i) => {
    const start = i * 7 + 1;
    const end = Math.min(start + 6, 30);
    const within = (date: string) => Number(date.slice(-2)) >= start && Number(date.slice(-2)) <= end;
    const revenue = fixture.orders.filter(o => within(o.date)).reduce((sum, o) => sum + orderTotalCents(o), 0);
    const expenses = fixture.expenses.filter(e => within(e.date)).reduce((sum, e) => sum + e.amountCents, 0);
    return { label: `Nov ${start}–${end}`, revenueCents: revenue, expenseCents: expenses, profitCents: revenue - expenses };
  });
  const categories = [...new Set(fixture.expenses.map(e => e.category))].map(name => ({
    name,
    amountCents: fixture.expenses.filter(e => e.category === name).reduce((sum, e) => sum + e.amountCents, 0),
  })).sort((a, b) => b.amountCents - a.amountCents);
  const inventory = fixture.products.map(product => {
    const purchased = fixture.expenses.filter(e => e.sku === product.sku).reduce((sum, e) => sum + (e.units ?? 0), 0);
    const sold = fixture.orders.filter(o => o.sku === product.sku).reduce((sum, o) => sum + o.quantity, 0);
    const remaining = product.openingUnits + purchased - sold;
    return { ...product, purchased, sold, remaining, closingValueCents: remaining * product.unitCostCents };
  });
  const customers = fixture.customers.map(customer => {
    const orders = fixture.orders.filter(o => o.customerId === customer.id);
    return { ...customer, orderCount: orders.length, salesCents: orders.reduce((sum, order) => sum + orderTotalCents(order), 0) };
  });
  const transactions = [
    ...fixture.orders.map(o => ({ id: o.id, date: o.date, type: "Sale", description: `${o.customerId} · ${o.quantity} × ${o.sku}`, amountCents: orderTotalCents(o) })),
    ...fixture.expenses.map(e => ({ id: e.id, date: e.date, type: e.category, description: e.description, amountCents: -e.amountCents })),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  let cash = fixture.openingCashCents;
  const cashLedger = transactions.map(t => ({ ...t, balanceCents: cash += t.amountCents }));
  const inventoryMoves = [
    ...fixture.products.map(p => ({ id: `DEMO-OPEN-${p.sku}`, date: "2026-11-01", sku: p.sku, type: "Opening stock", units: p.openingUnits })),
    ...fixture.expenses.flatMap(e => e.sku && e.units ? [{ id: e.id, date: e.date, sku: e.sku, type: "Simulated receipt", units: e.units }] : []),
    ...fixture.orders.map(o => ({ id: o.id, date: o.date, sku: o.sku, type: "Simulated sale", units: -o.quantity })),
  ].sort((a, b) => a.date.localeCompare(b.date) || Number(b.type === "Opening stock") - Number(a.type === "Opening stock") || a.id.localeCompare(b.id));
  const stockBalances: Record<string, number> = {};
  const stockLedger = inventoryMoves.map(m => ({ ...m, balance: stockBalances[m.sku] = (stockBalances[m.sku] ?? 0) + m.units }));
  return { revenueCents, expenseCents, profitCents, weeks, categories, inventory, customers,
    cashLedger, stockLedger,
    closingCashCents: fixture.openingCashCents + profitCents,
    unitsSold: fixture.orders.reduce((sum, o) => sum + o.quantity, 0),
    discountCents: fixture.orders.reduce((sum, o) => sum + o.discountCents, 0),
  };
}
