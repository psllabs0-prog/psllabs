import { getSql } from "@/lib/db/sql";
import { getBtcpostagePublicConfig } from "@/lib/btcpostage/config";
import { getLatestCeoBrief } from "@/lib/ceo-brief/store";
import { getLatestCustomerIntelSnapshot } from "@/lib/customer-intelligence/signals-store";
import { getDiscordAdminStatusSafe } from "@/lib/discord/config";
import { getAllPaidProviderStatuses } from "@/lib/external-metrics/paid/providers";
import { getLatestFinanceJobRun } from "@/lib/finance/store";
import { collectFulfillmentBoard } from "@/lib/fulfillment/store";
import {
  getRetentionReadiness,
  isRetentionTestMode,
} from "@/lib/retention/config";
import { getLatestRetentionJobRun } from "@/lib/retention/store";
import {
  SUPPORT_INBOX_LEASE_STALE_MINUTES,
  isSupportAutoSendEnabled,
  isSupportTestMode,
} from "@/lib/support/constants";
import {
  getLatestJobRun as getLatestSupportJobRun,
  getLatestSuccessfulSupportJobRun,
  getSupportExpectedPollMinutes,
} from "@/lib/support/store";

import type { OpsException } from "../types";
import { toIsoOrNull } from "./events";
import { nextRunForWorker } from "./schedule";
import type {
  MissionControlWorker,
  RunLogCoverage,
  WorkerCard,
  WorkerQueueItem,
  WorkerStatus,
} from "./types";

const MINUTE = 60 * 1000;
const DAY_MINUTES = 24 * 60;
/** A run row still marked running after this is treated as outcome unknown. */
export const RUNNING_WINDOW_MINUTES = 30;

export type LatestRunObservation = {
  startedAt: string | null;
  finishedAt: string | null;
  outcome: "running" | "ok" | "failed" | "unknown";
};

export type WorkerObservation = {
  enabled: boolean;
  misconfigured?: string | null;
  coverage: RunLogCoverage;
  latestRun: LatestRunObservation | null;
  lastSuccessAt: string | null;
  lastActivityAt?: string | null;
  staleAfterMinutes: number | null;
  /** External running signal (e.g. support inbox lease) independent of run rows. */
  leaseHeld?: boolean;
  waitingCount: number;
  observationFailed?: boolean;
  now: Date;
};

function ageMinutes(iso: string | null | undefined, now: Date): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? (now.getTime() - t) / MINUTE : null;
}

/**
 * Pure status derivation. Never reports healthy/idle when the source cannot
 * show it; missing logs are `unknown`, a daily job between runs is `idle`.
 */
export function deriveWorkerStatus(o: WorkerObservation): {
  status: WorkerStatus;
  detail: string | null;
} {
  if (o.observationFailed) {
    return { status: "unknown", detail: "Status query failed — not assumed healthy" };
  }
  if (!o.enabled) return { status: "disabled", detail: null };
  if (o.misconfigured) return { status: "failed", detail: o.misconfigured };
  if (o.leaseHeld) return { status: "running", detail: "Run lease held" };

  const run = o.latestRun;
  if (run?.outcome === "running") {
    const age = ageMinutes(run.startedAt, o.now);
    if (age !== null && age <= RUNNING_WINDOW_MINUTES) {
      return { status: "running", detail: `Started ${run.startedAt}` };
    }
    return {
      status: "unknown",
      detail: `Run started ${run.startedAt ?? "?"} without a recorded finish (outcome unknown)`,
    };
  }
  if (run?.outcome === "failed") {
    return {
      status: "failed",
      detail: `Last run failed ${run.finishedAt ?? run.startedAt ?? ""}`.trim(),
    };
  }
  if (o.waitingCount > 0) {
    return { status: "waiting", detail: `${o.waitingCount} item(s) awaiting review` };
  }
  if (o.coverage === "human_queue") {
    return { status: "idle", detail: "No items waiting" };
  }
  if (o.coverage === "event_driven") {
    return {
      status: "idle",
      detail: o.lastActivityAt ? null : "No interactions recorded",
    };
  }
  if (o.coverage === "none") {
    return { status: "unknown", detail: "No job-run log available" };
  }
  if (!run && !o.lastSuccessAt) {
    return { status: "configured", detail: "No runs recorded yet" };
  }
  if (run?.outcome === "unknown") {
    return { status: "unknown", detail: "Last run outcome not recorded" };
  }
  if (o.staleAfterMinutes !== null) {
    const age = ageMinutes(o.lastSuccessAt, o.now);
    if (age === null || age > o.staleAfterMinutes) {
      return {
        status: "stale",
        detail: o.lastSuccessAt
          ? `Last success ${o.lastSuccessAt}`
          : "No successful run recorded",
      };
    }
  }
  return { status: "idle", detail: null };
}

