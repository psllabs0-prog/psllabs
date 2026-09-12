"use client";

import { useCallback, useEffect, useState } from "react";

type Payload = {
  searchConsole: {
    configured: boolean;
    property: string | null;
    serviceAccountPresent: boolean;
    connectorStatus: string;
    connectorMessage: string;
    lastSuccessfulSync: {
      at: string;
      recordsWritten: number;
    } | null;
    lastRun: {
      at: string;
      status: string;
      recordsReceived: number;
      recordsWritten: number;
      errorSummary: string | null;
    } | null;
    rowsSynced: number;
  };
  meta: {
    state: string;
    message: string;
    lastSyncAt: string | null;
    lastError: string | null;
  } | null;
  tiktok: {
    state: string;
    message: string;
    lastSyncAt: string | null;
    lastError: string | null;
  } | null;
};

export function AdminDataDashboard() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    const res = await fetch("/api/admin/external-metrics");
    if (!res.ok) {
      setError("Failed to load connector status.");
      return;
    }
    setData((await res.json()) as Payload);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function runSync() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/external-metrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync_search_console" }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        result?: { errorSummary?: string; recordsWritten?: number };
      };
      if (!res.ok || json.ok === false) {
        setMessage(json.error ?? json.result?.errorSummary ?? "Sync failed");
      } else {
        setMessage(
          `Sync finished. Rows written: ${json.result?.recordsWritten ?? 0}`
        );
      }
      await refresh();
    } catch {
      setMessage("Sync request failed.");
    } finally {
      setBusy(false);
    }
  }

  const sc = data?.searchConsole;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-display-lg font-bold text-ink">
          External metrics
        </h1>
        <p className="mt-2 text-sm text-ash">
          Connector status only — credentials are never shown.
        </p>
      </header>

      {error && <p className="text-sm text-red-700">{error}</p>}
      {message && <p className="text-sm text-ash">{message}</p>}

      <section className="premium-card px-5 py-4">
        <h2 className="font-display text-lg font-bold text-ink">
          Search Console
        </h2>
        {!sc ? (
          <p className="mt-3 text-sm text-ash">Loading…</p>
        ) : (
          <div className="mt-3 space-y-1 text-sm text-ink">
            <p>Configured: {sc.configured ? "yes" : "no"}</p>
            <p>Property: {sc.property ?? "—"}</p>
            <p>Service account present: {sc.serviceAccountPresent ? "yes" : "no"}</p>
            <p>Status: {sc.connectorStatus}</p>
            <p className="text-ash">{sc.connectorMessage}</p>
            <p>
              Last successful sync:{" "}
              {sc.lastSuccessfulSync
                ? `${sc.lastSuccessfulSync.at} (${sc.lastSuccessfulSync.recordsWritten} rows)`
                : "—"}
            </p>
            <p>
              Last run:{" "}
              {sc.lastRun
                ? `${sc.lastRun.status} @ ${sc.lastRun.at}`
                : "—"}
            </p>
            {sc.lastRun?.errorSummary && (
              <p className="text-red-700">Last error: {sc.lastRun.errorSummary}</p>
            )}
            <p>Rows synced (Neon): {sc.rowsSynced}</p>
            <button
              type="button"
              disabled={busy}
              onClick={() => void runSync()}
              className="mt-4 rounded-md bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {busy ? "Syncing…" : "Run sync"}
            </button>
          </div>
        )}
      </section>

      <section className="premium-card px-5 py-4">
        <h2 className="font-display text-lg font-bold text-ink">Meta Ads</h2>
        <div className="mt-3 space-y-1 text-sm text-ink">
          <p>Configured: {data?.meta?.state !== "not_configured" ? "yes" : "no"}</p>
          <p>State: {data?.meta?.state ?? "—"}</p>
          <p>Last sync: {data?.meta?.lastSyncAt ?? "—"}</p>
          <p className="text-ash">{data?.meta?.message ?? ""}</p>
          {data?.meta?.lastError && (
            <p className="text-red-700">Last error: {data.meta.lastError}</p>
          )}
        </div>
      </section>

      <section className="premium-card px-5 py-4">
        <h2 className="font-display text-lg font-bold text-ink">TikTok Ads</h2>
        <div className="mt-3 space-y-1 text-sm text-ink">
          <p>
            Configured:{" "}
            {data?.tiktok?.state !== "not_configured" ? "yes" : "no"}
          </p>
          <p>State: {data?.tiktok?.state ?? "—"}</p>
          <p>Last sync: {data?.tiktok?.lastSyncAt ?? "—"}</p>
          <p className="text-ash">{data?.tiktok?.message ?? ""}</p>
          {data?.tiktok?.lastError && (
            <p className="text-red-700">Last error: {data.tiktok.lastError}</p>
          )}
        </div>
      </section>
    </div>
  );
}
