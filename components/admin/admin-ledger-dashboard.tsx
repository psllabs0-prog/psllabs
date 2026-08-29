"use client";

import { useCallback, useEffect, useState } from "react";

import { Input } from "@/components/ui/input";
import type { AdminInventoryProductRow } from "@/lib/inventory/store";
import type { LedgerKpi, LedgerRow } from "@/lib/ledger/store";
import { cn } from "@/lib/utils";

function money(n: number, opts?: { signed?: boolean }): string {
  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(n));

  if (opts?.signed && n < 0) return `−${formatted}`;
  if (opts?.signed && n > 0) return `+${formatted}`;
  return formatted;
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

function KpiCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone: "green" | "amber" | "positive" | "negative";
}) {
  const toneClass =
    tone === "green" || tone === "positive"
      ? "text-verified-green"
      : tone === "amber"
        ? "text-signal"
        : "text-signal";

  return (
    <article className="premium-card flex flex-col gap-2 p-5 md:p-6">
      <p className="mono text-xs uppercase tracking-wider text-ash">{label}</p>
      <p
        className={cn(
          "font-mono text-3xl font-medium tracking-tight transition-all duration-300 md:text-4xl",
          toneClass
        )}
      >
        {value}
      </p>
      {sub && <p className="text-sm text-ash">{sub}</p>}
    </article>
  );
}