type WorkerDefinition = {
  worker: MissionControlWorker;
  label: string;
  href: string;
  coverage: RunLogCoverage;
  coverageNote: string;
};

const DEFINITIONS: Record<MissionControlWorker, WorkerDefinition> = {
  support: {
    worker: "support",
    label: "Support",
    href: "/admin-support",
    coverage: "finish_only",
    coverageNote: "Run row written when an inbox run finishes; running shown from the inbox lease.",
  },
  finance: {
    worker: "finance",
    label: "Finance",
    href: "/admin-finance",
    coverage: "full",
    coverageNote: "Reconciliation run rows record start and finish.",
  },
  inventory: {
    worker: "inventory",
    label: "Inventory",
    href: "/admin-inventory",
    coverage: "success_only",
    coverageNote: "Only successful monitor snapshots are stored; failed runs are not logged (staleness only).",
  },
  fulfillment: {
    worker: "fulfillment",
    label: "Fulfillment",
    href: "/admin-fulfillment",
    coverage: "human_queue",
    coverageNote: "Human-operated queue. Delivery follow-up cron writes no run log.",
  },
  discord: {
    worker: "discord",
    label: "Discord",
    href: "/admin-discord",
    coverage: "event_driven",
    coverageNote: "Records each interaction; no schedule.",
  },
  authority: {
    worker: "authority",
    label: "Authority",
    href: "/admin-authority",
    coverage: "none",
    coverageNote: "Admin-driven; no job-run log. Activity shown from opportunity/brief timestamps.",
  },
  customer_intelligence: {
    worker: "customer_intelligence",
    label: "Customer Intelligence",
    href: "/admin-customer-intelligence",
    coverage: "success_only",
    coverageNote: "Only generated snapshots are stored; failed runs are not logged.",
  },
  decision_engine: {
    worker: "decision_engine",
    label: "Decision Engine",
    href: "/admin-decisions",
    coverage: "full",
    coverageNote: "Run rows record start and finish.",
  },
  ceo_brief: {
    worker: "ceo_brief",
    label: "CEO Brief",
    href: "/admin-ceo",
    coverage: "success_only",
    coverageNote: "Only generated briefs are stored; email send errors are recorded on the brief.",
  },
  retention: {
    worker: "retention",
    label: "Retention",
    href: "/admin-retention",
    coverage: "finish_only",
    coverageNote: "Run row written when a retention run finishes.",
  },
  data_sync: {
    worker: "data_sync",
    label: "Data Sync",
    href: "/admin-data",
    coverage: "full",
    coverageNote: "Search Console / paid reporting sync rows record start and finish.",
  },
};

function countExceptions(
  exceptions: OpsException[],
  predicate: (e: OpsException) => boolean
): number {
  return exceptions.filter((e) => !e.acknowledged && predicate(e)).length;
}

function queue(label: string, count: number, href: string): WorkerQueueItem[] {
  return count > 0 ? [{ label, count, href }] : [];
}

function runStatusToOutcome(status: string | null): LatestRunObservation["outcome"] {
  if (status === "running") return "running";
  if (status === "ok") return "ok";
  if (status === "error") return "failed";
  return "unknown";
}

function okFlag(ok: boolean | null | undefined): LatestRunObservation["outcome"] {
  if (ok === true) return "ok";
  if (ok === false) return "failed";
  return "unknown";
}

type WorkerObservationResult = {
  observation: Omit<WorkerObservation, "now" | "coverage">;
  testMode?: boolean;
  flags?: string[];
  waiting?: WorkerQueueItem[];
  blocked?: WorkerQueueItem[];
};

type RunRow = { started_at: unknown; completed_at: unknown; status: string };

async function scalarIso(query: Promise<unknown>): Promise<string | null> {
  const rows = (await query) as Array<{ at: unknown }>;
  return toIsoOrNull(rows[0]?.at);
}

