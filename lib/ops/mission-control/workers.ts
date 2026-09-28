/**
 * Worker cards. Every query here is a plain SELECT against existing tables —
 * no business-module getters (they run `ensure*Schema()` DDL) and no writes,
 * so opening Mission Control can never create or alter schema.
 */
import { getSql } from "@/lib/db/sql";
import { getBtcpostagePublicConfig } from "@/lib/btcpostage/config";
import { fetchLatestLegitimateCustomerIntelSnapshot } from "@/lib/customer-intelligence/snapshot-validity";
import { isLukeOwnerAttention } from "@/lib/decision-engine/owner-count";
import { getDiscordAdminStatusSafe } from "@/lib/discord/config";
import {
  getRetentionReadiness,
  isRetentionTestMode,
} from "@/lib/retention/config";
import {
  SUPPORT_INBOX_LEASE_STALE_MINUTES,
  isSupportAutoSendEnabled,
  isSupportTestMode,
} from "@/lib/support/constants";
import { getSupportExpectedPollMinutes } from "@/lib/support/store";

import { supportEscalationEligible } from "../exceptions";
import { toIsoOrNull } from "./events";
import { describeSourceError } from "./projectors";
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
  observationError?: string | null;
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
    return {
      status: "unknown",
      detail: o.observationError
        ? `${o.observationError} — not assumed healthy`
        : "Status query failed — not assumed healthy",
    };
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
    coverageNote:
      "Only successful monitor snapshots are stored; failed runs are not logged (staleness only). Reorder reviews appear under Incidents.",
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
    coverageNote:
      "Admin-driven; no job-run log. Activity shown from opportunity/brief timestamps; waiting briefs appear under Incidents.",
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

function queue(label: string, count: number, href: string): WorkerQueueItem[] {
  return count > 0 ? [{ label, count, href }] : [];
}

function runStatusToOutcome(status: string | null | undefined): LatestRunObservation["outcome"] {
  if (status === "running") return "running";
  if (status === "ok") return "ok";
  if (status === "error") return "failed";
  return "unknown";
}

