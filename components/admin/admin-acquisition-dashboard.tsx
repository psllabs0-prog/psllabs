"use client";

import { useCallback, useEffect, useState } from "react";

type Dashboard = {
  hasPaidData: boolean;
  contributionEconomics: string;
  connectors: Array<{
    provider: string;
    state: string;
    message: string;
    lastSyncAt: string | null;
    lastError: string | null;
  }>;
  learningBudget: {
    ceilingUsd: number;
    spentUsd: number;
    remainingUsd: number;
    pctOfCeiling: number;
    reviewState: string;
  };
  funnel: {
    sessions: null;
    addToCart: null;
    checkoutStart: null;
    paymentAttempt: null;
    note: string;
  };
  platformSummary: Array<{
    platform: string;
    spendUsd: number;
    clicks: number;
    impressions: number;
    pslOrders: number;
    pslRevenueUsd: number;
    cacUsd: number | null;
    roas: number | null;
  }>;
  campaigns: Array<{
    platform: string;
    campaignName: string;
    spendUsd: number;
    clicks: number;
    pslOrders: number;
    pslRevenueUsd: number;
    cacUsd: number | null;
    roas: number | null;
    sampleNote: string;
    dataConfidence: string;
  }>;
  creatives: Array<{
    platform: string;
    contentKey: string;
    spendUsd: number;
    orders: number;
    revenueUsd: number;
    cacUsd: number | null;
    roas: number | null;
    sampleNote: string;
  }>;
  measurementWarnings: string[];
  unmatched: {
    platformCampaignsWithoutPsl: string[];
    pslOrdersWithoutPlatform: string[];
  };
  reviewSignals: Array<{
    code: string;
    severity: string;
    message: string;
  }>;
};

function money(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `$${n.toFixed(2)}`;
}

