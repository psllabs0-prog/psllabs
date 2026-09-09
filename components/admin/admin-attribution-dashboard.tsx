"use client";

import { useCallback, useEffect, useState } from "react";

import { PillButton } from "@/components/ui/pill-button";
import type { OrderAttributionAdminRow } from "@/lib/orders/store";

function money(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

export function AdminAttributionDashboard() {
  const [rows, setRows] = useState<OrderAttributionAdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/attribution", { cache: "no-store" });
      if (!res.ok) {
        setError("Unable to load attribution.");
        setRows([]);
        return;
      }
      const data = (await res.json()) as { rows?: OrderAttributionAdminRow[] };
      setRows(data.rows ?? []);
    } catch {
      setError("Unable to load attribution.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mono text-xs uppercase tracking-wider text-ash">
            Acquisition
          </p>
          <h1 className="mt-1 font-display text-display-md font-bold text-ink">
            Order attribution
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-ash">
            Last paid touch before checkout (30-day window). Direct revisits do
            not overwrite a known paid source. UTM naming: source / medium /
            campaign / content.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <PillButton href="/admin-ledger" variant="secondary" size="sm">
            Ledger
          </PillButton>
          <a
            href="/api/admin/attribution?format=csv"
            className="inline-flex items-center justify-center rounded-pill border border-border-strong bg-transparent px-5 py-2.5 text-sm font-medium text-ink transition-opacity hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Export CSV
          </a>
          <PillButton type="button" size="sm" onClick={() => void load()}>
            Refresh
          </PillButton>
        </div>
      </header>

      {loading && <p className="text-sm text-ash">Loading…</p>}
      {error && (
        <p className="rounded-lg border border-linen bg-surface px-4 py-3 text-sm text-signal">
          {error}
        </p>
      )}

      {!loading && !error && rows.length === 0 && (
        <p className="text-sm text-ash">No orders found yet.</p>
      )}

      {!loading && rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-linen bg-surface">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-linen bg-paper text-xs uppercase tracking-wider text-ash">
              <tr>
                <th className="px-3 py-3 font-medium">Date</th>
                <th className="px-3 py-3 font-medium">Order</th>
                <th className="px-3 py-3 font-medium">Source</th>
                <th className="px-3 py-3 font-medium">Medium</th>
                <th className="px-3 py-3 font-medium">Campaign</th>
                <th className="px-3 py-3 font-medium">Creative</th>
                <th className="px-3 py-3 font-medium">Landing</th>
                <th className="px-3 py-3 font-medium">Products</th>
                <th className="px-3 py-3 font-medium">Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-linen">
              {rows.map((row) => (
                <tr key={row.orderId} className="align-top">
                  <td className="whitespace-nowrap px-3 py-3 text-ash">
                    {formatDate(row.paidAt ?? row.createdAt)}
                  </td>
                  <td className="px-3 py-3 font-mono text-xs text-ink">
                    <div>{row.orderId}</div>
                    <div className="mt-0.5 text-stone">{row.status}</div>
                  </td>
                  <td className="px-3 py-3 text-ink">{row.utmSource || "—"}</td>
                  <td className="px-3 py-3 text-ink">{row.utmMedium || "—"}</td>
                  <td className="px-3 py-3 text-ink">
                    {row.utmCampaign || "—"}
                  </td>
                  <td className="px-3 py-3 text-ink">
                    {row.utmContent || "—"}
                  </td>
                  <td className="max-w-[180px] break-all px-3 py-3 text-ash">
                    {row.landingPage || "—"}
                  </td>
                  <td className="max-w-[160px] px-3 py-3 text-ink">
                    {row.products || "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 font-medium text-ink">
                    {money(row.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
