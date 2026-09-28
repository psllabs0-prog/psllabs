"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { MissionControlSnapshot } from "@/lib/ops/mission-control/snapshot";
import {
  MISSION_CONTROL_SYNC_HEADER,
  filterActivityFeed,
  type ActivityEvent,
  type WorkerCard,
  type WorkerStatus,
} from "@/lib/ops/mission-control/types";

const EVENT_POLL_MS = 5_000;
const SNAPSHOT_EVERY_MS = 60_000;
const MAX_BACKOFF_MS = 60_000;
const STALE_AFTER_MS = 30_000;
const MAX_EVENTS = 500;

type ApiPayload = {
  serverTime: string;
  initialized: boolean;
  migrationRequired: string | null;
  missingTables: string[];
  writeMode: { enabled: boolean; reason: string };
  cursor: number;
  events: ActivityEvent[];
  snapshot: MissionControlSnapshot | null;
};

type ServerState = Pick<
  ApiPayload,
  "initialized" | "migrationRequired" | "missingTables" | "writeMode"
>;

type Connection =
  | { state: "live" }
  | { state: "paused" }
  | { state: "error"; retryAt: number; message: string }
  | { state: "signed_out" };

const STATUS_STYLE: Record<WorkerStatus, string> = {
  running: "bg-blue-100 text-blue-800",
  waiting: "bg-amber-100 text-amber-900",
  failed: "bg-red-100 text-red-800",
  stale: "bg-orange-100 text-orange-900",
  unknown: "bg-zinc-200 text-zinc-800",
  idle: "bg-emerald-50 text-emerald-800",
  configured: "bg-zinc-100 text-zinc-700",
  disabled: "bg-zinc-100 text-zinc-500",
  queued: "bg-indigo-100 text-indigo-800",
};

const OUTCOME_STYLE: Record<string, string> = {
  completed: "text-emerald-800",
  failed: "text-red-700",
  waiting: "text-amber-800",
  outcome_unknown: "text-orange-800",
  started: "text-blue-800",
  skipped: "text-zinc-500",
};

const OBSERVATION_LABEL: Record<string, string> = {
  run_log: "from run log",
  record_timestamp: "from record timestamp",
  live: "emitted live",
};

function fmt(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleString() : "—";
}

