"use client";

import { useCallback, useEffect, useState } from "react";

type Payload = {
  readiness: {
    ready: boolean;
    reasons: string[];
    autoSendEnabled: boolean;
    fromEmail: string | null;
    postalAddress: string | null;
  };
  stats: {
    eligibleContacts: number;
    sendsDue: number;
    sent: number;
    suppressed: number;
    failed: number;
  };
  lastJob: {
    finishedAt: string | null;
    ok: boolean | null;
    sent: number;
    failed: number;
    errorSummary: string | null;
  } | null;
  nextCandidates: Array<{ orderId: string; email: string; paidAt: string }>;
  preview: { subject: string; text: string };
};

export function AdminRetentionDashboard() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [emailInput, setEmailInput] = useState("");
  const [showPreview, setShowPreview] = useState(false);

  const refresh = useCallback(async () => {
    setError(null);
    const res = await fetch("/api/admin/retention");
    if (!res.ok) {
      setError("Failed to load retention status.");
      return;
    }
    setData((await res.json()) as Payload);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function post(action: string, extra: Record<string, unknown> = {}) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/retention", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || json.ok === false) {
        setMessage(json.error ?? "Action failed");
      } else {
        setMessage("Done.");
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  const r = data?.readiness;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-display-lg font-bold text-ink">
          Retention (30-day)
        </h1>
        <p className="mt-2 text-sm text-ash">
          Availability &amp; batch documentation email — not a replenishment
          reminder. Consent is never inferred from checkout.
        </p>
      </header>

      {error && <p className="text-sm text-red-700">{error}</p>}
      {message && <p className="text-sm text-ash">{message}</p>}

      <section className="premium-card px-5 py-4 text-sm">
        <h2 className="font-display text-lg font-bold text-ink">Status</h2>
        <p className="mt-2">
          Automation:{" "}
          <strong>{r?.ready ? "READY" : "NOT READY"}</strong>
        </p>
        <p>Auto-send flag: {r?.autoSendEnabled ? "on" : "off"}</p>
        <p>From configured: {r?.fromEmail ? "yes" : "no"}</p>
        <p>Postal address configured: {r?.postalAddress ? "yes" : "no"}</p>
        {r && r.reasons.length > 0 && (
          <ul className="mt-2 list-disc pl-5 text-ash">
            {r.reasons.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="premium-card px-5 py-4 text-sm">
        <h2 className="font-display text-lg font-bold text-ink">Counts</h2>
        <p className="mt-2">
          Eligible contacts: {data?.stats.eligibleContacts ?? "—"} · Due:{" "}
          {data?.stats.sendsDue ?? "—"} · Sent: {data?.stats.sent ?? "—"} ·
          Suppressed: {data?.stats.suppressed ?? "—"} · Failed:{" "}
          {data?.stats.failed ?? "—"}
        </p>
        <p className="mt-2 text-ash">
          Last job:{" "}
          {data?.lastJob
            ? `${data.lastJob.finishedAt ?? "—"} · ok=${String(data.lastJob.ok)} · sent ${data.lastJob.sent}`
            : "—"}
        </p>
        {data?.lastJob?.errorSummary && (
          <p className="mt-1 text-ash">{data.lastJob.errorSummary}</p>
        )}
      </section>

      <section className="premium-card px-5 py-4 text-sm">
        <h2 className="font-display text-lg font-bold text-ink">
          Next candidates
        </h2>
        {(data?.nextCandidates.length ?? 0) === 0 ? (
          <p className="mt-2 text-ash">None due (or none eligible).</p>
        ) : (
          <ul className="mt-2 list-disc pl-5">
            {data!.nextCandidates.map((c) => (
              <li key={c.orderId}>
                {c.orderId} · {c.email} · paid {c.paidAt}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="premium-card px-5 py-4 text-sm space-y-3">
        <h2 className="font-display text-lg font-bold text-ink">Actions</h2>
        <button
          type="button"
          disabled={busy}
          onClick={() => setShowPreview((v) => !v)}
          className="mr-3 rounded-md border border-ink/20 px-3 py-2"
        >
          {showPreview ? "Hide preview" : "Preview approved email"}
        </button>
        <button
          type="button"
          disabled={busy || !r?.ready}
          onClick={() => void post("run_job")}
          className="rounded-md bg-ink px-3 py-2 text-white disabled:opacity-50"
          title={!r?.ready ? "Not ready — cannot send" : undefined}
        >
          Run job
        </button>
        {showPreview && data?.preview && (
          <pre className="mt-3 whitespace-pre-wrap rounded bg-page p-3 text-xs text-ash">
            Subject: {data.preview.subject}
            {"\n\n"}
            {data.preview.text}
          </pre>
        )}
        <div className="flex flex-wrap gap-2 pt-2">
          <input
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            placeholder="customer@email"
            className="min-w-[220px] flex-1 rounded border border-ink/20 bg-transparent px-3 py-2"
          />
          <button
            type="button"
            disabled={busy || !emailInput.includes("@")}
            onClick={() =>
              void post("set_eligible", { email: emailInput, eligible: true })
            }
            className="rounded-md border border-ink/20 px-3 py-2 disabled:opacity-50"
          >
            Mark eligible
          </button>
          <button
            type="button"
            disabled={busy || !emailInput.includes("@")}
            onClick={() => void post("suppress", { email: emailInput })}
            className="rounded-md border border-ink/20 px-3 py-2 disabled:opacity-50"
          >
            Suppress
          </button>
        </div>
      </section>
    </div>
  );
}
