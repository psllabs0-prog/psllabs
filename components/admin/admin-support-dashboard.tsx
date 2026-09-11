"use client";

import { useCallback, useEffect, useState } from "react";

type InboxItem = {
  message: {
    id: number;
    fromEmail: string;
    subject: string;
    receivedAt: string;
    normalizedBody: string;
    status: string;
  };
  thread: {
    id: number;
    autoSendDisabled: boolean;
  };
  category: string | null;
  riskLevel: string | null;
  confidence: number | null;
  draftBody: string | null;
  responseId: number | null;
  sentAt: string | null;
  escalation: {
    id: number;
    reason: string;
    resolvedAt: string | null;
  } | null;
};

type Payload = {
  autoSendEnabled: boolean;
  imapConfigured: boolean;
  items: InboxItem[];
};

export function AdminSupportDashboard() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<number, string>>({});

  const refresh = useCallback(async () => {
    setError(null);
    const res = await fetch("/api/admin/support");
    if (!res.ok) {
      setError("Failed to load support inbox.");
      return;
    }
    const json = (await res.json()) as Payload;
    setData(json);
    setEdits(
      Object.fromEntries(
        json.items.map((item) => [item.message.id, item.draftBody ?? ""])
      )
    );
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function runAction(body: Record<string, unknown>) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || json.ok === false) {
        setMessage(json.error ?? "Action failed");
      } else {
        setMessage("Done.");
        await refresh();
      }
    } catch {
      setMessage("Action failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="premium-card flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div className="text-sm text-ash">
          Auto-send:{" "}
          <span className="font-mono text-ink">
            {data?.autoSendEnabled ? "ENABLED" : "OFF (default)"}
          </span>
          {" · "}
          IMAP:{" "}
          <span className="font-mono text-ink">
            {data?.imapConfigured ? "configured" : "not configured"}
          </span>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void runAction({ action: "run_inbox" })}
          className="rounded-pill bg-accent px-4 py-2 text-sm font-medium text-page disabled:opacity-50"
        >
          {busy ? "Working…" : "Run inbox job"}
        </button>
      </div>

      {message && <p className="text-sm text-ash">{message}</p>}
      {error && <p className="text-sm text-red-700">{error}</p>}

      <div className="flex flex-col gap-4">
        {(data?.items ?? []).length === 0 ? (
          <div className="premium-card px-5 py-8 text-sm text-ash">
            No support messages yet.
          </div>
        ) : (
          (data?.items ?? []).map((item) => (
            <article
              key={item.message.id}
              className="premium-card overflow-hidden"
            >
              <div className="border-b border-linen px-5 py-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-ash">
                  <span className="font-mono">{item.message.status}</span>
                  <span>·</span>
                  <span className="font-medium text-ink">
                    {item.riskLevel ?? "—"}
                  </span>
                  <span>·</span>
                  <span>{item.category ?? "unclassified"}</span>
                  <span>·</span>
                  <span>
                    conf{" "}
                    {item.confidence !== null
                      ? item.confidence.toFixed(2)
                      : "—"}
                  </span>
                  {item.sentAt && (
                    <>
                      <span>·</span>
                      <span>sent {new Date(item.sentAt).toLocaleString()}</span>
                    </>
                  )}
                </div>
                <h2 className="mt-1 font-display text-lg font-bold text-ink">
                  {item.message.subject}
                </h2>
                <p className="text-sm text-ash">
                  {item.message.fromEmail} ·{" "}
                  {new Date(item.message.receivedAt).toLocaleString()}
                </p>
              </div>
              <div className="grid gap-4 px-5 py-4 lg:grid-cols-2">
                <div>
                  <p className="mb-2 text-xs uppercase tracking-wide text-ash">
                    Inbound
                  </p>
                  <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-surface p-3 text-xs text-ink">
                    {item.message.normalizedBody}
                  </pre>
                  {item.escalation && !item.escalation.resolvedAt && (
                    <p className="mt-3 text-xs text-ash">
                      Escalation: {item.escalation.reason}
                    </p>
                  )}
                </div>
                <div>
                  <p className="mb-2 text-xs uppercase tracking-wide text-ash">
                    Suggested response
                  </p>
                  <textarea
                    className="min-h-40 w-full rounded-lg border border-linen bg-lab-white p-3 text-xs text-ink"
                    value={edits[item.message.id] ?? ""}
                    onChange={(e) =>
                      setEdits((current) => ({
                        ...current,
                        [item.message.id]: e.target.value,
                      }))
                    }
                  />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy || Boolean(item.sentAt)}
                      className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-page disabled:opacity-50"
                      onClick={() =>
                        void runAction({
                          action: "approve_send",
                          messageId: item.message.id,
                          body: edits[item.message.id],
                        })
                      }
                    >
                      Approve / send
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      className="rounded border border-linen px-3 py-1.5 text-xs"
                      onClick={() =>
                        void runAction({
                          action: "mark_resolved",
                          messageId: item.message.id,
                        })
                      }
                    >
                      Mark resolved
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      className="rounded border border-linen px-3 py-1.5 text-xs"
                      onClick={() =>
                        void runAction({
                          action: "set_auto_send",
                          threadId: item.thread.id,
                          disabled: !item.thread.autoSendDisabled,
                        })
                      }
                    >
                      {item.thread.autoSendDisabled
                        ? "Enable thread auto-send"
                        : "Disable thread auto-send"}
                    </button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <label className="text-ash">
                      Risk
                      <select
                        className="ml-2 rounded border border-linen bg-lab-white px-2 py-1 text-ink"
                        defaultValue={item.riskLevel ?? "YELLOW"}
                        id={`risk-${item.message.id}`}
                      >
                        <option value="GREEN">GREEN</option>
                        <option value="YELLOW">YELLOW</option>
                        <option value="RED">RED</option>
                      </select>
                    </label>
                    <label className="text-ash">
                      Category
                      <input
                        className="ml-2 w-40 rounded border border-linen bg-lab-white px-2 py-1 font-mono text-ink"
                        defaultValue={item.category ?? "other"}
                        id={`cat-${item.message.id}`}
                      />
                    </label>
                    <button
                      type="button"
                      disabled={busy}
                      className="rounded border border-linen px-3 py-1.5"
                      onClick={() => {
                        const risk = (
                          document.getElementById(
                            `risk-${item.message.id}`
                          ) as HTMLSelectElement
                        ).value;
                        const category = (
                          document.getElementById(
                            `cat-${item.message.id}`
                          ) as HTMLInputElement
                        ).value;
                        void runAction({
                          action: "change_classification",
                          messageId: item.message.id,
                          riskLevel: risk,
                          category,
                        });
                      }}
                    >
                      Save classification
                    </button>
                  </div>
                </div>
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  );
}
