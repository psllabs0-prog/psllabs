"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type EmailConnectionCheck = {
  status: "idle" | "checking" | "verified" | "failed" | "unknown";
  checkId?: string;
};

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
    held?: number;
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
  const [connectionCheck, setConnectionCheck] = useState<EmailConnectionCheck>({
    status: "idle",
  });
  const connectionCheckPending = useRef(false);

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
    const initialLoad = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(initialLoad);
  }, [refresh]);

  async function post(action: string, extra: Record<string, unknown> = {}) {
    if (connectionCheckPending.current) return;
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

  async function verifyEmailConnection() {
    if (busy || connectionCheckPending.current) return;
    connectionCheckPending.current = true;
    setConnectionCheck({ status: "checking" });
    let checkId: string | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      checkId = crypto.randomUUID();
      setConnectionCheck({ status: "checking", checkId });
      const controller = new AbortController();
      timeout = setTimeout(() => controller.abort(), 35_000);
      const res = await fetch("/api/admin/retention", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify_transport", checkId }),
        signal: controller.signal,
      });
      const response: unknown = await res.json();
      const json = response && typeof response === "object"
        ? response as Record<string, unknown>
        : null;
      const result = json?.result && typeof json.result === "object"
        ? json.result as Record<string, unknown>
        : null;
      const validResult = json?.checkId === checkId && json?.messagesSent === 0 &&
        typeof result?.verified === "boolean";
      if (validResult && res.status === 200 && json?.ok === true && result?.verified === true) {
        setConnectionCheck({ status: "verified", checkId });
      } else if (validResult && res.status === 503 && json?.ok === false && result?.verified === false) {
        setConnectionCheck({ status: "failed", checkId });
      } else {
        setConnectionCheck({ status: "unknown", checkId });
      }
    } catch {
      setConnectionCheck({ status: "unknown", checkId });
    } finally {
      clearTimeout(timeout);
      connectionCheckPending.current = false;
    }
  }

  const r = data?.readiness;
  const checkingConnection = connectionCheck.status === "checking";
  const connectionMessage = {
    idle: "Not checked in this session.",
    checking: "Checking email connection…",
    verified: "Email connection verified. No emails were sent.",
    failed: "Email connection check failed. No emails were sent. Review the sending service configuration.",
    unknown: "The connection result could not be verified. No email send was requested. Review this check’s diagnostic record before trying again.",
  }[connectionCheck.status];

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
        <h2 className="font-display text-lg font-bold text-ink">Email connection</h2>
        <p className="mt-2 text-ash">
          This check connects and authenticates with the existing email service.
          It sends zero emails and does not prove inbox delivery.
        </p>
        <button
          type="button"
          disabled={busy || checkingConnection}
          onClick={() => void verifyEmailConnection()}
          className="mt-3 rounded-md border border-ink/20 px-3 py-2 disabled:opacity-50"
        >
          {checkingConnection ? "Checking connection…" : "Verify email connection"}
        </button>
        <p className="mt-3 text-ash" role="status" aria-live="polite" aria-atomic="true">
          {connectionMessage}
        </p>
        {connectionCheck.checkId && (
          <p className="mt-1 break-words text-xs text-ash">
            Check ID: <span className="font-mono">{connectionCheck.checkId}</span>
          </p>
        )}
      </section>

      <section className="premium-card px-5 py-4 text-sm">
        <h2 className="font-display text-lg font-bold text-ink">Counts</h2>
        <p className="mt-2">
          Eligible contacts: {data?.stats.eligibleContacts ?? "—"} · Due:{" "}
          {data?.stats.sendsDue ?? "—"} · Sent: {data?.stats.sent ?? "—"} ·
          Suppressed: {data?.stats.suppressed ?? "—"} · Failed:{" "}
          {data?.stats.failed ?? "—"}
          {" "}· Held for review: {data?.stats.held ?? "—"}
        </p>
        {(data?.stats.held ?? 0) > 0 && (
          <p className="mt-2 text-ash">Held messages were refused or have an unknown acceptance result. They will not be retried automatically.</p>
        )}
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
          disabled={busy || checkingConnection}
          onClick={() => setShowPreview((v) => !v)}
          className="mr-3 rounded-md border border-ink/20 px-3 py-2"
        >
          {showPreview ? "Hide preview" : "Preview approved email"}
        </button>
        <button
          type="button"
          disabled={busy || checkingConnection || !r?.ready}
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
            disabled={busy || checkingConnection || !emailInput.includes("@")}
            onClick={() =>
              void post("set_eligible", { email: emailInput, eligible: true })
            }
            className="rounded-md border border-ink/20 px-3 py-2 disabled:opacity-50"
          >
            Mark eligible
          </button>
          <button
            type="button"
            disabled={busy || checkingConnection || !emailInput.includes("@")}
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