export function AdminLedgerDashboard() {
  const [kpi, setKpi] = useState<LedgerKpi | null>(null);
  const [inventory, setInventory] = useState<AdminInventoryProductRow[]>([]);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [stockDrafts, setStockDrafts] = useState<Record<string, string>>({});
  const [busySku, setBusySku] = useState<string | null>(null);
  const [inventoryMessages, setInventoryMessages] = useState<
    Record<string, string>
  >({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [expenseName, setExpenseName] = useState("");
  const [expenseCost, setExpenseCost] = useState("");
  const [expenseNotes, setExpenseNotes] = useState("");
  const [expenseBusy, setExpenseBusy] = useState(false);
  const [expenseError, setExpenseError] = useState<string | null>(null);
  const [expenseSuccess, setExpenseSuccess] = useState<string | null>(null);

  const refreshData = useCallback(async () => {
    const [kpiRes, inventoryRes, ledgerRes] = await Promise.all([
      fetch("/api/admin/kpi"),
      fetch("/api/admin/inventory"),
      fetch("/api/admin/ledger"),
    ]);

    if (!kpiRes.ok || !inventoryRes.ok || !ledgerRes.ok) {
      throw new Error("Unable to load dashboard data.");
    }

    const kpiData = (await kpiRes.json()) as LedgerKpi;
    const inventoryData = (await inventoryRes.json()) as {
      products: AdminInventoryProductRow[];
    };
    const ledgerData = (await ledgerRes.json()) as { rows: LedgerRow[] };

    setKpi(kpiData);
    setInventory(inventoryData.products);
    setLedger(ledgerData.rows.slice(0, 50));
    setStockDrafts((current) => {
      const next = { ...current };
      for (const product of inventoryData.products) {
        if (next[product.sku] === undefined) {
          next[product.sku] = String(product.currentStock);
        }
      }
      return next;
    });
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        await refreshData();
      } catch {
        setLoadError("Unable to load dashboard. Try refreshing the page.");
      } finally {
        setLoading(false);
      }
    })();
  }, [refreshData]);

  async function handleLogout() {
    await fetch("/api/admin/logout", { method: "POST" });
    window.location.href = "/admin-ledger";
  }

  async function handleStockUpdate(sku: string) {
    const newStock = Number(stockDrafts[sku]);
    if (!Number.isInteger(newStock) || newStock < 0) {
      setInventoryMessages((current) => ({
        ...current,
        [sku]: "Enter a non-negative whole number.",
      }));
      return;
    }

    setBusySku(sku);
    setInventoryMessages((current) => ({ ...current, [sku]: "" }));

    try {
      const res = await fetch("/api/admin/update-stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku, new_stock: newStock }),
      });
      const data = (await res.json()) as { error?: string };

      if (!res.ok) {
        setInventoryMessages((current) => ({
          ...current,
          [sku]: data.error ?? "Update failed.",
        }));
        return;
      }

      setInventory((current) =>
        current.map((row) =>
          row.sku === sku ? { ...row, currentStock: newStock } : row
        )
      );
      setInventoryMessages((current) => ({
        ...current,
        [sku]: "Stock updated.",
      }));
    } catch {
      setInventoryMessages((current) => ({
        ...current,
        [sku]: "Update failed.",
      }));
    } finally {
      setBusySku(null);
    }
  }

  async function handleExpenseSubmit(event: React.FormEvent) {
    event.preventDefault();
    setExpenseBusy(true);
    setExpenseError(null);
    setExpenseSuccess(null);

    const cost = Number(expenseCost);
    if (!expenseName.trim() || !Number.isFinite(cost) || cost <= 0) {
      setExpenseError("Enter an expense name and a positive cost.");
      setExpenseBusy(false);
      return;
    }

    try {
      const res = await fetch("/api/admin/expense", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expense_name: expenseName.trim(),
          cost_usd: cost,
          notes: expenseNotes.trim() || undefined,
        }),
      });
      const data = (await res.json()) as { error?: string };

      if (!res.ok) {
        setExpenseError(data.error ?? "Unable to add expense.");
        return;
      }

      setExpenseName("");
      setExpenseCost("");
      setExpenseNotes("");
      setExpenseSuccess("Expense recorded.");
      await refreshData();
    } catch {
      setExpenseError("Unable to add expense.");
    } finally {
      setExpenseBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-ash">
        Loading ledger…
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="premium-card p-6 text-center text-signal">{loadError}</div>
    );
  }

  const marginTone =
    kpi && kpi.netMargin >= 0 ? ("positive" as const) : ("negative" as const);

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mono text-accent">OPERATIONS</p>
          <h1 className="font-display text-display-lg font-bold text-ink">
            Admin ledger
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-ash">
            Financial overview, inventory control, and live transaction log.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleLogout()}
          className="rounded-pill border border-linen px-4 py-2 text-sm font-medium text-ash transition-colors hover:border-accent/40 hover:text-ink"
        >
          Sign out
        </button>
      </div>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-6">
        <KpiCard
          label="Total Gross Revenue"
          value={money(kpi?.totalRevenue ?? 0)}
          tone="green"
        />
        <KpiCard
          label="Total Expenses"
          value={money(kpi?.totalExpenses ?? 0)}
          tone="amber"
        />
        <KpiCard
          label="Net Margin"
          value={money(kpi?.netMargin ?? 0, { signed: true })}
          sub={
            kpi?.marginPercentage !== null && kpi?.marginPercentage !== undefined
              ? `${kpi.marginPercentage.toFixed(1)}% margin`
              : "No revenue yet"
          }
          tone={marginTone}
        />
      </section>

      <section className="premium-card overflow-hidden">
        <div className="border-b border-linen px-5 py-4">
          <h2 className="font-display text-xl font-bold text-ink">
            Inventory management
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b border-linen bg-surface text-left text-ash">
              <tr>
                <th className="px-5 py-3 font-medium">Product</th>
                <th className="px-5 py-3 font-medium">SKU</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Current stock</th>
                <th className="px-5 py-3 font-medium">Update stock</th>
                <th className="px-5 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {inventory.map((row) => (
                <tr key={row.sku} className="border-b border-linen last:border-b-0">
                  <td className="px-5 py-4 font-medium text-ink">{row.name}</td>
                  <td className="px-5 py-4 font-mono text-xs text-ash">
                    {row.sku}
                  </td>
                  <td className="px-5 py-4 capitalize text-ash">
                    {row.status.replace("_", " ")}
                  </td>
                  <td className="px-5 py-4 font-mono text-ink">
                    {row.currentStock}
                  </td>
                  <td className="px-5 py-4">
                    <Input
                      type="number"
                      min={0}
                      step={1}
                      value={stockDrafts[row.sku] ?? String(row.currentStock)}
                      onChange={(e) =>
                        setStockDrafts((current) => ({
                          ...current,
                          [row.sku]: e.target.value,
                        }))
                      }
                      className="h-10 w-28 rounded-lg border-linen bg-lab-white px-3 font-mono"
                    />
                  </td>
                  <td className="px-5 py-4">
                    <button
                      type="button"
                      disabled={busySku === row.sku}
                      onClick={() => void handleStockUpdate(row.sku)}
                      className="rounded-pill bg-accent px-4 py-2 text-sm font-medium text-page transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {busySku === row.sku ? "Updating…" : "Update Stock"}
                    </button>
                    {inventoryMessages[row.sku] && (
                      <p className="mt-2 text-xs text-ash">
                        {inventoryMessages[row.sku]}
                      </p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="premium-card p-5 md:p-6">
        <h2 className="font-display text-xl font-bold text-ink">Add expense</h2>
        <form
          onSubmit={(e) => void handleExpenseSubmit(e)}
          className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2"
        >
          <div className="flex flex-col gap-1.5">
            <label htmlFor="expense-name" className="text-sm font-medium text-ink">
              Expense name
            </label>
            <Input
              id="expense-name"
              value={expenseName}
              onChange={(e) => setExpenseName(e.target.value)}
              required
              className="h-11 rounded-lg border-linen bg-lab-white px-3"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="expense-cost" className="text-sm font-medium text-ink">
              Cost (USD)
            </label>
            <Input
              id="expense-cost"
              type="number"
              min="0.01"
              step="0.01"
              value={expenseCost}
              onChange={(e) => setExpenseCost(e.target.value)}
              required
              className="h-11 rounded-lg border-linen bg-lab-white px-3 font-mono"
            />
          </div>
          <div className="flex flex-col gap-1.5 md:col-span-2">
            <label htmlFor="expense-notes" className="text-sm font-medium text-ink">
              Notes (optional)
            </label>
            <Input
              id="expense-notes"
              value={expenseNotes}
              onChange={(e) => setExpenseNotes(e.target.value)}
              className="h-11 rounded-lg border-linen bg-lab-white px-3"
            />
          </div>
          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={expenseBusy}
              className="inline-flex items-center justify-center rounded-pill bg-accent px-6 py-3 text-sm font-medium text-page transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {expenseBusy ? "Saving…" : "Add Expense"}
            </button>
            {expenseError && (
              <p role="alert" className="mt-3 text-sm text-signal">
                {expenseError}
              </p>
            )}
            {expenseSuccess && (
              <p role="status" className="mt-3 text-sm text-verified-green">
                {expenseSuccess}
              </p>
            )}
          </div>
        </form>
      </section>

      <section className="premium-card overflow-hidden">
        <div className="border-b border-linen px-5 py-4">
          <h2 className="font-display text-xl font-bold text-ink">
            Live ledger log
          </h2>
          <p className="mt-1 text-sm text-ash">
            50 most recent entries, newest first.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b border-linen bg-surface text-left text-ash">
              <tr>
                <th className="px-5 py-3 font-medium">Date</th>
                <th className="px-5 py-3 font-medium">Type</th>
                <th className="px-5 py-3 font-medium">Order / Expense</th>
                <th className="px-5 py-3 font-medium">SKU / Item</th>
                <th className="px-5 py-3 font-medium">Qty</th>
                <th className="px-5 py-3 font-medium">Amount</th>
                <th className="px-5 py-3 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody>
              {ledger.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-ash">
                    No ledger entries yet.
                  </td>
                </tr>
              ) : (
                ledger.map((entry) => (
                  <tr
                    key={entry.id}
                    className="border-b border-linen last:border-b-0"
                  >
                    <td className="px-5 py-4 whitespace-nowrap text-ink">
                      {formatDate(entry.createdAt)}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={cn(
                          "inline-flex rounded-pill border px-2.5 py-0.5 font-mono text-[0.65rem] uppercase tracking-wider",
                          entry.recordType === "SALE"
                            ? "border-accent/35 bg-accent/10 text-accent"
                            : "border-signal/40 bg-signal/10 text-signal"
                        )}
                      >
                        {entry.recordType}
                      </span>
                    </td>
                    <td className="px-5 py-4 font-mono text-xs text-ink">
                      {entry.recordType === "SALE"
                        ? entry.orderId ?? "—"
                        : entry.expenseName ?? "—"}
                    </td>
                    <td className="px-5 py-4 font-mono text-xs text-ash">
                      {entry.sku ?? "—"}
                    </td>
                    <td className="px-5 py-4 font-mono text-ink">
                      {entry.quantity ?? "—"}
                    </td>
                    <td
                      className={cn(
                        "px-5 py-4 font-mono font-medium",
                        entry.recordType === "SALE"
                          ? "text-verified-green"
                          : "text-signal"
                      )}
                    >
                      {entry.recordType === "SALE"
                        ? money(entry.grossRevenueUsd)
                        : `−${money(entry.grossRevenueUsd)}`}
                    </td>
                    <td className="max-w-[14rem] px-5 py-4 text-ash">
                      {entry.notes ?? "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
