"use client";

import { useCallback, useEffect, useState } from "react";

type Signal = {
  signalKey: string;
  signalType: string;
  area: string;
  priority: string;
  confidence: string;
  status: string;
  title: string;
  summary: string;
  recommendation: string;
  reasoningJson: {
    decision?: string;
    why?: string;
    expectedUpside?: string;
    opportunityCost?: string;
    nextAction?: string;
    recommendedOwner?: string;
  };
  evidenceJson: { items?: Array<{ sourceClass: string; label: string; detail: string }> };
  risksJson: { mainRisks?: string[] };
  whatCouldMakeWrongJson: string[] | unknown;
  dataNeededJson: string[] | unknown;
  recommendedOwner: string;
  sourceHref: string;
  firstDetectedAt: string;
  lastDetectedAt: string;
};

type Payload = {
  headline: string;
  lukeDecisionCount: number;
  topDecisions: Signal[];
  active: Signal[];
  acknowledged: Signal[];
  recentlyResolved: Signal[];
  dataQuality: Signal[];
  lastRun: {
    id: number;
    status: string;
    completedAt: string | null;
    signalsCreated: number;
    signalsResolved: number;
  } | null;
  readiness: Array<{ area: string; status: string; detail: string | null }>;
  digest: { enabled: boolean; recipientConfigured: boolean };
};

function asList(v: unknown): string[] {
  return Array.isArray(v) ? v.map(String) : [];
}

function SignalCard({
  s,
  busy,
  onAction,
}: {
  s: Signal;
  busy: string | null;
  onAction: (action: string, key: string) => void;
}) {
  const wrong = asList(s.whatCouldMakeWrongJson);
  const needed = asList(s.dataNeededJson);
  const risks = s.risksJson?.mainRisks ?? [];
  const evidence = s.evidenceJson?.items ?? [];

  return (
    <article className="premium-card space-y-3 px-5 py-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="font-mono text-xs text-ash">{s.priority}</span>
        <span className="font-mono text-xs text-ash">{s.confidence}</span>
        <span className="text-xs text-ash">{s.area}</span>
        <span className="text-xs text-ash">owner: {s.recommendedOwner}</span>
      </div>
      <h3 className="font-display text-lg font-bold text-ink">{s.title}</h3>
      <p className="text-sm text-ink">
        <span className="font-semibold">Decision: </span>
        {s.reasoningJson?.decision ?? s.summary}
      </p>
      <p className="text-sm text-ash">
        <span className="font-semibold text-ink">Recommendation: </span>
        {s.recommendation}
      </p>
      {s.reasoningJson?.why && (
        <p className="text-sm text-ash">
          <span className="font-semibold text-ink">Why: </span>
          {s.reasoningJson.why}
        </p>
      )}
      {evidence.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-sm text-ash">
          {evidence.map((e, i) => (
            <li key={i}>
              <span className="font-mono text-xs">[{e.sourceClass}]</span>{" "}
              {e.label}: {e.detail}
            </li>
          ))}
        </ul>
      )}
      {risks.length > 0 && (
        <p className="text-sm text-ash">
          <span className="font-semibold text-ink">Risks: </span>
          {risks.join(" · ")}
        </p>
      )}
      {wrong.length > 0 && (
        <p className="text-sm text-ash">
          <span className="font-semibold text-ink">What could make this wrong: </span>
          {wrong.join(" · ")}
        </p>
      )}
      {needed.length > 0 && (
        <p className="text-sm text-ash">
          <span className="font-semibold text-ink">Data needed: </span>
          {needed.join(" · ")}
        </p>
      )}
      <p className="text-xs text-ash">
        First {s.firstDetectedAt.slice(0, 10)} · Last {s.lastDetectedAt.slice(0, 10)}
      </p>
      <div className="flex flex-wrap gap-2 pt-1">
        {s.status === "active" && (
          <button
            type="button"
            disabled={busy === s.signalKey}
            className="rounded border border-ink/20 px-3 py-1 text-xs"
            onClick={() => onAction("acknowledge", s.signalKey)}
          >
            Acknowledge
          </button>
        )}
        {(s.status === "active" || s.status === "acknowledged") && (
          <>
            <button
              type="button"
              disabled={busy === s.signalKey}
              className="rounded border border-ink/20 px-3 py-1 text-xs"
              onClick={() => onAction("resolve", s.signalKey)}
            >
              Mark resolved
            </button>
            <button
              type="button"
              disabled={busy === s.signalKey}
              className="rounded border border-ink/20 px-3 py-1 text-xs"
              onClick={() => onAction("dismiss", s.signalKey)}
            >
              Dismiss
            </button>
          </>
        )}
        <a
          href={s.sourceHref}
          className="rounded border border-ink/20 px-3 py-1 text-xs text-ink"
        >
          Open source system
        </a>
      </div>
    </article>
  );
}

