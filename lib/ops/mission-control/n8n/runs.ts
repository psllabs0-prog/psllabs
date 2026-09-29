import crypto from "node:crypto";

import { getSql } from "@/lib/db/sql";

import { mapEventRow, normalizeActivityEvent, sanitizeActivitySummary } from "../events";
import type { ActivityEvent, ActivityEventInput, WorkerStatus } from "../types";
import { collectWorkerCards } from "../workers";
import { getN8nIntegrationMode } from "./config";
import type { N8nFailureReason, N8nLifecycleReport, N8nRegisterRequest } from "./validate";

/**
 * A run with no terminal report this long after registration is shown as
 * outcome unknown, and late terminal reports are rejected.
 */
export const N8N_CONNECTION_TEST_TIMEOUT_MS = 10 * 60 * 1000;
export const N8N_REGISTRATION_LIMIT = 5;
export const N8N_REGISTRATION_WINDOW_MS = 10 * 60 * 1000;

export const N8N_EVENT_TYPES = {
  registered: "n8n_connection_test_registered",
  statusServed: "n8n_connection_test_status_served",
  started: "n8n_connection_test_started",
  completed: "n8n_connection_test_completed",
  failed: "n8n_connection_test_failed",
} as const;

export const N8N_RUN_LABEL = "n8n connection test (TEST / EXCLUDED)";

export const N8N_COMPLETION_MEANING =
  "Completed means the n8n connection test retrieved its expected status summary. It does not mean every business system is healthy.";

const WORKFLOW_REPORTED = "workflow-reported, not verified business data";

export type N8nRunState = "registered" | "running" | "completed" | "failed" | "outcome_unknown";

export type N8nRunView = {
  runId: string;
  label: string;
  classification: "TEST";
  excluded: true;
  state: N8nRunState;
  registeredAt: string;
  timeoutAt: string;
  statusServedAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  systemsServed: number | null;
  systemsReported: number | null;
  failureReason: string | null;
  n8nExecutionId: string | null;
};

export const registrationKey = (requestId: string) =>
  `n8n:connection_test:request:${requestId}`;
const runKey = (runId: string, step: "status_served" | "started" | "terminal") =>
  `n8n:connection_test:run:${runId}:${step}`;

function requestFingerprint(r: N8nRegisterRequest): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify({ workflow: r.workflow, n8nExecutionId: r.n8nExecutionId }))
    .digest("hex")
    .slice(0, 32);
}

function baseEvent(runId: string, now: Date) {
  return {
    correlationId: runId,
    parentTaskId: null,
    sourceSystem: "n8n",
    worker: "n8n" as const,
    observation: "live" as const,
    occurredAt: now.toISOString(),
    sourceRef: runId,
    sourceHref: null,
    excluded: true,
  };
}

/** Pure: a run's state from its stored events (any order). */
export function deriveN8nRunView(events: ActivityEvent[], now: Date): N8nRunView | null {
  const byType = (t: string) => events.find((e) => e.eventType === t) ?? null;
  const registered = byType(N8N_EVENT_TYPES.registered);
  if (!registered?.correlationId) return null;
  const served = byType(N8N_EVENT_TYPES.statusServed);
  const started = byType(N8N_EVENT_TYPES.started);
  const terminal = byType(N8N_EVENT_TYPES.completed) ?? byType(N8N_EVENT_TYPES.failed);

  const registeredMs = Date.parse(registered.occurredAt);
  const timeoutAt = new Date(registeredMs + N8N_CONNECTION_TEST_TIMEOUT_MS);
  let state: N8nRunState;
  if (terminal) state = terminal.eventType === N8N_EVENT_TYPES.completed ? "completed" : "failed";
  else if (now.getTime() >= timeoutAt.getTime()) state = "outcome_unknown";
  else if (served || started) state = "running";
  else state = "registered";

  const num = (v: string | undefined) => (v && /^\d+$/.test(v) ? Number(v) : null);
  return {
    runId: registered.correlationId,
    label: N8N_RUN_LABEL,
    classification: "TEST",
    excluded: true,
    state,
    registeredAt: registered.occurredAt,
    timeoutAt: timeoutAt.toISOString(),
    statusServedAt: served?.occurredAt ?? null,
    startedAt: started?.occurredAt ?? null,
    finishedAt: terminal?.occurredAt ?? null,
    systemsServed: num(served?.versions.systemCount),
    systemsReported: num(terminal?.versions.systemsReceived),
    failureReason: terminal?.versions.failureReason ?? null,
    n8nExecutionId: registered.versions.n8nExecutionId || null,
  };
}