function okFlag(ok: unknown): LatestRunObservation["outcome"] {
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

type Row = Record<string, unknown>;
type SqlClient = ReturnType<typeof getSql>;

async function select(query: Promise<unknown>): Promise<Row[]> {
  return ((await query) as Row[] | undefined) ?? [];
}

async function scalarIso(query: Promise<unknown>): Promise<string | null> {
  const rows = await select(query);
  return toIsoOrNull(rows[0]?.at);
}

async function scalarCount(query: Promise<unknown>): Promise<number> {
  const rows = await select(query);
  const n = Number(rows[0]?.n ?? 0);
  return Number.isFinite(n) ? n : 0;
}

async function observeSupport(sql: SqlClient): Promise<WorkerObservationResult> {
  const [latestRows, lastOk, lease, openEscalations] = await Promise.all([
    select(sql`SELECT ok, finished_at FROM support_job_runs ORDER BY id DESC LIMIT 1`),
    scalarIso(sql`
      SELECT finished_at AS at FROM support_job_runs
      WHERE ok = true AND finished_at IS NOT NULL
      ORDER BY finished_at DESC LIMIT 1
    `),
    select(sql`
      SELECT claimed_at FROM support_inbox_lease
      WHERE id = 1 AND claimed_at IS NOT NULL
        AND claimed_at > now() - (${SUPPORT_INBOX_LEASE_STALE_MINUTES}::int * interval '1 minute')
    `),
    select(sql`
      SELECT m.reporting_excluded, m.status AS msg_status, c.category
      FROM support_escalations e
      JOIN support_messages m ON m.id = e.message_id
      LEFT JOIN support_classifications c ON c.message_id = m.id
      WHERE e.resolved_at IS NULL
      LIMIT 200
    `),
  ]);
  const latest = latestRows[0];
  const escalations = openEscalations.filter((r) =>
    supportEscalationEligible({
      reportingExcluded: Boolean(r.reporting_excluded),
      category: r.category ? String(r.category) : null,
      status: r.msg_status ? String(r.msg_status) : null,
    })
  ).length;
  const autoSend = isSupportAutoSendEnabled();
  return {
    observation: {
      enabled: true,
      latestRun: latest
        ? { startedAt: null, finishedAt: toIsoOrNull(latest.finished_at), outcome: okFlag(latest.ok) }
        : null,
      lastSuccessAt: lastOk,
      staleAfterMinutes: getSupportExpectedPollMinutes() * 2,
      leaseHeld: lease.length > 0,
      waitingCount: escalations,
    },
    testMode: isSupportTestMode(),
    flags: [autoSend ? "Auto-send on (eligible contact-form GREEN only)" : "Auto-send off"],
    waiting: queue("Open support escalations", escalations, "/admin-support"),
  };
}

async function observeFinance(sql: SqlClient): Promise<WorkerObservationResult> {
  const [latestRows, lastOk, warnings] = await Promise.all([
    select(sql`
      SELECT started_at, finished_at, status FROM finance_job_runs
      WHERE job_name = 'finance_reconciliation'
      ORDER BY started_at DESC LIMIT 1
    `),
    scalarIso(sql`
      SELECT finished_at AS at FROM finance_job_runs
      WHERE job_name = 'finance_reconciliation' AND status = 'ok'
      ORDER BY started_at DESC LIMIT 1
    `),
    scalarCount(sql`
      SELECT COUNT(*)::int AS n FROM finance_reconciliation_warnings WHERE status = 'open'
    `),
  ]);
  const latest = latestRows[0];
  return {
    observation: {
      enabled: true,
      latestRun: latest
        ? {
            startedAt: toIsoOrNull(latest.started_at),
            finishedAt: toIsoOrNull(latest.finished_at),
            outcome: runStatusToOutcome(latest.status as string | null),
          }
        : null,
      lastSuccessAt: lastOk,
      staleAfterMinutes: 2 * DAY_MINUTES + 60,
      waitingCount: warnings,
    },
    waiting: queue("Open reconciliation warnings", warnings, "/admin-finance"),
  };
}

async function observeInventory(sql: SqlClient): Promise<WorkerObservationResult> {
  const [lastOk, awaitingTesting] = await Promise.all([
    scalarIso(sql`SELECT MAX(created_at) AS at FROM inventory_monitor_snapshots`),
    scalarCount(sql`
      SELECT COUNT(*)::int AS n FROM inventory_pipeline_lots
      WHERE status = 'received_awaiting_testing'
    `),
  ]);
  return {
    observation: {
      enabled: true,
      latestRun: lastOk ? { startedAt: null, finishedAt: lastOk, outcome: "ok" } : null,
      lastSuccessAt: lastOk,
      // Matches the ops exception threshold (2.5 days).
      staleAfterMinutes: 2.5 * DAY_MINUTES,
      waitingCount: awaitingTesting,
    },
    waiting: queue("Lots awaiting testing release", awaitingTesting, "/admin-inventory"),
  };
}

/** Bucket counts mirror `collectFulfillmentBoard` (eligible paid orders, workflow status, open reconciliation blockers). */
async function observeFulfillment(sql: SqlClient): Promise<WorkerObservationResult> {
  const [bucketRows, lastActivity] = await Promise.all([
    select(sql`
      WITH eligible AS (
        SELECT o.order_id
        FROM orders o
        WHERE o.status = 'paid'
          AND (o.tracking_number IS NULL OR trim(o.tracking_number) = '')
          AND NOT EXISTS (
            SELECT 1 FROM finance_transactions ft
            WHERE ft.psl_order_id = o.order_id AND ft.reporting_excluded = true
          )
        ORDER BY o.paid_at ASC NULLS LAST, o.created_at ASC
        LIMIT 150
      ),
      classified AS (
        SELECT
          CASE
            WHEN EXISTS (
              SELECT 1 FROM finance_reconciliation_warnings w
              WHERE w.status = 'open' AND w.psl_order_id = e.order_id
            ) AND COALESCE(wf.workflow_status, 'ready') <> 'packed' THEN 'hold'
            WHEN wf.workflow_status = 'hold' THEN 'hold'
            WHEN wf.workflow_status = 'packed' THEN 'packed'
            ELSE 'ready'
          END AS bucket
        FROM eligible e
        LEFT JOIN fulfillment_workflow wf ON wf.order_id = e.order_id
      )
      SELECT
        COUNT(*) FILTER (WHERE bucket = 'ready')::int AS ready,
        COUNT(*) FILTER (WHERE bucket = 'packed')::int AS packed,
        COUNT(*) FILTER (WHERE bucket = 'hold')::int AS hold
      FROM classified
    `),
    scalarIso(sql`SELECT MAX(updated_at) AS at FROM fulfillment_workflow`),
  ]);
  const b = bucketRows[0] ?? {};
  const ready = Number(b.ready ?? 0);
  const packed = Number(b.packed ?? 0);
  const hold = Number(b.hold ?? 0);
  const btcp = getBtcpostagePublicConfig();
  return {
    observation: {
      enabled: true,
      latestRun: null,
      lastSuccessAt: null,
      lastActivityAt: lastActivity,
      staleAfterMinutes: null,
      waitingCount: ready + packed + hold,
    },
    testMode: btcp.testMode,
    flags: [btcp.configured ? "BTCPostage configured" : "BTCPostage not configured"],
    waiting: [
      ...queue("Ready to pack", ready, "/admin-fulfillment"),
      ...queue("Packed awaiting tracking", packed, "/admin-fulfillment"),
    ],
    blocked: queue("Orders on hold", hold, "/admin-fulfillment"),
  };
}

async function observeDiscord(sql: SqlClient): Promise<WorkerObservationResult> {
  const status = getDiscordAdminStatusSafe();
  const lastActivity = status.enabled
    ? await scalarIso(sql`SELECT MAX(created_at) AS at FROM discord_interactions`)
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

async function observeAuthority(sql: SqlClient): Promise<WorkerObservationResult> {
  const lastActivity = await scalarIso(
    sql`SELECT MAX(updated_at) AS at FROM authority_opportunities`
  );
  return {
    observation: {
      enabled: true,
      latestRun: null,
      lastSuccessAt: null,
      lastActivityAt: lastActivity,
      staleAfterMinutes: null,
      waitingCount: 0,
    },
  };
}

async function observeCustomerIntel(sql: SqlClient): Promise<WorkerObservationResult> {
  const latest = await fetchLatestLegitimateCustomerIntelSnapshot(sql);
  const generatedAt = latest?.generatedAt ?? null;
  return {
    observation: {
      enabled: true,
      latestRun: generatedAt
        ? { startedAt: null, finishedAt: generatedAt, outcome: "ok" }
        : null,
      lastSuccessAt: generatedAt,
      // Matches the readiness matrix (>10 days = attention).
      staleAfterMinutes: 10 * DAY_MINUTES,
      waitingCount: 0,
    },
  };
}

async function observeDecisionEngine(sql: SqlClient): Promise<WorkerObservationResult> {
  const [latestRows, lastOk, activeOwners] = await Promise.all([
    select(sql`
      SELECT started_at, completed_at, status FROM decision_engine_runs
      ORDER BY id DESC LIMIT 1
    `),
    scalarIso(sql`
      SELECT completed_at AS at FROM decision_engine_runs
      WHERE status = 'ok' ORDER BY id DESC LIMIT 1
    `),
    select(sql`
      SELECT recommended_owner FROM decision_signals WHERE status = 'active'
    `),
  ]);
  const latest = latestRows[0];
  const lukeDecisions = activeOwners.filter((r) =>
    isLukeOwnerAttention(String(r.recommended_owner ?? ""))
  ).length;
  return {
    observation: {
      enabled: true,
      latestRun: latest
        ? {
            startedAt: toIsoOrNull(latest.started_at),
            finishedAt: toIsoOrNull(latest.completed_at),
            outcome: runStatusToOutcome(latest.status as string | null),
          }
        : null,
      lastSuccessAt: lastOk,
      // Matches the readiness matrix (>2 days = attention).
      staleAfterMinutes: 2 * DAY_MINUTES,
      waitingCount: lukeDecisions,
    },
    waiting: queue("Decisions for Luke", lukeDecisions, "/admin-decisions"),
  };
}

async function observeCeoBrief(sql: SqlClient): Promise<WorkerObservationResult> {
  const rows = await select(sql`
    SELECT generated_at, email_sent_at, email_send_last_error
    FROM ceo_weekly_briefs
    ORDER BY period_end DESC, generated_at DESC
    LIMIT 1
  `);
  const latest = rows[0];
  const generatedAt = toIsoOrNull(latest?.generated_at);
  const emailFailed = Boolean(latest?.email_send_last_error && !latest?.email_sent_at);
  return {
    observation: {
      enabled: true,
      latestRun: generatedAt
        ? { startedAt: null, finishedAt: generatedAt, outcome: emailFailed ? "failed" : "ok" }
        : null,
      lastSuccessAt: generatedAt,
      staleAfterMinutes: 14 * DAY_MINUTES,
      waitingCount: 0,
    },
    flags: emailFailed ? ["Email send error"] : [],
  };
}

async function observeRetention(sql: SqlClient): Promise<WorkerObservationResult> {
  const readiness = getRetentionReadiness();
  const [latestRows, lastOk] = await Promise.all([
    select(sql`SELECT finished_at, ok FROM retention_job_runs ORDER BY id DESC LIMIT 1`),
    scalarIso(sql`
      SELECT finished_at AS at FROM retention_job_runs
      WHERE ok = true ORDER BY id DESC LIMIT 1
    `),
  ]);
  const latest = latestRows[0];
  return {
    observation: {
      enabled: readiness.autoSendEnabled,
      misconfigured:
        readiness.autoSendEnabled && !readiness.ready
          ? readiness.reasons.slice(0, 2).join("; ")
          : null,
      latestRun: latest
        ? { startedAt: null, finishedAt: toIsoOrNull(latest.finished_at), outcome: okFlag(latest.ok) }
        : null,
      lastSuccessAt: lastOk,
      staleAfterMinutes: 2 * DAY_MINUTES + 60,
      waitingCount: 0,
    },
    testMode: isRetentionTestMode(),
    flags: readiness.autoSendEnabled ? [] : ["RETENTION_AUTO_SEND_ENABLED is not true"],
  };
}

async function observeDataSync(sql: SqlClient): Promise<WorkerObservationResult> {
  const [latestByProvider, lastOk] = await Promise.all([
    select(sql`
      SELECT DISTINCT ON (provider) provider, status, started_at, completed_at, id
      FROM external_metric_sync_runs
      ORDER BY provider, id DESC
    `),
    scalarIso(sql`
      SELECT completed_at AS at FROM external_metric_sync_runs
      WHERE status = 'ok' ORDER BY id DESC LIMIT 1
    `),
  ]);
  const gscConfigured = Boolean(process.env.GOOGLE_SEARCH_CONSOLE_PROPERTY?.trim());
  const active = latestByProvider
    .filter((r) => r.status !== "not_configured")
    .sort((a, b) => Number(b.id) - Number(a.id));
  const latest = active[0];
  return {
    observation: {
      enabled: gscConfigured || active.length > 0,
      latestRun: latest
        ? {
            startedAt: toIsoOrNull(latest.started_at),
            finishedAt: toIsoOrNull(latest.completed_at),
            outcome: runStatusToOutcome(latest.status as string | null),
          }
        : null,
      lastSuccessAt: lastOk,
      staleAfterMinutes: 2 * DAY_MINUTES + 60,
      waitingCount: 0,
    },
    flags: [
      gscConfigured ? "Search Console configured" : "Search Console not configured",
      ...latestByProvider.map(
        (r) => `${String(r.provider)}: last run ${String(r.status).replace("_", " ")}`
      ),
    ],
  };
}

export function buildWorkerCard(
  worker: MissionControlWorker,
  partial: WorkerObservationResult | null,
  now: Date,
  observationError?: string | null
): WorkerCard {
  const def = DEFINITIONS[worker];
  const next = nextRunForWorker(worker, now);
  const observation: WorkerObservation = partial
    ? { ...partial.observation, coverage: def.coverage, now }
    : {
        enabled: true,
        coverage: def.coverage,
        latestRun: null,
        lastSuccessAt: null,
        staleAfterMinutes: null,
        waitingCount: 0,
        observationFailed: true,
        observationError: observationError ?? null,
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
    testMode: partial?.testMode ?? false,
    flags: partial?.flags ?? [],
    waiting: partial?.waiting ?? [],
    blocked: partial?.blocked ?? [],
    href: def.href,
  };
}

export async function collectWorkerCards(input?: { now?: Date }): Promise<WorkerCard[]> {
  const now = input?.now ?? new Date();
  const sql = getSql();
  const observers: Array<[MissionControlWorker, (s: SqlClient) => Promise<WorkerObservationResult>]> = [
    ["support", observeSupport],
    ["finance", observeFinance],
    ["inventory", observeInventory],
    ["fulfillment", observeFulfillment],
    ["discord", observeDiscord],
    ["authority", observeAuthority],
    ["customer_intelligence", observeCustomerIntel],
    ["decision_engine", observeDecisionEngine],
    ["ceo_brief", observeCeoBrief],
    ["retention", observeRetention],
    ["data_sync", observeDataSync],
  ];
  return Promise.all(
    observers.map(async ([worker, observe]) => {
      try {
        return buildWorkerCard(worker, await observe(sql), now);
      } catch (error) {
        const detail = describeSourceError(error);
        console.error(`[mission-control] worker ${worker} observation failed:`, detail);
        return buildWorkerCard(worker, null, now, detail);
      }
    })
  );
}
