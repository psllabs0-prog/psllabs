"use client";

import { useCallback, useEffect, useState } from "react";

import type { NewsletterWelcomeAdminView, PartitionCounts } from "@/lib/newsletter/admin";

const KIND_LABELS: Record<string, string> = {
  confirmation: "Confirmation (retired)",
  welcome_1: "Welcome 1",
  welcome_2: "Welcome 2",
  welcome_3: "Welcome 3",
};

const STATUS_ORDER = ["queued", "attempting", "accepted", "simulated", "failed", "rejected", "unknown", "suppressed", "skipped_stale", "cancelled"];

function Gate({ label, gate }: { label: string; gate: { enabled: boolean; reason: string } }) {
  return (
    <p>
      {label}: <strong>{gate.enabled ? "on" : "off"}</strong> <span className="text-ash">— {gate.reason}</span>
    </p>
  );
}

function Counts({ title, counts }: { title: string; counts: PartitionCounts | null }) {
  if (!counts) return null;
  return (
    <div className="mt-3">
      <h3 className="font-semibold text-ink">{title}</h3>
      <p className="mt-1">
        Active subscriptions: single opt-in {counts.subscriptions.singleOptIn}{" "}
        <span className="text-ash">(subscription permission recorded; address not verified)</span> · double opt-in{" "}
        {counts.subscriptions.doubleOptIn} <span className="text-ash">(address verified by confirmation link)</span>
      </p>
      <p>Unsubscribed: {counts.subscriptions.unsubscribed}</p>
      <p className="text-ash">
        Older double-opt-in requests: {counts.requests.total} · pending {counts.requests.pending} · expired{" "}
        {counts.requests.expired} · superseded {counts.requests.superseded} · confirmed {counts.requests.confirmed}
      </p>
      <div className="mt-2 overflow-x-auto">
        <table className="min-w-full text-left text-xs">
          <thead>
            <tr>
              <th className="py-1 pr-3">Step</th>
              {STATUS_ORDER.map((s) => (
                <th key={s} className="py-1 pr-3 font-medium">
                  {s.replace("_", " ")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.entries(counts.sends).map(([kind, byStatus]) => (
              <tr key={kind} className="border-t border-ink/10">
                <td className="py-1 pr-3">{KIND_LABELS[kind] ?? kind}</td>
                {STATUS_ORDER.map((s) => (
                  <td key={s} className="py-1 pr-3">
                    {byStatus[s] ?? 0}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

async function loadNewsletterView(): Promise<NewsletterWelcomeAdminView | null> {
  try {
    const res = await fetch("/api/admin/newsletter-welcome", { cache: "no-store" });
    return res.ok ? ((await res.json()) as NewsletterWelcomeAdminView) : null;
  } catch {
    return null;
  }
}

export function AdminNewsletterWelcomePanel() {
  const [data, setData] = useState<NewsletterWelcomeAdminView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [showHtml, setShowHtml] = useState(false);

  const apply = useCallback((view: NewsletterWelcomeAdminView | null) => {
    setError(view ? null : "Failed to load newsletter status.");
    if (view) setData(view);
  }, []);

  useEffect(() => {
    let active = true;
    void loadNewsletterView().then((view) => {
      if (active) apply(view);
    });
    return () => {
      active = false;
    };
  }, [apply]);

  const c = data?.config;
  const selected = data?.previews.find((p) => p.kind === preview) ?? null;

  return (
    <section className="mt-10 space-y-4" aria-labelledby="newsletter-welcome-heading">
      <header>
        <h2 id="newsletter-welcome-heading" className="font-display text-display-md font-bold text-ink">
          Newsletter / Welcome
        </h2>
        <p className="mt-2 text-sm text-ash">
          Single opt-in: pressing Subscribe records subscription permission and starts the welcome emails; it does
          not verify the address. Older double-opt-in links still work until they expire. Separate from the order-based
          retention campaign: subscribing never marks a contact retention-eligible. Read-only here; activation is by
          environment flag.
        </p>
      </header>

      {error && <p className="text-sm text-red-700">{error}</p>}

      <div className="premium-card px-5 py-4 text-sm">
        <h3 className="font-display text-lg font-bold text-ink">Status</h3>
        {c ? (
          <div className="mt-2 space-y-1">
            <p>
              Environment: {c.environment} · Mode: <strong>{c.mode}</strong>{" "}
              <span className="text-ash">— {c.modeReason}</span>
            </p>
            <Gate label="New journey" gate={c.journey} />
            <Gate label="Welcome 1" gate={c.welcome1} />
            <Gate label="Welcome 2 and 3" gate={c.laterSteps} />
            <p>
              Simulation (no SMTP): {c.simulate ? "on" : "off"} · Test allowlist: {c.allowlistSize} address
              {c.allowlistSize === 1 ? "" : "es"}
            </p>
            {c.obsolete.length > 0 && (
              <p className="text-ash">Set but ignored (obsolete): {c.obsolete.join(", ")}</p>
            )}
            <p>
              Prerequisites: SMTP {c.prerequisites.smtp ? "yes" : "no"} · From {c.prerequisites.fromEmail ? "yes" : "no"} ·
              Postal address {c.prerequisites.postalAddress ? "yes" : "no"} · Unsubscribe secret{" "}
              {c.prerequisites.unsubSecret ? "yes" : "no"}
            </p>
            <p>
              Schema: {data.schema.ready ? "migrated" : <strong>not migrated</strong>}
              {data.schema.missing.length > 0 && <span className="text-ash"> — missing {data.schema.missing.join(", ")}</span>}
            </p>
          </div>
        ) : (
          <p className="mt-2 text-ash">Loading…</p>
        )}
      </div>

      {data && (
        <div className="premium-card px-5 py-4 text-sm">
          <h3 className="font-display text-lg font-bold text-ink">Counts</h3>
          {data.legacySubscribers && (
            <p className="mt-2">
              Historical newsletter rows (legacy form, consent unconfirmed, never enrolled): {data.legacySubscribers.total}
              {" "}· marked confirmed {data.legacySubscribers.confirmed}
            </p>
          )}
          {data.schema.ready ? (
            <>
              <Counts title="Live" counts={data.live} />
              <Counts title="TEST (allowlist / simulation)" counts={data.test} />
              <p className="mt-3 text-ash">
                “accepted” means the SMTP server accepted the message — not inbox delivery. “unknown” outcomes are never
                retried automatically.
              </p>
              <p className="mt-2 text-ash">
                Last daily run:{" "}
                {data.lastRun
                  ? `${data.lastRun.finishedAt ?? "running"} · ok=${String(data.lastRun.ok)}${data.lastRun.error ? ` · ${data.lastRun.error}` : ""}`
                  : "none yet"}
              </p>
            </>
          ) : (
            <p className="mt-2 text-ash">New tables are not migrated; the legacy signup path is in use.</p>
          )}
        </div>
      )}

      {data && (
        <div className="premium-card px-5 py-4 text-sm">
          <h3 className="font-display text-lg font-bold text-ink">Attribution and unavailable data</h3>
          <p className="mt-2">
            {data.attribution.available
              ? `Orders with a welcome-email visit: ${data.attribution.orders} · $${data.attribution.revenue.toFixed(2)}`
              : "Order attribution: unavailable"}
          </p>
          <p className="text-ash">{data.attribution.note}</p>
          <ul className="mt-2 list-disc pl-5 text-ash">
            {data.unavailable.map((u) => (
              <li key={u.metric}>
                <span className="text-ink">{u.metric}:</span> unavailable — {u.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {data && (
        <div className="premium-card px-5 py-4 text-sm">
          <h3 className="font-display text-lg font-bold text-ink">Timing and previews</h3>
          <ul className="mt-2 list-disc pl-5">
            {data.timing.map((t) => (
              <li key={t.kind}>
                {KIND_LABELS[t.kind]}:{" "}
                {t.delayHours === 0
                  ? "right after signup (retried on the next daily run after a definite failure)"
                  : `about ${t.delayHours}h after signup, on the next eligible daily run`}
                {` · skipped if more than ${t.staleAfterHours}h overdue`}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-ash">At most one welcome step per address in any rolling 24 hours; steps never overtake each other.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {data.previews.map((p) => (
              <button
                key={p.kind}
                type="button"
                onClick={() => setPreview(preview === p.kind ? null : p.kind)}
                className="rounded-md border border-ink/20 px-3 py-2"
                aria-pressed={preview === p.kind}
              >
                {KIND_LABELS[p.kind]}
              </button>
            ))}
            {selected && (
              <button type="button" onClick={() => setShowHtml((v) => !v)} className="rounded-md border border-ink/20 px-3 py-2">
                {showHtml ? "Show plain text" : "Show HTML"}
              </button>
            )}
          </div>
          {selected && (
            <div className="mt-3">
              <p>
                <strong>Subject:</strong> {selected.subject}
              </p>
              <p className="text-ash">
                Template {selected.templateVersion} · fingerprint {selected.hash}
              </p>
              {showHtml ? (
                <iframe
                  title={`${KIND_LABELS[selected.kind]} HTML preview`}
                  sandbox=""
                  srcDoc={selected.html}
                  className="mt-2 h-[480px] w-full rounded border border-ink/20 bg-white"
                />
              ) : (
                <pre className="mt-2 whitespace-pre-wrap rounded bg-page p-3 text-xs text-ink">{selected.text}</pre>
              )}
              <ul className="mt-2 list-disc pl-5 text-xs text-ash">
                {selected.links.map((l) => (
                  <li key={l.label + l.url}>
                    {l.label}: <span className="break-all">{l.url}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