export function AdminAcquisitionDashboard() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    const res = await fetch("/api/admin/acquisition");
    if (!res.ok) {
      setError("Failed to load acquisition dashboard.");
      return;
    }
    setData((await res.json()) as Dashboard);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function runSync() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/acquisition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync_paid" }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        result?: { providers?: Array<{ provider: string; status: string; recordsWritten: number }> };
      };
      if (!res.ok || json.ok === false) {
        setMessage(json.error ?? "Sync failed");
      } else {
        const parts = (json.result?.providers ?? [])
          .map((p) => `${p.provider}:${p.status}(${p.recordsWritten})`)
          .join(" · ");
        setMessage(`Paid sync finished. ${parts || "No provider results."}`);
      }
      await refresh();
    } catch {
      setMessage("Sync request failed.");
    } finally {
      setBusy(false);
    }
  }

  const lb = data?.learningBudget;

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-display-lg font-bold text-ink">
            Acquisition intelligence
          </h1>
          <p className="mt-2 text-sm text-ash">
            Analysis only — never creates or edits ad campaigns. PSL Neon orders
            are the revenue source of truth.
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void runSync()}
          className="rounded border border-ink/20 bg-ink px-4 py-2 text-sm font-medium text-page disabled:opacity-50"
        >
          {busy ? "Syncing…" : "Run paid sync"}
        </button>
      </header>

      {error && <p className="text-sm text-red-700">{error}</p>}
      {message && <p className="text-sm text-ash">{message}</p>}

      {!data ? (
        <p className="text-sm text-ash">Loading…</p>
      ) : !data.hasPaidData ? (
        <p className="text-sm text-ash">No paid data yet.</p>
      ) : null}

      {data && (
        <>
          <section>
            <h2 className="font-display text-lg font-semibold text-ink">
              Connectors
            </h2>
            <ul className="mt-3 space-y-2 text-sm">
              {data.connectors.map((c) => (
                <li key={c.provider} className="border-b border-ink/10 pb-2">
                  <span className="font-medium uppercase">{c.provider}</span>
                  {" — "}
                  <span>{c.state}</span>
                  <span className="text-ash"> · {c.message}</span>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="font-display text-lg font-semibold text-ink">
              Current learning budget
            </h2>
            {lb && (
              <p className="mt-2 text-sm text-ink">
                Spent {money(lb.spentUsd)} · Remaining {money(lb.remainingUsd)}{" "}
                · {lb.pctOfCeiling.toFixed(0)}% of ${lb.ceilingUsd} ceiling ·{" "}
                {lb.reviewState}
              </p>
            )}
            <p className="mt-1 text-xs text-ash">
              Ceiling is informational only. This system never spends or stops
              spend.
            </p>
          </section>

          <section>
            <h2 className="font-display text-lg font-semibold text-ink">
              Funnel
            </h2>
            <p className="mt-2 text-sm text-ash">{data.funnel.note}</p>
            <ul className="mt-2 grid gap-1 text-sm text-ash sm:grid-cols-2">
              <li>Sessions: unavailable</li>
              <li>Add to cart: unavailable</li>
              <li>Checkout start: unavailable</li>
              <li>Payment attempt: unavailable</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-lg font-semibold text-ink">
              Platform summary
            </h2>
            {data.platformSummary.length === 0 ? (
              <p className="mt-2 text-sm text-ash">No platform spend rows.</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-ink/15 text-ash">
                      <th className="py-2 pr-3 font-medium">Platform</th>
                      <th className="py-2 pr-3 font-medium">Spend</th>
                      <th className="py-2 pr-3 font-medium">Clicks</th>
                      <th className="py-2 pr-3 font-medium">PSL orders</th>
                      <th className="py-2 pr-3 font-medium">PSL revenue</th>
                      <th className="py-2 pr-3 font-medium">CAC</th>
                      <th className="py-2 font-medium">ROAS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.platformSummary.map((p) => (
                      <tr key={p.platform} className="border-b border-ink/10">
                        <td className="py-2 pr-3">{p.platform}</td>
                        <td className="py-2 pr-3">{money(p.spendUsd)}</td>
                        <td className="py-2 pr-3">{p.clicks}</td>
                        <td className="py-2 pr-3">{p.pslOrders}</td>
                        <td className="py-2 pr-3">{money(p.pslRevenueUsd)}</td>
                        <td className="py-2 pr-3">{money(p.cacUsd)}</td>
                        <td className="py-2">
                          {p.roas == null ? "—" : p.roas.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section>
            <h2 className="font-display text-lg font-semibold text-ink">
              Campaigns
            </h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="border-b border-ink/15 text-ash">
                    <th className="py-2 pr-3 font-medium">Campaign</th>
                    <th className="py-2 pr-3 font-medium">Spend</th>
                    <th className="py-2 pr-3 font-medium">Clicks</th>
                    <th className="py-2 pr-3 font-medium">Orders</th>
                    <th className="py-2 pr-3 font-medium">Revenue</th>
                    <th className="py-2 pr-3 font-medium">CAC</th>
                    <th className="py-2 pr-3 font-medium">ROAS</th>
                    <th className="py-2 font-medium">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {data.campaigns.map((c) => (
                    <tr
                      key={`${c.platform}:${c.campaignName}`}
                      className="border-b border-ink/10"
                    >
                      <td className="py-2 pr-3">
                        {c.platform} · {c.campaignName}
                      </td>
                      <td className="py-2 pr-3">{money(c.spendUsd)}</td>
                      <td className="py-2 pr-3">{c.clicks}</td>
                      <td className="py-2 pr-3">{c.pslOrders}</td>
                      <td className="py-2 pr-3">{money(c.pslRevenueUsd)}</td>
                      <td className="py-2 pr-3">{money(c.cacUsd)}</td>
                      <td className="py-2 pr-3">
                        {c.roas == null ? "—" : c.roas.toFixed(2)}
                      </td>
                      <td className="py-2 text-ash">{c.sampleNote}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="font-display text-lg font-semibold text-ink">
              Creatives
            </h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-ink/15 text-ash">
                    <th className="py-2 pr-3 font-medium">Content / ad</th>
                    <th className="py-2 pr-3 font-medium">Spend</th>
                    <th className="py-2 pr-3 font-medium">Orders</th>
                    <th className="py-2 pr-3 font-medium">Revenue</th>
                    <th className="py-2 pr-3 font-medium">CAC</th>
                    <th className="py-2 pr-3 font-medium">ROAS</th>
                    <th className="py-2 font-medium">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {data.creatives.map((c) => (
                    <tr
                      key={`${c.platform}:${c.contentKey}`}
                      className="border-b border-ink/10"
                    >
                      <td className="py-2 pr-3">
                        {c.platform} · {c.contentKey}
                      </td>
                      <td className="py-2 pr-3">{money(c.spendUsd)}</td>
                      <td className="py-2 pr-3">{c.orders}</td>
                      <td className="py-2 pr-3">{money(c.revenueUsd)}</td>
                      <td className="py-2 pr-3">{money(c.cacUsd)}</td>
                      <td className="py-2 pr-3">
                        {c.roas == null ? "—" : c.roas.toFixed(2)}
                      </td>
                      <td className="py-2 text-ash">{c.sampleNote}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="font-display text-lg font-semibold text-ink">
              Measurement warnings
            </h2>
            {data.measurementWarnings.length === 0 ? (
              <p className="mt-2 text-sm text-ash">None.</p>
            ) : (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                {data.measurementWarnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="font-display text-lg font-semibold text-ink">
              Unmatched data
            </h2>
            <p className="mt-2 text-sm text-ash">
              Platform campaigns without PSL match:{" "}
              {data.unmatched.platformCampaignsWithoutPsl.join(", ") || "none"}
            </p>
            <p className="mt-1 text-sm text-ash">
              PSL paid orders without platform row:{" "}
              {data.unmatched.pslOrdersWithoutPlatform.join(", ") || "none"}
            </p>
          </section>

          <section>
            <h2 className="font-display text-lg font-semibold text-ink">
              Review signals
            </h2>
            {data.reviewSignals.length === 0 ? (
              <p className="mt-2 text-sm text-ash">None.</p>
            ) : (
              <ul className="mt-2 space-y-2 text-sm">
                {data.reviewSignals.map((s) => (
                  <li key={`${s.code}:${s.message}`}>
                    <span className="font-mono text-xs">{s.code}</span> ·{" "}
                    {s.message}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-ash">
              Contribution economics: {data.contributionEconomics}
            </p>
          </section>
        </>
      )}
    </div>
  );
}
