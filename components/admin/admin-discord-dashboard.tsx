"use client";

import { useCallback, useEffect, useState } from "react";

type Payload = {
  status: {
    enabled: boolean;
    applicationConfigured: boolean;
    publicKeyConfigured: boolean;
    botTokenConfigured: boolean;
    guildIdConfigured: boolean;
    inviteUrl: string;
    rateLimitPerMinute: number;
    testMode: boolean;
    ready: boolean;
  };
  analytics: {
    interactionCount: number;
    restrictedCount: number;
    rateLimitedCount: number;
    lastInteractionAt: string | null;
    lastRegistration: {
      at: string;
      scope: string;
      ok: boolean;
      commandCount: number;
    } | null;
  };
};

export function AdminDiscordDashboard() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [testQ, setTestQ] = useState("");
  const [testAnswer, setTestAnswer] = useState<string | null>(null);
  const [excludeId, setExcludeId] = useState("");

  const refresh = useCallback(async () => {
    setError(null);
    const res = await fetch("/api/admin/discord");
    if (!res.ok) {
      setError("Failed to load Discord status.");
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
      const res = await fetch("/api/admin/discord", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        result?: { ok?: boolean; scope?: string; errorSummary?: string };
        answer?: { content?: string };
      };
      if (!res.ok || json.ok === false) {
        setMessage(json.error ?? json.result?.errorSummary ?? "Failed");
      } else if (json.answer?.content) {
        setTestAnswer(json.answer.content);
        setMessage("Local knowledge test complete.");
      } else {
        setMessage(
          json.result?.ok
            ? `Commands registered (${json.result.scope}).`
            : "Done."
        );
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  const s = data?.status;
  const a = data?.analytics;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-display-lg font-bold text-ink">
          Discord community agent
        </h1>
        <p className="mt-2 text-sm text-ash">
          Secrets are never shown. Command registration is an explicit Luke
          action — never automatic on deploy.
        </p>
      </header>

      {error && <p className="text-sm text-red-700">{error}</p>}
      {message && <p className="text-sm text-ash">{message}</p>}

      {!data ? (
        <p className="text-sm text-ash">Loading…</p>
      ) : (
        <ul className="space-y-1 text-sm">
          <li>Enabled? {s?.enabled ? "yes" : "no"}</li>
          <li>Application configured? {s?.applicationConfigured ? "yes" : "no"}</li>
          <li>Public key configured? {s?.publicKeyConfigured ? "yes" : "no"}</li>
          <li>Bot token configured? {s?.botTokenConfigured ? "yes" : "no"}</li>
          <li>Guild ID configured? {s?.guildIdConfigured ? "yes" : "no"}</li>
          <li>Ready? {s?.ready ? "yes" : "no"}</li>
          <li>Test mode? {s?.testMode ? "yes" : "no"}</li>
          <li>Invite: {s?.inviteUrl}</li>
          <li>Rate limit / min: {s?.rateLimitPerMinute}</li>
          <li>Interactions: {a?.interactionCount ?? 0}</li>
          <li>Restricted requests: {a?.restrictedCount ?? 0}</li>
          <li>Rate-limited: {a?.rateLimitedCount ?? 0}</li>
          <li>Last interaction: {a?.lastInteractionAt ?? "—"}</li>
          <li>
            Last registration:{" "}
            {a?.lastRegistration
              ? `${a.lastRegistration.at} · ${a.lastRegistration.scope} · ${
                  a.lastRegistration.ok ? "ok" : "failed"
                } · ${a.lastRegistration.commandCount} cmds`
              : "—"}
          </li>
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          className="border border-ink/20 bg-ink px-4 py-2 text-sm text-page disabled:opacity-50"
          onClick={() => void post("register_commands")}
        >
          Register/update V1 commands
        </button>
      </div>

      <section>
        <h2 className="font-display text-lg font-semibold">
          Test knowledge answer locally
        </h2>
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            className="min-w-[240px] flex-1 border border-ink/20 px-3 py-2 text-sm"
            value={testQ}
            onChange={(e) => setTestQ(e.target.value)}
            placeholder="Sample question"
          />
          <button
            type="button"
            disabled={busy}
            className="border border-ink/20 px-3 py-2 text-sm"
            onClick={() => void post("test_knowledge", { question: testQ })}
          >
            Test
          </button>
        </div>
        {testAnswer && (
          <pre className="mt-2 whitespace-pre-wrap border border-ink/10 p-3 text-xs">
            {testAnswer}
          </pre>
        )}
      </section>

      <section>
        <h2 className="font-display text-lg font-semibold">
          Mark interaction TEST / EXCLUDED
        </h2>
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            className="w-40 border border-ink/20 px-3 py-2 text-sm"
            value={excludeId}
            onChange={(e) => setExcludeId(e.target.value)}
            placeholder="Interaction id"
          />
          <button
            type="button"
            disabled={busy}
            className="border border-ink/20 px-3 py-2 text-sm"
            onClick={() =>
              void post("mark_excluded", { id: Number(excludeId) })
            }
          >
            Mark excluded
          </button>
          <button
            type="button"
            disabled={busy}
            className="border border-ink/20 px-3 py-2 text-sm"
            onClick={() =>
              void post("restore_reporting", { id: Number(excludeId) })
            }
          >
            Restore reporting
          </button>
        </div>
      </section>
    </div>
  );
}
