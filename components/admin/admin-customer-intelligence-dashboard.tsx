"use client";

import { useCallback, useEffect, useState } from "react";

type Signal = {
  id: number;
  theme: string;
  evidenceClass: string;
  currentCount: number;
  priorCount: number;
  confidenceLevel: string;
  status: string;
  recommendation: string | null;
  evidenceJson: Record<string, unknown>;
  signalType: string;
  sourceChannel: string;
};

type Dash = {
  evidenceHealth: Record<string, number>;
  earlySignals: Signal[];
  validatedSignals: Signal[];
  friction: Signal[];
  purchaseDrivers: Signal[];
  communityQuestions: Signal[];
  complianceSignals: Signal[];
  searchDemand: Signal[];
  whatCustomersAreSaying: Signal[];
  recommendations: Array<{
    id: number;
    recommendation: string | null;
    theme: string;
    sampleSize: number;
    confidence: string;
    evidenceNote: string;
    areaOwner: string;
  }>;
};

function SignalList({
  title,
  items,
  onAction,
  busy,
}: {
  title: string;
  items: Signal[];
  onAction: (action: string, id: number) => void;
  busy: boolean;
}) {
  return (
    <section>
      <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-ash">None.</p>
      ) : (
        <ul className="mt-3 space-y-3 text-sm">
          {items.map((s) => (
            <li key={s.id} className="border-b border-ink/10 pb-3">
              <p className="font-medium">
                {s.theme} · {s.confidenceLevel} · n={s.currentCount}
                {s.priorCount != null ? ` (prior ${s.priorCount})` : ""}
              </p>
              <p className="text-ash">
                {String(s.evidenceJson.note ?? "")} · {s.evidenceClass} ·{" "}
                {s.sourceChannel}
              </p>
              {Array.isArray(s.evidenceJson.explicitEvidence) &&
                (s.evidenceJson.explicitEvidence as string[]).length > 0 && (
                  <p className="mt-1 text-xs text-ink">
                    Explicit:{" "}
                    {(s.evidenceJson.explicitEvidence as string[])
                      .slice(0, 2)
                      .join(" · ")}
                  </p>
                )}
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  className="border border-ink/20 px-2 py-1 text-xs"
                  onClick={() => onAction("watch", s.id)}
                >
                  Mark watch
                </button>
                <button
                  type="button"
                  disabled={busy}
                  className="border border-ink/20 px-2 py-1 text-xs"
                  onClick={() => onAction("resolve", s.id)}
                >
                  Mark resolved
                </button>
                <button
                  type="button"
                  disabled={busy}
                  className="border border-ink/20 px-2 py-1 text-xs"
                  onClick={() => onAction("dismiss", s.id)}
                >
                  Dismiss
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function AdminCustomerIntelligenceDashboard() {
  const [data, setData] = useState<Dash | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [exportJson, setExportJson] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    const res = await fetch("/api/admin/customer-intelligence");
    if (!res.ok) {
      setError("Failed to load customer intelligence.");
      return;
    }
    setData((await res.json()) as Dash);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function post(action: string, extra: Record<string, unknown> = {}) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/customer-intelligence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        message?: string;
        export?: unknown;
      };
      if (!res.ok || json.ok === false) {
        setMessage(json.error ?? "Action failed");
      } else {
        setMessage(json.message ?? "Done.");
        if (json.export) setExportJson(JSON.stringify(json.export, null, 2));
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  const h = data?.evidenceHealth ?? {};

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-display-lg font-bold text-ink">
            PSL Labs Customer Intelligence
          </h1>
          <p className="mt-2 text-sm text-ash">
            Evidence-driven review only — never auto-edits site, FAQs, or content.
            Evidence classes stay separate.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void post("scan")}
            className="rounded border border-ink/20 bg-ink px-4 py-2 text-sm font-medium text-page disabled:opacity-50"
          >
            {busy ? "Working…" : "Regenerate intelligence"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void post("export")}
            className="rounded border border-ink/20 px-4 py-2 text-sm"
          >
            Export evidence summary
          </button>
        </div>
      </header>

      {error && <p className="text-sm text-red-700">{error}</p>}
      {message && <p className="text-sm text-ash">{message}</p>}

      <section>
        <h2 className="font-display text-lg font-semibold text-ink">
          Evidence health
        </h2>
        <ul className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
          <li className="border border-ink/10 p-3">
            <span className="font-medium">CUSTOMER — Support</span>
            <br />
            Current {h.supportCurrent ?? 0} · Prior {h.supportPrior ?? 0}
          </li>
          <li className="border border-ink/10 p-3">
            <span className="font-medium">CUSTOMER — Post-order feedback</span>
            <br />
            Current {h.feedbackCurrent ?? 0} · Prior {h.feedbackPrior ?? 0}
          </li>
          <li className="border border-ink/10 p-3">
            <span className="font-medium">COMMUNITY — Discord</span>
            <br />
            Current {h.communityCurrent ?? 0} · Prior {h.communityPrior ?? 0}
          </li>
          <li className="border border-ink/10 p-3">
            <span className="font-medium">SEARCH DEMAND</span>
            <br />
            Non-brand impressions {h.searchNonBrandImpressions ?? 0}
          </li>
        </ul>
      </section>

      {data && (
        <>
          <SignalList
            title="What customers are actually saying"
            items={data.whatCustomersAreSaying.slice(0, 20)}
            busy={busy}
            onAction={(a, id) => void post(a, { signalId: id })}
          />
          <SignalList
            title="Early signals"
            items={data.earlySignals}
            busy={busy}
            onAction={(a, id) => void post(a, { signalId: id })}
          />
          <SignalList
            title="Validated / recurring signals"
            items={data.validatedSignals}
            busy={busy}
            onAction={(a, id) => void post(a, { signalId: id })}
          />
          <SignalList
            title="Friction"
            items={data.friction}
            busy={busy}
            onAction={(a, id) => void post(a, { signalId: id })}
          />
          <SignalList
            title="Purchase drivers (explicit feedback only)"
            items={data.purchaseDrivers}
            busy={busy}
            onAction={(a, id) => void post(a, { signalId: id })}
          />
          <SignalList
            title="Community questions (not customer evidence)"
            items={data.communityQuestions}
            busy={busy}
            onAction={(a, id) => void post(a, { signalId: id })}
          />

          <section>
            <h2 className="font-display text-lg font-semibold text-ink">
              Recommended reviews
            </h2>
            {data.recommendations.length === 0 ? (
              <p className="mt-2 text-sm text-ash">
                Insufficient evidence for review recommendations.
              </p>
            ) : (
              <ul className="mt-3 space-y-2 text-sm">
                {data.recommendations.map((r) => (
                  <li key={r.id} className="border-b border-ink/10 pb-2">
                    <span className="font-medium">{r.recommendation}</span> ·{" "}
                    {r.areaOwner} · n={r.sampleSize} · {r.confidence}
                    <br />
                    <span className="text-ash">{r.evidenceNote}</span>
                    {r.recommendation === "CONTENT_OPPORTUNITY_REVIEW" ||
                    r.theme.includes("coa") ||
                    r.theme.includes("documentation") ? (
                      <p className="mt-1 text-xs">
                        Hand-off:{" "}
                        <a className="underline" href="/admin-authority">
                          Authority Engine
                        </a>{" "}
                        (no auto-create/approve).
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {data.complianceSignals.length > 0 && (
            <section>
              <h2 className="font-display text-lg font-semibold text-ink">
                Compliance-only (restricted human-use)
              </h2>
              <p className="mt-1 text-xs text-ash">
                Never used for marketing, testimonials, or content opportunities.
              </p>
              <ul className="mt-2 text-sm text-ash">
                {data.complianceSignals.map((s) => (
                  <li key={s.id}>
                    {s.theme} · n={s.currentCount} · {s.confidenceLevel}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {exportJson && (
        <pre className="overflow-x-auto whitespace-pre-wrap border border-ink/10 p-3 text-xs">
          {exportJson}
        </pre>
      )}
    </div>
  );
}
