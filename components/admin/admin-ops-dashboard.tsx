"use client";

import { useCallback, useEffect, useState } from "react";

import type { OpsException } from "@/lib/ops/types";
import type { OpsSystemStatus } from "@/lib/ops/status";

type Payload = {
  exceptions: OpsException[];
  topActions: OpsException[];
  statuses: OpsSystemStatus[];
  activeCount: number;
};

export function AdminOpsDashboard() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    const res = await fetch("/api/admin/ops");
    if (!res.ok) {
      setError("Failed to load operations exceptions.");
      return;
    }
    setData((await res.json()) as Payload);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function acknowledge(ex: OpsException) {
    const key = `${ex.sourceType}:${ex.sourceId}`;
    setBusyKey(key);
    try {
      await fetch("/api/admin/ops", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "acknowledge",
          sourceType: ex.sourceType,
          sourceId: ex.sourceId,
        }),
      });
      await refresh();
    } finally {
      setBusyKey(null);
    }
  }

  const activeCount = data?.activeCount ?? 0;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-display-lg font-bold text-ink">
          PSL Labs Operations
        </h1>
        <p className="mt-2 text-sm text-ash">
          What needs Luke&apos;s attention right now — not a metrics dashboard.
        </p>
      </header>

      {error && <p className="text-sm text-red-700">{error}</p>}

      {!data ? (
        <p className="text-sm text-ash">Loading…</p>
      ) : activeCount === 0 ? (
        <section className="premium-card px-5 py-6">
          <p className="font-display text-xl font-bold text-ink">
            ALL SYSTEMS NORMAL
          </p>
          <p className="mt-2 text-sm text-ash">No action required.</p>
        </section>
      ) : (
        <>
          <section className="premium-card px-5 py-4">
            <p className="font-display text-xl font-bold text-ink">
              LUKE HAS {activeCount} ITEM{activeCount === 1 ? "" : "S"} TO REVIEW
            </p>
          </section>

          {data.topActions.length > 0 && (
            <section>
              <h2 className="font-display text-lg font-bold text-ink">
                Three highest priority actions
              </h2>
              <ul className="mt-3 space-y-3">
                {data.topActions.map((ex) => (
                  <li
                    key={`top-${ex.sourceType}-${ex.sourceId}`}
                    className="premium-card px-4 py-3 text-sm"
                  >
                    <p className="font-medium text-ink">
                      {ex.priority} · {ex.area} · {ex.title}
                    </p>
                    <p className="mt-1 text-ash">{ex.why}</p>
                    <a
                      href={ex.href}
                      className="mt-2 inline-block text-ink underline"
                    >
                      Open source
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h2 className="font-display text-lg font-bold text-ink">
              Active exceptions
            </h2>
            <ul className="mt-3 space-y-3">
              {data.exceptions.map((ex) => (
                <li
                  key={`${ex.sourceType}-${ex.sourceId}`}
                  className="premium-card px-4 py-3 text-sm"
                >
                  <p className="font-medium text-ink">
                    {ex.priority} · {ex.area} · {ex.title}
                    {ex.acknowledged ? " · acknowledged" : ""}
                  </p>
                  <p className="mt-1 text-ash">{ex.why}</p>
                  <p className="mt-1 text-xs text-ash">
                    Detected {ex.detectedAt}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-3">
                    <a href={ex.href} className="text-ink underline">
                      Open source
                    </a>
                    {!ex.acknowledged && (
                      <button
                        type="button"
                        disabled={
                          busyKey === `${ex.sourceType}:${ex.sourceId}`
                        }
                        onClick={() => void acknowledge(ex)}
                        className="text-ink underline disabled:opacity-50"
                      >
                        Acknowledge
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      {data && (
        <section>
          <h2 className="font-display text-sm font-bold uppercase tracking-wide text-ash">
            System status
          </h2>
          <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink">
            {data.statuses.map((s) => (
              <li key={s.area}>
                {s.area}: <span className="font-medium">{s.status}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