async function observeSupport(exceptions: OpsException[]): Promise<WorkerObservationResult> {
  const sql = getSql();
  const [latest, lastOk, lease] = await Promise.all([
    getLatestSupportJobRun(),
    getLatestSuccessfulSupportJobRun(),
    sql`
      SELECT claimed_at FROM support_inbox_lease
      WHERE id = 1 AND claimed_at IS NOT NULL
        AND claimed_at > now() - (${SUPPORT_INBOX_LEASE_STALE_MINUTES}::int * interval '1 minute')
    `.then((rows) => rows as Array<{ claimed_at: unknown }>),
  ]);
  const escalations = countExceptions(exceptions, (e) => e.sourceType === "support_escalation");
  const autoSend = isSupportAutoSendEnabled();
  return {
    observation: {
      enabled: true,
      latestRun: latest
        ? { startedAt: null, finishedAt: latest.finishedAt, outcome: okFlag(latest.ok) }
        : null,
      lastSuccessAt: lastOk?.finishedAt ?? null,
      staleAfterMinutes: getSupportExpectedPollMinutes() * 2,
      leaseHeld: lease.length > 0,
      waitingCount: escalations,
    },
    testMode: isSupportTestMode(),
    flags: [autoSend ? "Auto-send on (eligible contact-form GREEN only)" : "Auto-send off"],
    waiting: queue("Open support escalations", escalations, "/admin-support"),
  };
}

async function observeFinance(exceptions: OpsException[]): Promise<WorkerObservationResult> {
  const sql = getSql();
  const [latest, lastOk] = await Promise.all([
    getLatestFinanceJobRun("finance_reconciliation"),
    scalarIso(sql`
      SELECT finished_at AS at FROM finance_job_runs
      WHERE job_name = 'finance_reconciliation' AND status = 'ok'
      ORDER BY started_at DESC LIMIT 1
    `),
  ]);
  const warnings = countExceptions(
    exceptions,
    (e) => e.sourceType === "finance_reconciliation_warning"
  );
  return {
    observation: {
      enabled: true,
      latestRun: latest
        ? {
            startedAt: latest.startedAt,
            finishedAt: latest.finishedAt,
            outcome: runStatusToOutcome(latest.status),
          }
        : null,
      lastSuccessAt: lastOk,
      staleAfterMinutes: 2 * DAY_MINUTES + 60,
      waitingCount: warnings,
    },
    waiting: queue("Open reconciliation warnings", warnings, "/admin-finance"),
  };
}

async function observeInventory(exceptions: OpsException[]): Promise<WorkerObservationResult> {
  const sql = getSql();
  const lastOk = await scalarIso(
    sql`SELECT MAX(created_at) AS at FROM inventory_monitor_snapshots`
  );
  const awaitingTesting = countExceptions(
    exceptions,
    (e) => e.sourceType === "inventory_awaiting_testing"
  );
  const reorder = countExceptions(
    exceptions,
    (e) => e.sourceType === "inventory_reorder_review"
  );
  return {
    observation: {
      enabled: true,
      latestRun: lastOk ? { startedAt: null, finishedAt: lastOk, outcome: "ok" } : null,
      lastSuccessAt: lastOk,
      // Matches the ops exception threshold (2.5 days).
      staleAfterMinutes: 2.5 * DAY_MINUTES,
      waitingCount: awaitingTesting + reorder,
    },
    waiting: [
      ...queue("Lots awaiting testing release", awaitingTesting, "/admin-inventory"),
      ...queue("Reorder reviews", reorder, "/admin-inventory"),
    ],
  };
}

async function observeFulfillment(): Promise<WorkerObservationResult> {
  const sql = getSql();
  const [board, lastActivity] = await Promise.all([
    collectFulfillmentBoard(),
    scalarIso(sql`SELECT MAX(updated_at) AS at FROM fulfillment_workflow`).catch(
      () => null
    ),
  ]);
  const s = board.summary;
  const btcp = getBtcpostagePublicConfig();
  return {
    observation: {
      enabled: true,
      latestRun: null,
      lastSuccessAt: null,
      lastActivityAt: lastActivity,
      staleAfterMinutes: null,
      waitingCount: s.readyOrders + s.packedWaitingTracking + s.holds,
    },
    testMode: btcp.testMode,
    flags: [btcp.configured ? "BTCPostage configured" : "BTCPostage not configured"],
    waiting: [
      ...queue("Ready to pack", s.readyOrders, "/admin-fulfillment"),
      ...queue("Packed awaiting tracking", s.packedWaitingTracking, "/admin-fulfillment"),
    ],
    blocked: queue("Orders on hold", s.holds, "/admin-fulfillment"),
  };
}

