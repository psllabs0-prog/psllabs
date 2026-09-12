"use client";

import { useCallback, useEffect, useState } from "react";

type Opportunity = {
  id: number;
  type: string;
  status: string;
  primaryQuery: string;
  page: string;
  evidenceJson: Record<string, unknown>;
  priorityScore: number;
  intent: string;
  riskLevel: string;
};

type Brief = {
  id: number;
  opportunityId: number;
  title: string;
  slugOrTargetPage: string;
  briefJson: Record<string, unknown>;
  riskLevel: string;
  claimsReviewRequired: boolean;
};

type Dashboard = {
  searchHealth: {
    clicks: number | null;
    impressions: number | null;
    nonBrandClicks: number | null;
    nonBrandImpressions: number | null;
    latestSync: string | null;
    rowsSynced: number;
    note: string | null;
  };
  opportunities: Opportunity[];
  knownPages: Array<{ path: string; title: string; kind: string }>;
  internalLinkOpportunities: Array<{
    from: string;
    to: string;
    reason: string;
  }>;
};

export function AdminAuthorityDashboard() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [activeBrief, setActiveBrief] = useState<Brief | null>(null);
  const [exportText, setExportText] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    const res = await fetch("/api/admin/authority");
    if (!res.ok) {
      setError("Failed to load authority dashboard.");
      return;
    }
    setData((await res.json()) as Dashboard);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function post(action: string, extra: Record<string, unknown> = {}) {
    setBusy(true);
    setMessage(null);
    setExportText(null);
    try {
      const res = await fetch("/api/admin/authority", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        message?: string;
        note?: string;
        brief?: Brief;
        export?: { text: string; json: string };
      };
      if (!res.ok || json.ok === false) {
        setMessage(json.error ?? "Action failed");
      } else {
        setMessage(json.note ?? json.message ?? "Done.");
        if (json.brief) setActiveBrief(json.brief);
        if (json.export) setExportText(json.export.text);
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  const health = data?.searchHealth;

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-display-lg font-bold text-ink">
            PSL Labs Authority Engine
          </h1>
          <p className="mt-2 text-sm text-ash">
            Analytical/testing authority only. Publishing status records
            workflow — it never deploys public content.
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void post("scan")}
          className="rounded border border-ink/20 bg-ink px-4 py-2 text-sm font-medium text-page disabled:opacity-50"
        >
          {busy ? "Working…" : "Scan opportunities"}
        </button>
      </header>

      {error && <p className="text-sm text-red-700">{error}</p>}
      {message && <p className="text-sm text-ash">{message}</p>}

      <section>
        <h2 className="font-display text-lg font-semibold text-ink">
          Search health
        </h2>
        {!data ? (
          <p className="mt-2 text-sm text-ash">Loading…</p>
        ) : (
          <p className="mt-2 text-sm text-ink">
            Clicks {health?.clicks ?? "—"} · Impressions{" "}
            {health?.impressions ?? "—"} · Non-brand clicks{" "}
            {health?.nonBrandClicks ?? "—"} · Non-brand impressions{" "}
            {health?.nonBrandImpressions ?? "—"} · Latest sync{" "}
            {health?.latestSync ?? "—"}
          </p>
        )}
        {health?.note && (
          <p className="mt-1 text-sm text-ash">{health.note}</p>
        )}
      </section>

      <section>
        <h2 className="font-display text-lg font-semibold text-ink">
          Opportunity queue
        </h2>
        {!data?.opportunities.length ? (
          <p className="mt-2 text-sm text-ash">
            Insufficient SEO evidence for new action.
          </p>
        ) : (
          <ul className="mt-3 space-y-4">
            {data.opportunities.map((o) => (
              <li
                key={o.id}
                className="border-b border-ink/10 pb-4 text-sm"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-medium text-ink">
                    {o.priorityScore.toFixed(0)} · {o.type} · {o.status}
                  </p>
                  <p className="text-ash">
                    {o.intent} · {o.riskLevel}
                  </p>
                </div>
                <p className="mt-1 text-ink">
                  {o.primaryQuery || "(no query)"}
                  {o.page ? ` → ${o.page}` : ""}
                </p>
                <p className="mt-1 text-xs text-ash">
                  Evidence: {JSON.stringify(o.evidenceJson).slice(0, 220)}
                  {JSON.stringify(o.evidenceJson).length > 220 ? "…" : ""}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    className="border border-ink/20 px-2 py-1 text-xs"
                    onClick={() =>
                      void post("approve", { opportunityId: o.id })
                    }
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className="border border-ink/20 px-2 py-1 text-xs"
                    onClick={() =>
                      void post("dismiss", { opportunityId: o.id })
                    }
                  >
                    Dismiss
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className="border border-ink/20 px-2 py-1 text-xs"
                    onClick={() =>
                      void post("in_progress", { opportunityId: o.id })
                    }
                  >
                    Mark in progress
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className="border border-ink/20 px-2 py-1 text-xs"
                    onClick={() =>
                      void post("generate_brief", { opportunityId: o.id })
                    }
                  >
                    Generate brief
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className="border border-ink/20 px-2 py-1 text-xs"
                    onClick={() =>
                      void post("drafted", { opportunityId: o.id })
                    }
                  >
                    Mark drafted
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className="border border-ink/20 px-2 py-1 text-xs"
                    onClick={() =>
                      void post("published", { opportunityId: o.id })
                    }
                  >
                    Mark published (record only)
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="font-display text-lg font-semibold text-ink">
          Content brief view
        </h2>
        {!activeBrief ? (
          <p className="mt-2 text-sm text-ash">
            Generate a brief from an approved opportunity to view it here.
          </p>
        ) : (
          <div className="mt-3 space-y-2 text-sm">
            <p className="font-medium">{activeBrief.title}</p>
            <p className="text-ash">
              Target: {activeBrief.slugOrTargetPage} · Risk:{" "}
              {activeBrief.riskLevel}
              {activeBrief.claimsReviewRequired
                ? " · CLAIMS REVIEW REQUIRED"
                : ""}
            </p>
            <pre className="overflow-x-auto whitespace-pre-wrap border border-ink/10 bg-page p-3 text-xs">
              {JSON.stringify(activeBrief.briefJson, null, 2)}
            </pre>
            <button
              type="button"
              disabled={busy}
              className="border border-ink/20 px-3 py-1.5 text-xs"
              onClick={() =>
                void post("export_brief", { briefId: activeBrief.id })
              }
            >
              Export for specialist
            </button>
          </div>
        )}
        {exportText && (
          <pre className="mt-3 overflow-x-auto whitespace-pre-wrap border border-ink/10 p-3 text-xs">
            {exportText}
          </pre>
        )}
      </section>

      <section>
        <h2 className="font-display text-lg font-semibold text-ink">
          Internal link opportunities
        </h2>
        <ul className="mt-2 space-y-1 text-sm text-ash">
          {(data?.internalLinkOpportunities ?? []).map((l) => (
            <li key={`${l.from}->${l.to}`}>
              {l.from} → {l.to} — {l.reason}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-ash">
          Recommendations only — never inserted into production pages
          automatically.
        </p>
      </section>
    </div>
  );
}
