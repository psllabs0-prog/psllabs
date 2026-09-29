/**
 * Custom request header required before a snapshot request may project new
 * activity rows. Cross-site pages cannot set it without a CORS preflight.
 */
export const MISSION_CONTROL_SYNC_HEADER = "x-psl-mission-control";

export const MISSION_CONTROL_WORKERS = [
  "support",
  "finance",
  "inventory",
  "fulfillment",
  "discord",
  "authority",
  "customer_intelligence",
  "decision_engine",
  "ceo_brief",
  "retention",
  "data_sync",
] as const;

export type MissionControlWorker = (typeof MISSION_CONTROL_WORKERS)[number];

/**
 * External automation that reports into the feed. Kept apart from the
 * business workers so an integration can never write as finance, support,
 * etc. (see `normalizeActivityEvent`).
 */
export const MISSION_CONTROL_INTEGRATIONS = ["n8n"] as const;

export type MissionControlIntegration = (typeof MISSION_CONTROL_INTEGRATIONS)[number];

export type MissionControlActor = MissionControlWorker | MissionControlIntegration;

export const ACTIVITY_OUTCOMES = [
  "started",
  "submitted",
  "accepted",
  "completed",
  "failed",
  "skipped",
  "waiting",
  "outcome_unknown",
] as const;

export type ActivityOutcome = (typeof ACTIVITY_OUTCOMES)[number];

/**
 * How the event was observed. Existing systems mostly expose completed-run
 * summaries or record timestamps; only `live` means emitted at the transition.
 */
export type ActivityObservation = "run_log" | "record_timestamp" | "live";

export type ActivityEventInput = {
  sourceEventKey: string;
  correlationId?: string | null;
  parentTaskId?: string | null;
  sourceSystem: string;
  worker: MissionControlActor;
  eventType: string;
  outcome: ActivityOutcome;
  observation: ActivityObservation;
  occurredAt: string;
  summary: string;
  sourceRef?: string | null;
  sourceHref?: string | null;
  excluded?: boolean;
  versions?: Record<string, string>;
  estimatedCostUsd?: number | null;
  providerCostUsd?: number | null;
};

export type ActivityEvent = Required<
  Omit<ActivityEventInput, "versions" | "estimatedCostUsd" | "providerCostUsd">
> & {
  id: number;
  receivedAt: string;
  versions: Record<string, string>;
  estimatedCostUsd: number | null;
  providerCostUsd: number | null;
};

/** Default feed hides test/reporting-excluded events unless explicitly shown. */
export function filterActivityFeed(
  events: Iterable<ActivityEvent>,
  options: { showExcluded: boolean; worker: string }
): ActivityEvent[] {
  return [...events]
    .filter((e) => options.showExcluded || !e.excluded)
    .filter((e) => options.worker === "all" || e.worker === options.worker)
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

export type WorkerStatus =
  | "configured"
  | "disabled"
  | "idle"
  | "queued"
  | "running"
  | "waiting"
  | "failed"
  | "stale"
  | "unknown";

/** What the underlying source can actually tell us about runs. */
export type RunLogCoverage =
  | "full" // start + finish rows
  | "finish_only" // one row written when a run finishes
  | "success_only" // artifacts only exist when a run succeeds
  | "event_driven" // records per interaction, no schedule
  | "human_queue" // human-operated workflow, no automated job
  | "none";

export type WorkerQueueItem = {
  label: string;
  count: number;
  href: string;
};

export type WorkerCard = {
  worker: MissionControlWorker;
  label: string;
  status: WorkerStatus;
  detail: string | null;
  coverage: RunLogCoverage;
  coverageNote: string;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastActivityAt: string | null;
  nextRunAt: string | null;
  schedule: string | null;
  testMode: boolean;
  flags: string[];
  waiting: WorkerQueueItem[];
  blocked: WorkerQueueItem[];
  href: string;
};

export type ActivitySyncState = {
  source: string;
  lastAttemptAt: string | null;
  lastOkAt: string | null;
  lastError: string | null;
  lastInserted: number;
};