async function observeDiscord(): Promise<WorkerObservationResult> {
  const status = getDiscordAdminStatusSafe();
  const sql = getSql();
  const lastActivity = status.enabled
    ? await scalarIso(sql`SELECT MAX(created_at) AS at FROM discord_interactions`).catch(
        () => null
      )
    : null;
  return {
    observation: {
      enabled: status.enabled,
      misconfigured: status.enabled && !status.ready ? "Enabled but bot configuration incomplete" : null,
      latestRun: null,
      lastSuccessAt: null,
      lastActivityAt: lastActivity,
      staleAfterMinutes: null,
      waitingCount: 0,
    },
    testMode: status.testMode,
  };
}

async function observeAuthority(exceptions: OpsException[]): Promise<WorkerObservationResult> {
  const sql = getSql();
  const lastActivity = await scalarIso(
    sql`SELECT MAX(updated_at) AS at FROM authority_opportunities`
  ).catch(() => null);
  const waiting = countExceptions(
    exceptions,
    (e) => e.sourceType === "authority_brief_waiting"
  );
  return {
    observation: {
      enabled: true,
      latestRun: null,
      lastSuccessAt: null,
      lastActivityAt: lastActivity,
      staleAfterMinutes: null,
      waitingCount: waiting,
    },
    waiting: queue("Approved briefs waiting >21d", waiting, "/admin-authority"),
  };
}

async function observeCustomerIntel(): Promise<WorkerObservationResult> {
  const snap = await getLatestCustomerIntelSnapshot();
  return {
    observation: {
      enabled: true,
      latestRun: snap
        ? { startedAt: null, finishedAt: snap.generatedAt, outcome: "ok" }
        : null,
      lastSuccessAt: snap?.generatedAt ?? null,
      // Matches the readiness matrix (>10 days = attention).
      staleAfterMinutes: 10 * DAY_MINUTES,
      waitingCount: 0,
    },
  };
}

async function observeDecisionEngine(lukeDecisionCount: number): Promise<WorkerObservationResult> {
  const sql = getSql();
  const [latestRows, lastOk] = await Promise.all([
    sql`
      SELECT started_at, completed_at, status FROM decision_engine_runs
      ORDER BY id DESC LIMIT 1
    `.then((rows) => rows as RunRow[]),
    scalarIso(sql`
      SELECT completed_at AS at FROM decision_engine_runs
      WHERE status = 'ok' ORDER BY id DESC LIMIT 1
    `),
  ]);
  const latest = latestRows[0];
  return {
    observation: {
      enabled: true,
      latestRun: latest
        ? {
            startedAt: toIsoOrNull(latest.started_at),
            finishedAt: toIsoOrNull(latest.completed_at),
            outcome: runStatusToOutcome(latest.status),
          }
        : null,
      lastSuccessAt: lastOk,
      // Matches the readiness matrix (>2 days = attention).
      staleAfterMinutes: 2 * DAY_MINUTES,
      waitingCount: lukeDecisionCount,
    },
    waiting: queue("Decisions for Luke", lukeDecisionCount, "/admin-decisions"),
  };
}

async function observeCeoBrief(): Promise<WorkerObservationResult> {
  const latest = await getLatestCeoBrief();
  const emailFailed = Boolean(latest?.emailSendLastError && !latest?.emailSentAt);
  return {
    observation: {
      enabled: true,
      latestRun: latest
        ? {
            startedAt: null,
            finishedAt: latest.generatedAt,
            outcome: emailFailed ? "failed" : "ok",
          }
        : null,
      lastSuccessAt: latest?.generatedAt ?? null,
      staleAfterMinutes: 14 * DAY_MINUTES,
      waitingCount: 0,
    },
    flags: emailFailed ? ["Email send error"] : [],
  };
}

async function observeRetention(): Promise<WorkerObservationResult> {
  const readiness = getRetentionReadiness();
  const sql = getSql();
  const [latest, lastOk] = await Promise.all([
    getLatestRetentionJobRun(),
    scalarIso(sql`
      SELECT finished_at AS at FROM retention_job_runs
      WHERE ok = true ORDER BY id DESC LIMIT 1
    `),
  ]);
  return {
    observation: {
      enabled: readiness.autoSendEnabled,
      misconfigured:
        readiness.autoSendEnabled && !readiness.ready
          ? readiness.reasons.slice(0, 2).join("; ")
          : null,
      latestRun: latest
        ? { startedAt: null, finishedAt: latest.finishedAt, outcome: okFlag(latest.ok) }
        : null,
      lastSuccessAt: lastOk,
      staleAfterMinutes: 2 * DAY_MINUTES + 60,
      waitingCount: 0,
    },
    testMode: isRetentionTestMode(),
    flags: readiness.autoSendEnabled ? [] : ["RETENTION_AUTO_SEND_ENABLED is not true"],
  };
}