/**
 * Inserts once by stable key; an existing row is returned untouched (never
 * updated), so retries cannot duplicate or rewrite history.
 */
async function insertOnce(
  input: ActivityEventInput
): Promise<{ inserted: boolean; event: ActivityEvent }> {
  if (!getN8nIntegrationMode().enabled) {
    throw new Error("n8n integration writes are disabled");
  }
  const e = normalizeActivityEvent(input);
  if (!e || e.worker !== "n8n" || !e.excluded) {
    throw new Error("Refusing to store an invalid n8n event");
  }
  const sql = getSql();
  const inserted = (await sql`
    INSERT INTO ops_activity_events (
      source_event_key, correlation_id, parent_task_id, source_system,
      worker, event_type, outcome, observation, occurred_at, summary,
      source_ref, source_href, excluded, versions_json
    ) VALUES (
      ${e.sourceEventKey}, ${e.correlationId ?? null}, ${null}, ${e.sourceSystem},
      ${e.worker}, ${e.eventType}, ${e.outcome}, ${e.observation},
      ${e.occurredAt}::timestamptz, ${e.summary}, ${e.sourceRef ?? null}, ${null},
      ${true}, ${JSON.stringify(e.versions ?? {})}::jsonb
    )
    ON CONFLICT (source_event_key) DO NOTHING
    RETURNING *
  `) as Record<string, unknown>[];
  if (inserted[0]) return { inserted: true, event: mapEventRow(inserted[0]) };
  const existing = await findByKey(e.sourceEventKey);
  if (!existing) throw new Error("n8n event conflict without an existing row");
  return { inserted: false, event: existing };
}

async function findByKey(key: string): Promise<ActivityEvent | null> {
  const sql = getSql();
  const rows = (await sql`
    SELECT * FROM ops_activity_events
    WHERE source_event_key = ${key} AND source_system = 'n8n'
    LIMIT 1
  `) as Record<string, unknown>[];
  return rows[0] ? mapEventRow(rows[0]) : null;
}

async function loadRunEvents(runId: string): Promise<ActivityEvent[]> {
  const sql = getSql();
  const rows = (await sql`
    SELECT * FROM ops_activity_events
    WHERE source_system = 'n8n' AND correlation_id = ${runId}
    ORDER BY id ASC
    LIMIT 20
  `) as Record<string, unknown>[];
  return rows.map(mapEventRow);
}

export type N8nResult = { status: number; body: Record<string, unknown> };

function runPaths(runId: string) {
  const base = `/api/integrations/n8n/mission-control/runs/${runId}`;
  return { status: `${base}/status`, events: `${base}/events` };
}

function runBody(view: N8nRunView, extra: Record<string, unknown> = {}) {
  return {
    runId: view.runId,
    state: view.state,
    classification: view.classification,
    excluded: view.excluded,
    registeredAt: view.registeredAt,
    timeoutAt: view.timeoutAt,
    ...extra,
  };
}

export async function registerN8nRun(
  request: N8nRegisterRequest,
  now: Date
): Promise<N8nResult> {
  const key = registrationKey(request.requestId);
  const fingerprint = requestFingerprint(request);

  const replay = async (existing: ActivityEvent): Promise<N8nResult> => {
    if (existing.versions.requestFingerprint !== fingerprint || !existing.correlationId) {
      return {
        status: 409,
        body: { error: "requestId was already used for a different registration." },
      };
    }
    const view = deriveN8nRunView(await loadRunEvents(existing.correlationId), now);
    if (!view) return { status: 409, body: { error: "requestId refers to an unreadable run." } };
    return { status: 200, body: runBody(view, { replayed: true, next: runPaths(view.runId) }) };
  };

  const prior = await findByKey(key);
  if (prior) return replay(prior);

  const sql = getSql();
  const since = new Date(now.getTime() - N8N_REGISTRATION_WINDOW_MS).toISOString();
  const [{ n }] = (await sql`
    SELECT COUNT(*)::int AS n FROM ops_activity_events
    WHERE source_system = 'n8n'
      AND event_type = ${N8N_EVENT_TYPES.registered}
      AND received_at > ${since}::timestamptz
  `) as Array<{ n: number }>;
  if (Number(n) >= N8N_REGISTRATION_LIMIT) {
    return {
      status: 429,
      body: {
        error: `At most ${N8N_REGISTRATION_LIMIT} connection tests per ${N8N_REGISTRATION_WINDOW_MS / 60000} minutes.`,
      },
    };
  }

  const runId = `n8n_${crypto.randomUUID()}`;
  const result = await insertOnce({
    ...baseEvent(runId, now),
    sourceEventKey: key,
    eventType: N8N_EVENT_TYPES.registered,
    outcome: "submitted",
    summary: "n8n connection test registered (TEST / EXCLUDED — not business activity)",
    versions: {
      integration: "n8n",
      classification: "TEST",
      workflow: request.workflow,
      requestFingerprint: fingerprint,
      n8nExecutionId: request.n8nExecutionId ?? "",
    },
  });
  if (!result.inserted) return replay(result.event);
  const view = deriveN8nRunView([result.event], now)!;
  return { status: 201, body: runBody(view, { replayed: false, next: runPaths(runId) }) };
}

