"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";
import type { AdminInventoryRow, StockHistoryRow } from "@/lib/inventory/store";

type AdminInventoryDashboardProps = {
  products: AdminInventoryRow[];
  history: StockHistoryRow[];
};

export function AdminInventoryDashboard({
  products: initialProducts,
  history,
}: AdminInventoryDashboardProps) {
  const [products, setProducts] = useState(initialProducts);
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(initialProducts.map((row) => [row.handle, String(row.stock)]))
  );
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [busyHandle, setBusyHandle] = useState<string | null>(null);

  async function handleUpdate(handle: string) {
    const stock = Number(drafts[handle]);
    if (!Number.isInteger(stock) || stock < 0) {
      setMessages((current) => ({
        ...current,
        [handle]: "Enter a non-negative whole number.",
      }));
      return;
    }

    setBusyHandle(handle);
    setMessages((current) => ({ ...current, [handle]: "" }));

    try {
      const res = await fetch("/api/admin/inventory/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle, stock }),
      });
      const data = (await res.json()) as { error?: string; stock?: number };

      if (!res.ok) {
        setMessages((current) => ({
          ...current,
          [handle]: data.error ?? "Update failed.",
        }));
        return;
      }

      setProducts((current) =>
        current.map((row) =>
          row.handle === handle ? { ...row, stock: data.stock ?? stock } : row
        )
      );
      setMessages((current) => ({
        ...current,
        [handle]: "Stock updated.",
      }));
    } catch {
      setMessages((current) => ({
        ...current,
        [handle]: "Update failed.",
      }));
    } finally {
      setBusyHandle(null);
    }
  }

  return (
    <div className="flex flex-col gap-10">
      <section className="premium-card overflow-hidden">
        <div className="border-b border-linen px-5 py-4">
          <h2 className="font-display text-xl font-bold text-ink">
            Active inventory
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b border-linen bg-surface text-left text-ash">
              <tr>
                <th className="px-5 py-3 font-medium">Product</th>
                <th className="px-5 py-3 font-medium">SKU</th>
                <th className="px-5 py-3 font-medium">Stock</th>
                <th className="px-5 py-3 font-medium">Set level</th>
                <th className="px-5 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {products.map((row) => (
                <tr key={row.handle} className="border-b border-linen last:border-b-0">
                  <td className="px-5 py-4 font-medium text-ink">{row.name}</td>
                  <td className="px-5 py-4 font-mono text-xs text-ash">
                    {row.sku ?? "—"}
                  </td>
                  <td className="px-5 py-4 font-mono text-ink">{row.stock}</td>
                  <td className="px-5 py-4">
                    <Input
                      type="number"
                      min={0}
                      step={1}
                      value={drafts[row.handle] ?? ""}
                      onChange={(e) =>
                        setDrafts((current) => ({
                          ...current,
                          [row.handle]: e.target.value,
                        }))
                      }
                      className="h-10 w-28 rounded-lg border-linen bg-lab-white px-3 font-mono"
                    />
                  </td>
                  <td className="px-5 py-4">
                    <button
                      type="button"
                      disabled={busyHandle === row.handle}
                      onClick={() => void handleUpdate(row.handle)}
                      className="rounded-pill bg-accent px-4 py-2 text-sm font-medium text-page transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {busyHandle === row.handle ? "Saving…" : "Update"}
                    </button>
                    {messages[row.handle] && (
                      <p className="mt-2 text-xs text-ash">{messages[row.handle]}</p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="premium-card overflow-hidden">
        <div className="border-b border-linen px-5 py-4">
          <h2 className="font-display text-xl font-bold text-ink">
            Recent stock changes
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b border-linen bg-surface text-left text-ash">
              <tr>
                <th className="px-5 py-3 font-medium">When</th>
                <th className="px-5 py-3 font-medium">SKU</th>
                <th className="px-5 py-3 font-medium">Change</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-5 py-6 text-ash">
                    No stock changes recorded yet.
                  </td>
                </tr>
              ) : (
                history.map((entry) => (
                  <tr
                    key={entry.id}
                    className="border-b border-linen last:border-b-0"
                  >
                    <td className="px-5 py-4 text-ink">
                      {new Date(entry.changedAt).toLocaleString()}
                    </td>
                    <td className="px-5 py-4 font-mono text-xs text-ash">
                      {entry.sku ?? entry.handle}
                    </td>
                    <td className="px-5 py-4 font-mono text-ink">
                      {entry.oldStock} → {entry.newStock}
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