async function observeDataSync(): Promise<WorkerObservationResult> {
  const sql = getSql();
  const paid = await getAllPaidProviderStatuses().catch(() => []);
  const gscConfigured = Boolean(process.env.GOOGLE_SEARCH_CONSOLE_PROPERTY?.trim());
  const configured = gscConfigured || paid.some((p) => p.state !== "not_configured");
  const [latestRows, lastOk] = await Promise.all([
    sql`
      SELECT started_at, completed_at, status FROM external_metric_sync_runs
      WHERE status <> 'not_configured'
      ORDER BY id DESC LIMIT 1
    `.then((rows) => rows as RunRow[]),
    scalarIso(sql`
      SELECT completed_at AS at FROM external_metric_sync_runs
      WHERE status = 'ok' ORDER BY id DESC LIMIT 1
    `),
  ]);
  const latest = latestRows[0];
  return {
    observation: {
      enabled: configured,
      latestRun: latest
        ? {
            startedAt: toIsoOrNull(latest.started_at),
            finishedAt: toIsoOrNull(latest.completed_at),
            outcome: runStatusToOutcome(latest.status),
          }
        : null,
      lastSuccessAt: lastOk,
      staleAfterMinutes: 2 * DAY_MINUTES + 60,
      waitingCount: 0,
    },
    flags: [
      gscConfigured ? "Search Console configured" : "Search Console not configured",
      ...paid.map((p) => `${p.provider}: ${p.state.replace("_", " ")}`),
    ],
  };
}

export function buildWorkerCard(
  worker: MissionControlWorker,
  WorkerObservationResult: WorkerObservationResult | null,
  now: Date
): WorkerCard {
  const def = DEFINITIONS[worker];
  const next = nextRunForWorker(worker, now);
  const observation: WorkerObservation = WorkerObservationResult
    ? { ...WorkerObservationResult.observation, coverage: def.coverage, now }
    : {
        enabled: true,
        coverage: def.coverage,
        latestRun: null,
        lastSuccessAt: null,
        staleAfterMinutes: null,
        waitingCount: 0,
        observationFailed: true,
        now,
      };
  const { status, detail } = deriveWorkerStatus(observation);
  const run = observation.latestRun;
  return {
    worker,
    label: def.label,
    status,
    detail,
    coverage: def.coverage,
    coverageNote: def.coverageNote,
    lastRunAt: run ? (run.finishedAt ?? run.startedAt) : null,
    lastSuccessAt: observation.lastSuccessAt,
    lastActivityAt: observation.lastActivityAt ?? null,
    nextRunAt: status === "disabled" ? null : (next?.at ?? null),
    schedule: next ? `${next.job.schedule} UTC` : null,
    testMode: WorkerObservationResult?.testMode ?? false,
    flags: WorkerObservationResult?.flags ?? [],
    waiting: WorkerObservationResult?.waiting ?? [],
    blocked: WorkerObservationResult?.blocked ?? [],
    href: def.href,
  };
}

export async function collectWorkerCards(input: {
  exceptions: OpsException[];
  lukeDecisionCount: number;
  now?: Date;
}): Promise<WorkerCard[]> {
  const now = input.now ?? new Date();
  const { exceptions } = input;
  const observers: Array<[MissionControlWorker, () => Promise<WorkerObservationResult>]> = [
    ["support", () => observeSupport(exceptions)],
    ["finance", () => observeFinance(exceptions)],
    ["inventory", () => observeInventory(exceptions)],
    ["fulfillment", () => observeFulfillment()],
    ["discord", () => observeDiscord()],
    ["authority", () => observeAuthority(exceptions)],
    ["customer_intelligence", () => observeCustomerIntel()],
    ["decision_engine", () => observeDecisionEngine(input.lukeDecisionCount)],
    ["ceo_brief", () => observeCeoBrief()],
    ["retention", () => observeRetention()],
    ["data_sync", () => observeDataSync()],
  ];
  const results = await Promise.all(
    observers.map(async ([worker, observe]) => {
      try {
        return buildWorkerCard(worker, await observe(), now);
      } catch (error) {
        console.error(
          `[mission-control] worker ${worker} observation failed:`,
          error instanceof Error ? error.message : error
        );
        return buildWorkerCard(worker, null, now);
      }
    })
  );
  return results;
}