export type N8nStatusSystem = {
  system: string;
  key: string;
  status: WorkerStatus;
  lastActivityAt: string | null;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  note: string | null;
};

const NOTE_STATUSES: WorkerStatus[] = ["unknown", "stale", "failed", "disabled", "configured"];
const UNAVAILABLE_STATUSES: WorkerStatus[] = ["unknown", "stale"];

/** Minimal read-only summary: names, observed status, timestamps, availability notes. */
export async function buildN8nStatusSummary(now: Date) {
  const cards = await collectWorkerCards({ now });
  const systems: N8nStatusSystem[] = cards.map((c) => ({
    system: c.label,
    key: c.worker,
    status: c.status,
    lastActivityAt: c.lastActivityAt,
    lastRunAt: c.lastRunAt,
    lastSuccessAt: c.lastSuccessAt,
    note:
      NOTE_STATUSES.includes(c.status) && c.detail ? sanitizeActivitySummary(c.detail) : null,
  }));
  return {
    observedAt: now.toISOString(),
    systems,
    unavailableSources: systems
      .filter((s) => UNAVAILABLE_STATUSES.includes(s.status))
      .map((s) => s.key),
  };
}

function closedRunResult(view: N8nRunView): N8nResult {
  return {
    status: 409,
    body: runBody(view, {
      error:
        view.state === "outcome_unknown"
          ? "Run exceeded its timeout without a terminal report; outcome unknown."
          : "Run is already finished.",
    }),
  };
}

export async function serveN8nStatus(runId: string, now: Date): Promise<N8nResult> {
  const view = deriveN8nRunView(await loadRunEvents(runId), now);
  if (!view) return { status: 404, body: { error: "Unknown runId." } };
  if (view.state === "completed" || view.state === "failed" || view.state === "outcome_unknown") {
    return closedRunResult(view);
  }
  const summary = await buildN8nStatusSummary(now);
  await insertOnce({
    ...baseEvent(runId, now),
    sourceEventKey: runKey(runId, "status_served"),
    eventType: N8N_EVENT_TYPES.statusServed,
    outcome: "accepted",
    summary: `Mission Control served a read-only status summary (${summary.systems.length} systems) to an n8n connection test (TEST)`,
    versions: {
      integration: "n8n",
      classification: "TEST",
      systemCount: String(summary.systems.length),
    },
  });
  return {
    status: 200,
    body: {
      runId,
      classification: "TEST",
      excluded: true,
      meaning:
        "Statuses are Mission Control's own observations at observedAt. Stale or unavailable sources are reported as such.",
      ...summary,
    },
  };
}

function terminalMatches(existing: ActivityEvent, report: N8nLifecycleReport): boolean {
  if (report.phase === "completed") {
    return (
      existing.eventType === N8N_EVENT_TYPES.completed &&
      existing.versions.systemsReceived === String(report.systemsReceived)
    );
  }
  if (report.phase === "failed") {
    return (
      existing.eventType === N8N_EVENT_TYPES.failed &&
      existing.versions.failureReason === report.reason
    );
  }
  return false;
}