export function AdminDecisionsDashboard() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [runBusy, setRunBusy] = useState(false);

  const refresh = useCallback(async () => {
    setError(null);
    const res = await fetch("/api/admin/decisions");
    if (!res.ok) {
      setError("Failed to load decision engine.");
      return;
    }
    setData((await res.json()) as Payload);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function onAction(action: string, signalKey: string) {
    setBusy(signalKey);
    try {
      await fetch("/api/admin/decisions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, signalKey }),
      });
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  async function runEngine() {
    setRunBusy(true);
    try {
      await fetch("/api/admin/decisions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run" }),
      });
      await refresh();
    } finally {
      setRunBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-display-lg font-bold text-ink">
            PSL Labs Decision Engine
          </h1>
          <p className="mt-2 text-sm text-ash">
            Cross-business correlation and decision support — not autonomous control.
          </p>
        </div>
        <button
          type="button"
          disabled={runBusy}
          onClick={() => void runEngine()}
          className="rounded bg-ink px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {runBusy ? "Running…" : "Run decision engine"}
        </button>
      </header>

      {error && <p className="text-sm text-red-700">{error}</p>}

      {!data ? (
        <p className="text-sm text-ash">Loading…</p>
      ) : (
        <>
          <section className="premium-card px-5 py-6">
            <p className="font-display text-xl font-bold text-ink">
              {data.headline}
            </p>
            <p className="mt-2 text-sm text-ash">
              Digest:{" "}
              {data.digest.enabled
                ? data.digest.recipientConfigured
                  ? "enabled"
                  : "enabled but recipient not configured"
                : "off (default)"}
              {data.lastRun
                ? ` · Last run #${data.lastRun.id} (${data.lastRun.status})`
                : " · No runs yet"}
            </p>
          </section>

          {data.topDecisions.length > 0 && (
            <section className="space-y-3">
              <h2 className="font-display text-lg font-bold text-ink">
                Top decisions
              </h2>
              {data.topDecisions.map((s) => (
                <SignalCard key={s.signalKey} s={s} busy={busy} onAction={onAction} />
              ))}
            </section>
          )}

          <section className="space-y-3">
            <h2 className="font-display text-lg font-bold text-ink">
              Active signals
            </h2>
            {data.active.length === 0 ? (
              <p className="text-sm text-ash">None.</p>
            ) : (
              data.active.map((s) => (
                <SignalCard key={s.signalKey} s={s} busy={busy} onAction={onAction} />
              ))
            )}
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-lg font-bold text-ink">
              Acknowledged
            </h2>
            {data.acknowledged.length === 0 ? (
              <p className="text-sm text-ash">None.</p>
            ) : (
              data.acknowledged.map((s) => (
                <SignalCard key={s.signalKey} s={s} busy={busy} onAction={onAction} />
              ))
            )}
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-lg font-bold text-ink">
              Recently resolved
            </h2>
            {data.recentlyResolved.length === 0 ? (
              <p className="text-sm text-ash">None.</p>
            ) : (
              data.recentlyResolved.map((s) => (
                <SignalCard key={s.signalKey} s={s} busy={busy} onAction={onAction} />
              ))
            )}
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-lg font-bold text-ink">
              Data quality
            </h2>
            {data.dataQuality.length === 0 ? (
              <p className="text-sm text-ash">No data-quality signals.</p>
            ) : (
              data.dataQuality.map((s) => (
                <SignalCard key={s.signalKey} s={s} busy={busy} onAction={onAction} />
              ))
            )}
          </section>

          <section>
            <h2 className="font-display text-lg font-bold text-ink">
              System readiness
            </h2>
            <ul className="mt-3 space-y-2 text-sm">
              {data.readiness.map((r) => (
                <li key={r.area} className="flex justify-between gap-4">
                  <span className="text-ink">{r.area}</span>
                  <span className="text-ash">
                    {r.status}
                    {r.detail ? ` — ${r.detail}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
