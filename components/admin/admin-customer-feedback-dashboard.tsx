"use client";

import { useCallback, useEffect, useState } from "react";

import { PillButton } from "@/components/ui/pill-button";

type FeedbackAdminRow = {
  id: string;
  orderId: string;
  submittedAt: string;
  discoverySourceStated: string | null;
  discoverySourceLabel: string;
  purchaseDrivers: string[];
  purchaseDriverLabels: string[];
  openFeedback: string | null;
  status: "submitted" | "skipped";
  surveyVersion: string;
  submittedFrom: string;
};

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

export function AdminCustomerFeedbackDashboard() {
  const [rows, setRows] = useState<FeedbackAdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/customer-feedback", {
        cache: "no-store",
      });
      if (!res.ok) {
        setError("Unable to load customer feedback.");
        setRows([]);
        return;
      }
      const data = (await res.json()) as { rows?: FeedbackAdminRow[] };
      setRows(data.rows ?? []);
    } catch {
      setError("Unable to load customer feedback.");
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
            Internal
          </p>
          <h1 className="mt-1 font-display text-display-md font-bold text-ink">
            Customer feedback
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-ash">
            Optional post-purchase answers from the order success page. Not for
            public display or testimonials.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <PillButton href="/admin-ledger" variant="secondary" size="sm">
            Ledger
          </PillButton>
          <a
            href="/api/admin/customer-feedback?format=csv"
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
        <p className="text-sm text-ash">No feedback responses yet.</p>
      )}

      {!loading && rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-linen bg-surface">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-linen bg-paper text-xs uppercase tracking-wider text-ash">
              <tr>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Order ID</th>
                <th className="px-4 py-3 font-medium">Discovery</th>
                <th className="px-4 py-3 font-medium">Drivers</th>
                <th className="px-4 py-3 font-medium">Open feedback</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Version</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-linen">
              {rows.map((row) => (
                <tr key={row.id} className="align-top">
                  <td className="whitespace-nowrap px-4 py-3 text-ash">
                    {formatDate(row.submittedAt)}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-ink">
                    {row.orderId}
                  </td>
                  <td className="px-4 py-3 text-ink">
                    {row.discoverySourceLabel || "—"}
                  </td>
                  <td className="px-4 py-3 text-ink">
                    {row.purchaseDriverLabels.length > 0
                      ? row.purchaseDriverLabels.join(", ")
                      : "—"}
                  </td>
                  <td className="max-w-[280px] px-4 py-3 text-ash">
                    {row.openFeedback ? (
                      <span className="whitespace-pre-wrap break-words">
                        {row.openFeedback}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink">{row.status}</td>
                  <td className="px-4 py-3 text-ash">{row.surveyVersion}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