function terminalEvent(
  runId: string,
  report: Exclude<N8nLifecycleReport, { phase: "started" }>,
  now: Date
): ActivityEventInput {
  const versions: Record<string, string> = {
    integration: "n8n",
    classification: "TEST",
    reportedBy: WORKFLOW_REPORTED,
  };
  if (report.phase === "completed") {
    versions.systemsReceived = String(report.systemsReceived);
    return {
      ...baseEvent(runId, now),
      sourceEventKey: runKey(runId, "terminal"),
      eventType: N8N_EVENT_TYPES.completed,
      outcome: "completed",
      summary: `n8n connection test completed (${WORKFLOW_REPORTED}): retrieved the status summary for ${report.systemsReceived} systems. TEST — does not mean systems are healthy.`,
      versions,
    };
  }
  versions.failureReason = report.reason satisfies N8nFailureReason;
  return {
    ...baseEvent(runId, now),
    sourceEventKey: runKey(runId, "terminal"),
    eventType: N8N_EVENT_TYPES.failed,
    outcome: "failed",
    summary: `n8n connection test failed (${WORKFLOW_REPORTED}): ${report.reason.replace(/_/g, " ")}. TEST — not a business-system failure report.`,
    versions,
  };
}

export async function reportN8nLifecycle(
  runId: string,
  report: N8nLifecycleReport,
  now: Date
): Promise<N8nResult> {
  const events = await loadRunEvents(runId);
  const view = deriveN8nRunView(events, now);
  if (!view) return { status: 404, body: { error: "Unknown runId." } };

  if (report.phase === "started") {
    if (view.state === "completed" || view.state === "failed") {
      return { status: 200, body: runBody(view, { applied: false, note: "Run already finished; not reopened." }) };
    }
    if (view.state === "outcome_unknown") return closedRunResult(view);
    const r = await insertOnce({
      ...baseEvent(runId, now),
      sourceEventKey: runKey(runId, "started"),
      eventType: N8N_EVENT_TYPES.started,
      outcome: "started",
      summary: `n8n connection test started (${WORKFLOW_REPORTED})`,
      versions: { integration: "n8n", classification: "TEST", reportedBy: WORKFLOW_REPORTED },
    });
    const after = deriveN8nRunView(r.inserted ? [...events, r.event] : events, now)!;
    return { status: 200, body: runBody(after, { applied: r.inserted }) };
  }

  const existingTerminal = events.find(
    (e) => e.eventType === N8N_EVENT_TYPES.completed || e.eventType === N8N_EVENT_TYPES.failed
  );
  if (existingTerminal) {
    return terminalMatches(existingTerminal, report)
      ? { status: 200, body: runBody(view, { applied: false }) }
      : { status: 409, body: runBody(view, { error: "A different terminal result was already recorded for this run." }) };
  }
  if (view.state === "outcome_unknown") return closedRunResult(view);
  if (report.phase === "completed") {
    if (view.systemsServed === null) {
      return {
        status: 409,
        body: runBody(view, { error: "No status summary was served for this run; it cannot be completed." }),
      };
    }
    if (report.systemsReceived !== view.systemsServed) {
      return {
        status: 422,
        body: runBody(view, { error: "systemsReceived does not match the summary Mission Control served." }),
      };
    }
  }

  const r = await insertOnce(terminalEvent(runId, report, now));
  if (!r.inserted && !terminalMatches(r.event, report)) {
    return { status: 409, body: runBody(view, { error: "A different terminal result was already recorded for this run." }) };
  }
  const after = deriveN8nRunView([...events.filter((e) => e.id !== r.event.id), r.event], now)!;
  return { status: 200, body: runBody(after, { applied: r.inserted, meaning: N8N_COMPLETION_MEANING }) };
}

/** Read-only: recent runs for the Mission Control panel. */
export async function listRecentN8nRuns(now: Date, limit = 10): Promise<N8nRunView[]> {
  const sql = getSql();
  const rows = (await sql`
    SELECT * FROM ops_activity_events
    WHERE source_system = 'n8n'
    ORDER BY id DESC
    LIMIT 200
  `) as Record<string, unknown>[];
  const groups = new Map<string, ActivityEvent[]>();
  for (const e of rows.map(mapEventRow)) {
    if (!e.correlationId) continue;
    groups.set(e.correlationId, [...(groups.get(e.correlationId) ?? []), e]);
  }
  return [...groups.values()]
    .map((g) => deriveN8nRunView(g, now))
    .filter((v): v is N8nRunView => v !== null)
    .sort((a, b) => b.registeredAt.localeCompare(a.registeredAt))
    .slice(0, limit);
}
