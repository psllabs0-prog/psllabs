"use client";

import { useCallback, useEffect, useState } from "react";

import type {
  FinanceJobRunRow,
  FinanceTransactionRow,
  PaymentEventRow,
  ReconciliationWarningRow,
} from "@/lib/finance/types";

type FinancePayload = {
  sheetsConfigured: boolean;
  tagadaApiConfigured: boolean;
  /** Optional backup; false means Not configured / optional — not a blocker. */
  tagadaWebhookConfigured: boolean;
  lastReconciliation: FinanceJobRunRow | null;
  events: PaymentEventRow[];
  transactions: FinanceTransactionRow[];
  warnings: ReconciliationWarningRow[];
};

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

function money(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}

export function AdminFinanceDashboard() {
  const [data, setData] = useState<FinancePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reconciling, setReconciling] = useState(false);
  const [reconMessage, setReconMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    const res = await fetch("/api/admin/finance");
    if (!res.ok) {
      setError("Failed to load finance status.");
      setLoading(false);
      return;
    }
    const json = (await res.json()) as FinancePayload;
    setData(json);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function runReconcile() {
    setReconciling(true);
    setReconMessage(null);
    try {
      const res = await fetch("/api/admin/finance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reconcile" }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        summary?: Record<string, unknown>;
      };
      if (!res.ok || !json.ok) {
        setReconMessage(json.error ?? "Reconciliation failed");
      } else {
        setReconMessage("Reconciliation finished.");
        await refresh();
      }
    } catch {
      setReconMessage("Reconciliation request failed.");
    } finally {
      setReconciling(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-ash">Loading finance status…</p>;
  }

  if (error || !data) {
    return <p className="text-sm text-signal">{error ?? "Unavailable"}</p>;
  }

  return (
    <div className="space-y-10">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-display text-display-lg font-bold text-ink">
            Finance pipeline
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-ash">
            Payment events and revenue mirror status. Neon remains the source of
            truth; Google Sheets is a reporting mirror only. Processor fees use
            finance_transactions.processor_fee (NULL when unknown) — not the
            legacy ledger fee default of 0. Tagada card finance is recorded on
            successful checkout; daily reconciliation uses the Tagada API and
            pay_/ord_ identifiers as the integrity check. A Tagada webhook is
            optional backup only.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void runReconcile()}
          disabled={reconciling}
          className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {reconciling ? "Running…" : "Run reconciliation"}
        </button>
      </header>

      {reconMessage && <p className="text-sm text-ash">{reconMessage}</p>}

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <article className="premium-card p-5">
          <p className="mono text-xs uppercase tracking-wider text-ash">
            Sheets mirror
          </p>
          <p className="mt-2 text-lg text-ink">
            {data.sheetsConfigured ? "Configured" : "Not configured"}
          </p>
        </article>
        <article className="premium-card p-5">
          <p className="mono text-xs uppercase tracking-wider text-ash">
            Tagada webhook
          </p>
          <p className="mt-2 text-lg text-ink">
            {data.tagadaWebhookConfigured
              ? "Configured"
              : "Not configured / optional"}
          </p>
          <p className="mt-1 text-sm text-ash">
            Backup only — checkout + daily API reconcile remain primary.
          </p>
        </article>
        <article className="premium-card p-5">
          <p className="mono text-xs uppercase tracking-wider text-ash">
            Last reconciliation
          </p>
          <p className="mt-2 text-lg text-ink">
            {formatDate(
              data.lastReconciliation?.finishedAt ??
                data.lastReconciliation?.startedAt
            )}
          </p>
          <p className="mt-1 text-sm text-ash">
            {data.lastReconciliation?.status ?? "never run"}
            {data.tagadaApiConfigured ? " · Tagada API ready" : ""}
          </p>
        </article>
        <article className="premium-card p-5">
          <p className="mono text-xs uppercase tracking-wider text-ash">
            Open warnings
          </p>
          <p className="mt-2 text-lg text-ink">{data.warnings.length}</p>
        </article>
      </section>

      {data.lastReconciliation?.summaryJson ? (
        <section className="premium-card space-y-3 p-5">
          <h2 className="font-display text-xl font-semibold text-ink">
            Latest reconciliation summary
          </h2>
          <dl className="grid gap-3 text-sm md:grid-cols-3">
            <div>
              <dt className="text-ash">Orders checked</dt>
              <dd className="font-mono text-ink">
                {String(data.lastReconciliation.summaryJson.ordersChecked ?? "—")}
              </dd>
            </div>
            <div>
              <dt className="text-ash">Finance backfilled</dt>
              <dd className="font-mono text-ink">
                {String(
                  data.lastReconciliation.summaryJson.financeBackfilled ?? "—"
                )}
              </dd>
            </div>
            <div>
              <dt className="text-ash">Warnings created</dt>
              <dd className="font-mono text-ink">
                {String(
                  data.lastReconciliation.summaryJson.warningsCreated ?? "—"
                )}
              </dd>
            </div>
            <div>
              <dt className="text-ash">Warnings resolved</dt>
              <dd className="font-mono text-ink">
                {String(
                  data.lastReconciliation.summaryJson.warningsResolved ?? "—"
                )}
              </dd>
            </div>
            <div>
              <dt className="text-ash">Sheet synced</dt>
              <dd className="font-mono text-ink">
                {String(
                  (
                    data.lastReconciliation.summaryJson.sheetSync as
                      | { synced?: number }
                      | undefined
                  )?.synced ?? "—"
                )}
              </dd>
            </div>
            <div>
              <dt className="text-ash">Sheet failed</dt>
              <dd className="font-mono text-ink">
                {String(
                  (
                    data.lastReconciliation.summaryJson.sheetSync as
                      | { failed?: number }
                      | undefined
                  )?.failed ?? "—"
                )}
              </dd>
            </div>
            <div>
              <dt className="text-ash">Sheet skipped</dt>
              <dd className="font-mono text-ink">
                {String(
                  (
                    data.lastReconciliation.summaryJson.sheetSync as
                      | { skipped?: number }
                      | undefined
                  )?.skipped ?? "—"
                )}
              </dd>
            </div>
          </dl>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="font-display text-xl font-semibold text-ink">
          Reconciliation warnings
        </h2>
        {data.warnings.length === 0 ? (
          <p className="text-sm text-ash">No open warnings.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-ash">
                <tr>
                  <th className="py-2 pr-4">Type</th>
                  <th className="py-2 pr-4">Order</th>
                  <th className="py-2 pr-4">Provider</th>
                  <th className="py-2">Message</th>
                </tr>
              </thead>
              <tbody>
                {data.warnings.map((w) => (
                  <tr key={w.id} className="border-t border-black/10">
                    <td className="py-2 pr-4 font-mono text-xs">{w.warningType}</td>
                    <td className="py-2 pr-4 font-mono text-xs">
                      {w.pslOrderId ?? "—"}
                    </td>
                    <td className="py-2 pr-4">{w.provider ?? "—"}</td>
                    <td className="py-2">{w.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl font-semibold text-ink">
          Recent finance transactions
        </h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-ash">
              <tr>
                <th className="py-2 pr-4">Date</th>
                <th className="py-2 pr-4">Order</th>
                <th className="py-2 pr-4">Provider</th>
                <th className="py-2 pr-4">Gross</th>
                <th className="py-2">Sheet sync</th>
              </tr>
            </thead>
            <tbody>
              {data.transactions.map((tx) => (
                <tr key={tx.id} className="border-t border-black/10">
                  <td className="py-2 pr-4">{formatDate(tx.eventTimestamp)}</td>
                  <td className="py-2 pr-4 font-mono text-xs">{tx.pslOrderId}</td>
                  <td className="py-2 pr-4">{tx.provider}</td>
                  <td className="py-2 pr-4">{money(tx.grossAmount)}</td>
                  <td className="py-2">
                    {tx.sheetSyncStatus}
                    {tx.sheetSyncError ? (
                      <span className="ml-2 text-xs text-signal">
                        {tx.sheetSyncError}
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl font-semibold text-ink">
          Recent payment events
        </h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-ash">
              <tr>
                <th className="py-2 pr-4">Created</th>
                <th className="py-2 pr-4">Provider</th>
                <th className="py-2 pr-4">Type</th>
                <th className="py-2 pr-4">Order</th>
                <th className="py-2 pr-4">Amount</th>
                <th className="py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.events.map((ev) => (
                <tr key={ev.id} className="border-t border-black/10">
                  <td className="py-2 pr-4">{formatDate(ev.createdAt)}</td>
                  <td className="py-2 pr-4">{ev.provider}</td>
                  <td className="py-2 pr-4 font-mono text-xs">{ev.eventType}</td>
                  <td className="py-2 pr-4 font-mono text-xs">
                    {ev.pslOrderId ?? "—"}
                  </td>
                  <td className="py-2 pr-4">{money(ev.amount)}</td>
                  <td className="py-2">{ev.processingStatus}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
