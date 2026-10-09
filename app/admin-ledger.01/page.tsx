import type { Metadata } from "next";
import { AdminLoginForm } from "@/components/admin/admin-login-form";
import { isAdminAuthenticated, isAdminPasswordConfigured } from "@/lib/admin/auth";
import { orderTotalCents } from "@/lib/finance-demo/model";
import { FINANCE_DEMO_PATH } from "@/lib/finance-demo/path";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Fictional finance demo | PSL Labs",
  description: "Private, fictional financial scenario. No real transactions.",
  robots: { index: false, follow: false, nocache: true },
};

const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
const dateLabel = (date: string) => `Nov ${Number(date.slice(-2))}`;

export default async function FinanceDemoPage() {
  if (!isAdminPasswordConfigured() || !(await isAdminAuthenticated())) {
    return <main className={styles.login}>
      <div className={styles.demoPill}>FICTIONAL DEMO · PRIVATE</div>
      <h1>Financial ledger demo</h1>
      <p>Sign in with your existing admin account to view the isolated business scenario.</p>
      {isAdminPasswordConfigured()
        ? <AdminLoginForm redirectTo={FINANCE_DEMO_PATH} />
        : <p>Admin access is not configured. The demo is unavailable.</p>}
    </main>;
  }

  // Authorization precedes fixture loading and every rendered data field.
  // There is no fixture endpoint, database query, mutation or customer integration.
  const { getFinanceDemo } = await import("@/lib/finance-demo/data");
  const { data, summary } = getFinanceDemo();
  const inventoryPurchaseCents = data.expenses.filter(e => e.category === "Inventory purchases").reduce((sum, e) => sum + e.amountCents, 0);
  const maxWeek = Math.max(...summary.weeks.flatMap(w => [w.revenueCents, w.expenseCents]));
  const customerById = new Map(data.customers.map(c => [c.id, c]));
  const sales = [...data.orders].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  const { cashLedger, stockLedger } = summary;

  return <main className={styles.root}>
    <div className={styles.banner}><strong>DEMO DATA ONLY</strong><span>Every customer, order and expense below is fictional. This page does not create transactions or send advertising events.</span></div>
    <div className={styles.container}>
      <header className={styles.header}>
        <div><p className={styles.eyebrow}>PSL LABS / FINANCIAL SCENARIO</p><h1>A look at what’s next.</h1><p className={styles.subtitle}>Your ledger, reimagined for a future month of sales.</p></div>
        <div className={styles.headerAside}><span className={styles.period}>November 2026 · USD</span><a href="/admin-ledger">Return to real ledger ↗</a></div>
      </header>

      <nav className={styles.nav} aria-label="Demo sections"><a href="#overview">Overview</a><a href="#sales">Orders</a><a href="#expenses">Expenses</a><a href="#inventory">Inventory</a><a href="#customers">Customers</a><a href="#reconciliation">Reconciliation</a></nav>

      <section id="overview" className={styles.metrics} aria-label="Fictional month totals">
        <article className={`${styles.metric} ${styles.revenue}`}><p>Total revenue</p><strong>{money(summary.revenueCents)}</strong><span>{data.orders.length} simulated orders · after discounts</span></article>
        <article className={styles.metric}><p>Total expenses</p><strong>{money(summary.expenseCents)}</strong><span>Including {money(inventoryPurchaseCents)} in stock purchases</span></article>
        <article className={`${styles.metric} ${styles.profit}`}><p>Cash-basis profit</p><strong>{money(summary.profitCents)}</strong><span>{(summary.profitCents / summary.revenueCents * 100).toFixed(1)}% cash margin · before tax</span></article>
        <article className={styles.metric}><p>Average order</p><strong>{money(Math.round(summary.revenueCents / data.orders.length))}</strong><span>{data.customers.length} fictional customers · {summary.unitsSold} units sold</span></article>
      </section>

      <div className={styles.chartGrid}>
        <section className={styles.panel} aria-labelledby="weekly-title">
          <div className={styles.sectionTop}><div><p className={styles.eyebrow}>MONTH AT A GLANCE</p><h2 id="weekly-title">Revenue & expenses</h2></div><div className={styles.legend}><span><i />Revenue</span><span><i />Expenses</span></div></div>
          <div className={styles.chart} role="img" aria-label="Weekly fictional revenue and expenses. Exact values appear below each bar pair.">
            {summary.weeks.map(week => <div key={week.label} className={styles.week}>
              <div className={styles.bars}><div className={styles.revenueBar} style={{ height: `${week.revenueCents / maxWeek * 100}%` }} /><div className={styles.expenseBar} style={{ height: `${week.expenseCents / maxWeek * 100}%` }} /></div>
              <strong>{week.label}</strong><span className={styles.blueText}>{money(week.revenueCents)}</span><span>{money(week.expenseCents)}</span>
            </div>)}
          </div>
          <p className={styles.note}>Actual fixture totals, grouped by transaction date. No forecast multiplier or trend estimate.</p>
        </section>
        <section className={styles.panel} aria-labelledby="spend-title"><p className={styles.eyebrow}>WHERE THE MONEY GOES</p><h2 id="spend-title">Expense mix</h2>
          <div className={styles.categoryList}>{summary.categories.map(category => <div key={category.name}><div><span>{category.name}</span><strong>{money(category.amountCents)}</strong></div><div className={styles.track}><i style={{ width: `${category.amountCents / summary.expenseCents * 100}%` }} /></div></div>)}</div>
          <div className={styles.totalLine}><span>Total expenses</span><strong>{money(summary.expenseCents)}</strong></div>
        </section>
      </div>

      <section id="sales" className={styles.panel}>
        <div className={styles.sectionTop}><div><p className={styles.eyebrow}>SIMULATED SALES</p><h2>Orders</h2></div><span className={styles.count}>{data.orders.length} fictional orders</span></div>
        <p className={styles.note}>All records are marked DEMO. Status describes the scenario; no payment was processed and no shipment exists.</p>
        <div className={styles.tableWrap}><table><thead><tr><th>Order</th><th>Date</th><th>Customer</th><th>Item</th><th>Qty</th><th>Discount</th><th>Net sale</th><th>Status</th></tr></thead><tbody>{sales.slice(0, 10).map(o => <tr key={o.id}><td className={styles.mono}>{o.id}</td><td>{dateLabel(o.date)}</td><td>{customerById.get(o.customerId)?.name}</td><td>{o.sku}</td><td>{o.quantity}</td><td>{money(o.discountCents)}</td><td><strong>{money(orderTotalCents(o))}</strong></td><td><span className={styles.status}>{o.status}</span></td></tr>)}</tbody></table></div>
        <details className={styles.details}><summary>Show all {sales.length} fictional order line items</summary><div className={styles.tableWrap}><table><thead><tr><th>Order / date</th><th>Customer</th><th>SKU</th><th>Qty</th><th>Unit price</th><th>Discount</th><th>Net sale</th></tr></thead><tbody>{sales.map(o => <tr key={o.id}><td>{o.id}<small>{o.date}</small></td><td>{o.customerId}</td><td>{o.sku}</td><td>{o.quantity}</td><td>{money(o.unitPriceCents)}</td><td>{money(o.discountCents)}</td><td>{money(orderTotalCents(o))}</td></tr>)}</tbody><tfoot><tr><td colSpan={5}>All order lines</td><td>{money(summary.discountCents)}</td><td>{money(summary.revenueCents)}</td></tr></tfoot></table></div></details>
      </section>

      <section id="expenses" className={styles.panel}><div className={styles.sectionTop}><div><p className={styles.eyebrow}>FICTIONAL CASH OUTFLOWS</p><h2>Expenses</h2></div><span className={styles.count}>{data.expenses.length} entries</span></div>
        <div className={styles.tableWrap}><table><thead><tr><th>Entry</th><th>Date</th><th>Category / vendor</th><th>Description</th><th>Amount</th></tr></thead><tbody>{[...data.expenses].sort((a, b) => a.date.localeCompare(b.date)).map(e => <tr key={e.id}><td className={styles.mono}>{e.id}</td><td>{dateLabel(e.date)}</td><td>{e.category}<small>{e.vendor}</small></td><td className={styles.description}>{e.description}</td><td>{money(e.amountCents)}</td></tr>)}</tbody><tfoot><tr><td colSpan={4}>Total expenses</td><td>{money(summary.expenseCents)}</td></tr></tfoot></table></div>
      </section>

      <section id="inventory" className={styles.panel}><div className={styles.sectionTop}><div><p className={styles.eyebrow}>DEMO PRODUCTS · NO LIVE CATALOG CONNECTION</p><h2>Inventory movement</h2></div><span className={styles.count}>{summary.inventory.reduce((sum, p) => sum + p.remaining, 0)} closing units</span></div>
        <div className={styles.tableWrap}><table><thead><tr><th>Fictional product</th><th>Opening</th><th>Received</th><th>Sold</th><th>Closing</th><th>Unit cost</th><th>Closing value</th></tr></thead><tbody>{summary.inventory.map(p => <tr key={p.sku}><td>{p.name}<small>{p.sku}</small></td><td>{p.openingUnits}</td><td>+{p.purchased}</td><td>−{p.sold}</td><td><strong>{p.remaining}</strong></td><td>{money(p.unitCostCents)}</td><td>{money(p.closingValueCents)}</td></tr>)}</tbody></table></div>
        <p className={styles.note}>Opening + receipts − sold = closing. Opening stock is carried in from an earlier fictional period. New stock purchases are expenses in this cash-basis view; inventory value is informational and is not subtracted again as cost of goods sold.</p>
        <details className={styles.details}><summary>Inspect every inventory movement</summary><div className={styles.tableWrap}><table><thead><tr><th>Reference</th><th>Date</th><th>SKU</th><th>Activity</th><th>Units</th><th>SKU balance</th></tr></thead><tbody>{stockLedger.map(m => <tr key={`${m.id}-${m.sku}`}><td>{m.id}</td><td>{dateLabel(m.date)}</td><td>{m.sku}</td><td>{m.type}</td><td>{m.units > 0 ? "+" : ""}{m.units}</td><td>{m.balance}</td></tr>)}</tbody></table></div></details>
      </section>

      <section id="customers" className={styles.panel}><p className={styles.eyebrow}>INVENTED IDENTITIES ONLY</p><h2>Customers</h2><p className={styles.note}>Generic demo labels and sample states. No names, email addresses, payment details or identifiers were copied from real customers.</p>
        <details className={styles.details}><summary>View all {summary.customers.length} fictional customers</summary><div className={styles.tableWrap}><table><thead><tr><th>Demo customer</th><th>Reference</th><th>Sample state</th><th>Orders</th><th>Total sales</th></tr></thead><tbody>{summary.customers.map(c => <tr key={c.id}><td>{c.name}</td><td>{c.id}</td><td>{c.state}</td><td>{c.orderCount}</td><td>{money(c.salesCents)}</td></tr>)}</tbody><tfoot><tr><td colSpan={3}>All fictional customers</td><td>{data.orders.length}</td><td>{money(summary.revenueCents)}</td></tr></tfoot></table></div></details>
      </section>

      <section id="reconciliation" className={`${styles.panel} ${styles.reconcile}`}><div><p className={styles.eyebrow}>EVERY CENT ACCOUNTED FOR</p><h2>One consistent scenario.</h2><p>Revenue and expenses were selected once at random within your requested ranges. All orders, charts, customer totals, stock movements and balances are derived from the same saved fictional transactions.</p><p className={styles.note}>Cash basis, USD, before income tax. No refunds, sales tax collected or shipping revenue are assumed in this illustrative month. This is neither a sales forecast nor real accounting.</p></div><dl><div><dt>Revenue after discounts</dt><dd>{money(summary.revenueCents)}</dd></div><div><dt>Cash expenses</dt><dd>−{money(summary.expenseCents)}</dd></div><div className={styles.profitLine}><dt>Cash-basis profit</dt><dd>{money(summary.profitCents)}</dd></div><div><dt>Opening cash</dt><dd>{money(data.openingCashCents)}</dd></div><div><dt>Closing cash</dt><dd>{money(summary.closingCashCents)}</dd></div></dl></section>
      <details className={`${styles.panel} ${styles.details}`}><summary>Full fictional cash ledger · {cashLedger.length} transactions</summary><p className={styles.note}>Opening cash: {money(data.openingCashCents)}. Running balance includes every sale and expense above.</p><div className={styles.tableWrap}><table><thead><tr><th>Date / reference</th><th>Type</th><th>Description</th><th>Cash change</th><th>Running balance</th></tr></thead><tbody>{cashLedger.map(t => <tr key={t.id}><td>{t.date}<small>{t.id}</small></td><td>{t.type}</td><td>{t.description}</td><td>{t.amountCents < 0 ? "−" : "+"}{money(Math.abs(t.amountCents))}</td><td>{money(t.balanceCents)}</td></tr>)}</tbody><tfoot><tr><td colSpan={4}>Closing cash</td><td>{money(summary.closingCashCents)}</td></tr></tfoot></table></div></details>
      <footer className={styles.footer}><strong>PSL Labs · Fictional finance demo</strong><span>Read-only scenario · Existing admin authentication · No integrations</span><a href="/admin-ledger">Open real ledger ↗</a></footer>
    </div>
  </main>;
}