function ago(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m}m ago` : `${Math.round(m / 60)}h ago`;
}

function workerLabel(snapshot: MissionControlSnapshot | null, worker: string): string {
  return snapshot?.workers.find((w) => w.worker === worker)?.label ?? worker;
}

export function MissionControl() {
  const [events, setEvents] = useState<Map<number, ActivityEvent>>(new Map());
  const [snapshot, setSnapshot] = useState<MissionControlSnapshot | null>(null);
  const [serverState, setServerState] = useState<ServerState | null>(null);
  const [connection, setConnection] = useState<Connection>({ state: "live" });
  const [lastOkAt, setLastOkAt] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [workerFilter, setWorkerFilter] = useState<string>("all");
  const [showExcluded, setShowExcluded] = useState(false);

  const cursorRef = useRef<number | null>(null);
  const forceSnapshotRef = useRef(true);
  const kickRef = useRef<() => void>(() => undefined);

  const mergeEvents = useCallback((incoming: ActivityEvent[]) => {
    if (incoming.length === 0) return;
    setEvents((prev) => {
      const next = new Map(prev);
      for (const e of incoming) next.set(e.id, e);
      if (next.size <= MAX_EVENTS) return next;
      const keep = [...next.values()]
        .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
        .slice(0, MAX_EVENTS);
      return new Map(keep.map((e) => [e.id, e]));
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let failures = 0;
    let lastSnapshotAt = 0;
    let inFlight = false;

    const schedule = (ms: number) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void tick(), ms);
    };

    async function tick() {
      if (cancelled || inFlight) return;
      if (document.hidden) {
        setConnection({ state: "paused" });
        return;
      }
      const needSnapshot =
        forceSnapshotRef.current || Date.now() - lastSnapshotAt >= SNAPSHOT_EVERY_MS;
      const params = new URLSearchParams();
      if (cursorRef.current !== null) params.set("after", String(cursorRef.current));
      if (needSnapshot) params.set("snapshot", "1");
      inFlight = true;
      try {
        const res = await fetch(`/api/admin/ops/mission-control?${params}`, {
          cache: "no-store",
          headers: needSnapshot ? { [MISSION_CONTROL_SYNC_HEADER]: "1" } : undefined,
        });
        if (res.status === 401) {
          setConnection({ state: "signed_out" });
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as ApiPayload;
        if (cancelled) return;
        setServerState({
          initialized: data.initialized,
          migrationRequired: data.migrationRequired,
          missingTables: data.missingTables,
          writeMode: data.writeMode,
        });
        mergeEvents(data.events);
        cursorRef.current = data.cursor;
        if (data.snapshot) {
          setSnapshot(data.snapshot);
          lastSnapshotAt = Date.now();
          forceSnapshotRef.current = false;
        }
        failures = 0;
        setLoaded(true);
        setLastOkAt(Date.now());
        setConnection({ state: "live" });
        schedule(EVENT_POLL_MS);
      } catch (error) {
        if (cancelled) return;
        failures += 1;
        const delay = Math.min(EVENT_POLL_MS * 2 ** failures, MAX_BACKOFF_MS);
        setConnection({
          state: "error",
          retryAt: Date.now() + delay,
          message: error instanceof Error ? error.message : "Request failed",
        });
        schedule(delay);
      } finally {
        inFlight = false;
      }
    }

    kickRef.current = () => schedule(0);

    const onVisibility = () => {
      if (document.hidden) {
        if (timer) clearTimeout(timer);
        setConnection({ state: "paused" });
      } else {
        schedule(0);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    schedule(0);

    const clock = setInterval(() => setNow(Date.now()), 1_000);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      clearInterval(clock);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [mergeEvents]);

  const refreshNow = () => {
    forceSnapshotRef.current = true;
    kickRef.current();
  };

  const feed = useMemo(
    () =>
      filterActivityFeed(events.values(), { showExcluded, worker: workerFilter }),
    [events, showExcluded, workerFilter]
  );

  const stale = lastOkAt !== null && now - lastOkAt > STALE_AFTER_MS;

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold text-ink">Mission Control</h2>
          <p className="mt-1 text-xs text-ash">
            Observed activity from existing job runs and records. Near-real-time
            (≈5s refresh while visible). Nothing here starts a job.
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <ConnectionBadge connection={connection} stale={stale} now={now} />
          <span className="text-ash">
            Updated {lastOkAt ? ago(now - lastOkAt) : "—"}
            {snapshot ? ` · workers ${ago(now - Date.parse(snapshot.generatedAt))}` : ""}
          </span>
          <button
            type="button"
            onClick={refreshNow}
            className="text-ink underline"
          >
            Refresh now
          </button>
        </div>
      </header>

      {!loaded && connection.state !== "error" && (
        <p className="text-sm text-ash">Loading…</p>
      )}

      {serverState && !serverState.initialized && (
        <section className="premium-card border-l-4 border-amber-500 px-4 py-3 text-sm">
          <p className="font-medium text-ink">Mission Control not initialized</p>
          <p className="mt-1 text-ash">{serverState.migrationRequired}</p>
          <p className="mt-1 text-xs text-ash">
            Missing: {serverState.missingTables.join(", ")}. Nothing is created
            automatically. Worker status below is read directly from existing records.
          </p>
        </section>
      )}

      {serverState && !serverState.writeMode.enabled && (
        <p className="text-xs text-ash">
          Read-only: {serverState.writeMode.reason}. No activity backfill runs; the
          feed shows only events already recorded.
        </p>
      )}

      {snapshot && <PipelineSection snapshot={snapshot} />}
      {snapshot && <IncidentsSection snapshot={snapshot} />}
      {snapshot && <WorkersSection workers={snapshot.workers} />}

      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h3 className="font-display text-lg font-bold text-ink">Activity</h3>
          <div className="flex items-center gap-4 text-xs text-ash">
            <label className="flex items-center gap-1">
              Worker
              <select
                value={workerFilter}
                onChange={(e) => setWorkerFilter(e.target.value)}
                className="rounded border border-zinc-300 bg-white px-1 py-0.5 text-ink"
              >
                <option value="all">All</option>
                {(snapshot?.workers ?? []).map((w) => (
                  <option key={w.worker} value={w.worker}>
                    {w.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={showExcluded}
                onChange={(e) => setShowExcluded(e.target.checked)}
              />
              Show test/excluded
            </label>
          </div>
        </div>
        <p className="mt-1 text-xs text-ash">
          Times are the source record&apos;s timestamp. Most existing systems expose
          completed-run summaries only; intermediate steps are not invented.
        </p>
        {loaded && feed.length === 0 ? (
          <p className="mt-3 text-sm text-ash">
            {serverState && !serverState.initialized
              ? "No activity table in this database yet."
              : "No activity recorded yet."}
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-zinc-200 premium-card">
            {feed.map((e) => (
              <li key={e.id} className="px-4 py-2 text-sm">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <time className="font-mono text-xs text-ash" dateTime={e.occurredAt}>
                    {fmt(e.occurredAt)}
                  </time>
                  <span className="font-medium text-ink">
                    {workerLabel(snapshot, e.worker)}
                  </span>
                  <span className={`text-xs font-medium ${OUTCOME_STYLE[e.outcome] ?? "text-ink"}`}>
                    {e.outcome.replace("_", " ")}
                  </span>
                  {e.excluded && (
                    <span className="rounded bg-zinc-100 px-1 text-xs text-zinc-600">
                      test/excluded
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-ink">{e.summary}</p>
                <p className="mt-0.5 text-xs text-ash">
                  {e.eventType} · {OBSERVATION_LABEL[e.observation] ?? e.observation}
                  {" · "}received {fmt(e.receivedAt)}
                  {e.sourceRef ? ` · ${e.sourceRef}` : ""}
                  {e.sourceHref && (
                    <>
                      {" · "}
                      <a href={e.sourceHref} className="underline">
                        Open source
                      </a>
                    </>
                  )}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {snapshot && <ConnectionsSection snapshot={snapshot} />}
    </div>
  );
}

function ConnectionBadge({
  connection,
  stale,
  now,
}: {
  connection: Connection;
  stale: boolean;
  now: number;
}) {
  if (connection.state === "signed_out") {
    return <span className="rounded bg-red-100 px-2 py-0.5 text-red-800">Signed out — reload</span>;
  }
  if (connection.state === "paused") {
    return <span className="rounded bg-zinc-100 px-2 py-0.5 text-zinc-700">Paused (tab hidden)</span>;
  }
  if (connection.state === "error") {
    const s = Math.max(0, Math.ceil((connection.retryAt - now) / 1000));
    return (
      <span className="rounded bg-red-100 px-2 py-0.5 text-red-800" title={connection.message}>
        Disconnected — retry in {s}s
      </span>
    );
  }
  if (stale) {
    return <span className="rounded bg-orange-100 px-2 py-0.5 text-orange-900">Stale</span>;
  }
  return <span className="rounded bg-emerald-50 px-2 py-0.5 text-emerald-800">Live</span>;
}

function PipelineColumn({
  title,
  empty,
  items,
}: {
  title: string;
  empty: string;
  items: Array<{ key: string; label: string; detail: string | null; href: string | null }>;
}) {
  return (
    <div className="premium-card px-4 py-3 text-sm">
      <p className="text-xs font-bold uppercase tracking-wide text-ash">{title}</p>
      {items.length === 0 ? (
        <p className="mt-2 text-ash">{empty}</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {items.map((i) => (
            <li key={i.key}>
              {i.href ? (
                <a href={i.href} className="text-ink underline">
                  {i.label}
                </a>
              ) : (
                <span className="text-ink">{i.label}</span>
              )}
              {i.detail && <span className="block text-xs text-ash">{i.detail}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PipelineSection({ snapshot }: { snapshot: MissionControlSnapshot }) {
  const p = snapshot.pipeline;
  const withCount = (label: string, count: number | null) =>
    count === null ? label : `${count} · ${label}`;
  return (
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <PipelineColumn
        title="Active now"
        empty="Nothing running"
        items={p.active.map((i, n) => ({
          key: `a${n}`,
          label: withCount(i.label, i.count),
          detail: i.detail,
          href: i.href,
        }))}
      />
      <PipelineColumn
        title="Waiting for review"
        empty="Nothing waiting"
        items={p.waiting.map((i, n) => ({
          key: `w${n}`,
          label: withCount(i.label, i.count),
          detail: i.detail,
          href: i.href,
        }))}
      />
      <PipelineColumn
        title="Blocked / failed"
        empty="Nothing blocked"
        items={p.blocked.map((i, n) => ({
          key: `b${n}`,
          label: withCount(i.label, i.count),
          detail: i.detail,
          href: i.href,
        }))}
      />
      <PipelineColumn
        title="Scheduled (48h, UTC crons)"
        empty="No scheduled runs"
        items={p.upcoming.map((u, n) => ({
          key: `u${n}`,
          label: `${fmt(u.at)} · ${u.label}`,
          detail: u.hasRunLog ? null : "No run log — completion not observable",
          href: null,
        }))}
      />
    </section>
  );
}

function IncidentsSection({ snapshot }: { snapshot: MissionControlSnapshot }) {
  if (!snapshot.incidents) {
    return (
      <section>
        <h3 className="font-display text-lg font-bold text-ink">Incidents</h3>
        <p className="mt-1 text-sm text-ash">
          {snapshot.incidentsNote}{" "}
          <a href="/admin-ops" className="underline">
            Open Overview
          </a>
        </p>
      </section>
    );
  }
  const open = snapshot.incidents.filter((i) => !i.acknowledged);
  const acknowledged = snapshot.incidents.filter((i) => i.acknowledged);
  return (
    <section>
      <h3 className="font-display text-lg font-bold text-ink">
        Incidents ({open.length} open)
      </h3>
      <p className="mt-1 text-xs text-ash">
        Every open exception from the ops center, critical first — no summary limit.
        Acknowledge from the Overview tab.
      </p>
      {snapshot.coverageErrors.length > 0 && (
        <p className="mt-2 text-sm text-red-700">
          Coverage issue: {snapshot.coverageErrors.join("; ")}
        </p>
      )}
      {open.length === 0 ? (
        <p className="mt-3 text-sm text-ash">No open incidents.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {open.map((ex) => (
            <li
              key={`${ex.sourceType}-${ex.sourceId}`}
              className={`premium-card px-4 py-2 text-sm ${
                ex.priority === "P0" || ex.priority === "P1" ? "border-l-4 border-red-600" : ""
              }`}
            >
              <p className="font-medium text-ink">
                {ex.priority} · {ex.area} · {ex.title}
              </p>
              <p className="mt-0.5 text-ash">{ex.why}</p>
              <p className="mt-0.5 text-xs text-ash">
                Detected {fmt(ex.detectedAt)} ·{" "}
                <a href={ex.href} className="underline">
                  Open source
                </a>
              </p>
            </li>
          ))}
        </ul>
      )}
      {acknowledged.length > 0 && (
        <p className="mt-2 text-xs text-ash">
          {acknowledged.length} acknowledged exception(s) still open at source.
        </p>
      )}
    </section>
  );
}

function WorkersSection({ workers }: { workers: WorkerCard[] }) {
  return (
    <section>
      <h3 className="font-display text-lg font-bold text-ink">Workers</h3>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {workers.map((w) => (
          <li key={w.worker} className="premium-card px-4 py-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <a href={w.href} className="font-medium text-ink underline">
                {w.label}
              </a>
              <span className="flex items-center gap-1">
                {w.testMode && (
                  <span className="rounded bg-purple-100 px-1.5 text-xs text-purple-800">
                    test mode
                  </span>
                )}
                <span className={`rounded px-1.5 text-xs font-medium ${STATUS_STYLE[w.status]}`}>
                  {w.status}
                </span>
              </span>
            </div>
            {w.detail && <p className="mt-1 text-xs text-ink">{w.detail}</p>}
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-2 text-xs text-ash">
              <dt>Last run</dt>
              <dd>{fmt(w.lastRunAt)}</dd>
              <dt>Last success</dt>
              <dd>{fmt(w.lastSuccessAt)}</dd>
              {w.lastActivityAt && (
                <>
                  <dt>Last activity</dt>
                  <dd>{fmt(w.lastActivityAt)}</dd>
                </>
              )}
              <dt>Next run</dt>
              <dd>
                {w.nextRunAt ? fmt(w.nextRunAt) : "Not scheduled"}
                {w.schedule ? ` (${w.schedule})` : ""}
              </dd>
            </dl>
            {[...w.waiting, ...w.blocked].length > 0 && (
              <ul className="mt-2 text-xs">
                {[...w.waiting, ...w.blocked].map((q) => (
                  <li key={q.label}>
                    <a href={q.href} className="text-ink underline">
                      {q.count} · {q.label}
                    </a>
                  </li>
                ))}
              </ul>
            )}
            {w.flags.length > 0 && (
              <p className="mt-2 text-xs text-ash">{w.flags.join(" · ")}</p>
            )}
            <p className="mt-2 text-[11px] leading-snug text-ash">{w.coverageNote}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ConnectionsSection({ snapshot }: { snapshot: MissionControlSnapshot }) {
  const issues = snapshot.coverage.filter((c) => c.lastError);
  return (
    <section className="grid gap-6 md:grid-cols-2">
      <div>
        <h3 className="font-display text-sm font-bold uppercase tracking-wide text-ash">
          System connections
        </h3>
        {snapshot.connections ? (
          <ul className="mt-2 space-y-1 text-sm text-ink">
            {snapshot.connections.map((c) => (
              <li key={c.area}>
                {c.area}: <span className="font-medium">{c.status}</span>
                {c.detail && <span className="text-xs text-ash"> · {c.detail}</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-ash">
            Not loaded in read-only mode (shown on the Overview tab).
          </p>
        )}
      </div>
      <div>
        <h3 className="font-display text-sm font-bold uppercase tracking-wide text-ash">
          Activity coverage
        </h3>
        {snapshot.coverage.length === 0 ? (
          <p className="mt-2 text-sm text-ash">No activity sync has run yet.</p>
        ) : issues.length === 0 ? (
          <p className="mt-2 text-sm text-ash">
            All {snapshot.coverage.length} sources read OK.
          </p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {issues.map((c) => (
              <li key={c.source} className="text-ink">
                {c.source}: <span className="text-red-700">{c.lastError}</span>
                <span className="block text-xs text-ash">
                  Last OK {fmt(c.lastOkAt)} · attempted {fmt(c.lastAttemptAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
