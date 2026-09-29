/**
 * Projects existing job-run and workflow records into `ops_activity_events`.
 *
 * Mappers are pure and deterministic: the same source row always yields the
 * same `sourceEventKey`, so re-running a sync never duplicates events. Source
 * tables are only read — business schemas are never created or altered here.
 */
import { getSql } from "@/lib/db/sql";
import {
  customerIntelSnapshotExclusion,
  type CustomerIntelSnapshotRecord,
} from "@/lib/customer-intelligence/snapshot-validity";

import { getMissionControlWriteMode } from "./config";
import { insertActivityEvents, toIsoOrNull } from "./events";
import type {
  ActivityEventInput,
  ActivityOutcome,
  ActivitySyncState,
  MissionControlWorker,
} from "./types";

type Row = Record<string, unknown>;

export const ACTIVITY_SYNC_MIN_INTERVAL_SECONDS = 60;
const SOURCE_ROW_LIMIT = 100;
const CLAIM_SOURCE = "__claim";

function num(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function str(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s ? s : null;
}

function dateOnly(value: unknown): string | null {
  const iso = toIsoOrNull(value);
  return iso ? iso.slice(0, 10) : null;
}

function runStatusOutcome(status: string | null): ActivityOutcome {
  switch (status) {
    case "ok":
      return "completed";
    case "error":
      return "failed";
    case "not_configured":
      return "skipped";
    default:
      return "outcome_unknown";
  }
}

function okFlagOutcome(ok: unknown): ActivityOutcome {
  if (ok === true) return "completed";
  if (ok === false) return "failed";
  return "outcome_unknown";
}

/** Rows written at start (status 'running') and updated at finish. */
function mapStartFinishRun(input: {
  table: string;
  row: Row;
  worker: MissionControlWorker;
  eventType: string;
  label: string;
  href: string;
  finishedAtColumn: string;
  errorColumn: string;
  describe: (row: Row) => string;
}): ActivityEventInput[] {
  const { row } = input;
  const id = str(row.id);
  if (!id) return [];
  const correlationId = `${input.table}:${id}`;
  const out: ActivityEventInput[] = [];
  const startedAt = toIsoOrNull(row.started_at);
  if (startedAt) {
    out.push({
      sourceEventKey: `${input.table}:${id}:started`,
      correlationId,
      sourceSystem: input.table,
      worker: input.worker,
      eventType: `${input.eventType}_started`,
      outcome: "started",
      observation: "run_log",
      occurredAt: startedAt,
      summary: `${input.label} started`,
      sourceRef: `${input.table}#${id}`,
      sourceHref: input.href,
    });
  }
  const status = str(row.status);
  const finishedAt = toIsoOrNull(row[input.finishedAtColumn]);
  if (finishedAt && status !== "running") {
    const outcome = runStatusOutcome(status);
    const err = str(row[input.errorColumn]);
    const detail = input.describe(row);
    out.push({
      sourceEventKey: `${input.table}:${id}:finished`,
      correlationId,
      sourceSystem: input.table,
      worker: input.worker,
      eventType: `${input.eventType}_finished`,
      outcome,
      observation: "run_log",
      occurredAt: finishedAt,
      summary:
        outcome === "failed" && err
          ? `${input.label} failed — ${err}`
          : `${input.label} ${outcome === "completed" ? "completed" : outcome.replace("_", " ")}${detail ? `: ${detail}` : ""}`,
      sourceRef: `${input.table}#${id}`,
      sourceHref: input.href,
    });
  }
  return out;
}

export function mapSupportJobRun(row: Row): ActivityEventInput[] {
  const id = str(row.id);
  const occurredAt = toIsoOrNull(row.finished_at);
  if (!id || !occurredAt) return [];
  const outcome = okFlagOutcome(row.ok);
  const counts = `${num(row.messages_checked)} checked · ${num(row.new_messages)} new · ${num(row.auto_sent)} auto-sent · ${num(row.escalated)} escalated · ${num(row.failed)} failed · ${num(row.skipped)} skipped`;
  const err = str(row.error_summary);
  return [
    {
      sourceEventKey: `support_job_runs:${id}:finished`,
      correlationId: `support_job_runs:${id}`,
      sourceSystem: "support_job_runs",
      worker: "support",
      eventType: "inbox_run_finished",
      outcome,
      observation: "run_log",
      occurredAt,
      summary:
        outcome === "failed" && err
          ? `Support inbox run failed — ${err}`
          : `Support inbox run: ${counts}`,
      sourceRef: `support_job_runs#${id}`,
      sourceHref: "/admin-support",
    },
  ];
}

export function mapSupportEscalation(row: Row): ActivityEventInput[] {
  const id = str(row.id);
  if (!id) return [];
  const risk = str(row.risk_level) ?? "Support";
  const excluded = Boolean(row.reporting_excluded);
  const out: ActivityEventInput[] = [];
  const createdAt = toIsoOrNull(row.created_at);
  if (createdAt) {
    out.push({
      sourceEventKey: `support_escalations:${id}:opened`,
      correlationId: `support_escalations:${id}`,
      sourceSystem: "support_escalations",
      worker: "support",
      eventType: "escalation_opened",
      outcome: "waiting",
      observation: "record_timestamp",
      occurredAt: createdAt,
      summary: `${risk} escalation opened — awaiting human review`,
      sourceRef: `support_escalations#${id}`,
      sourceHref: "/admin-support",
      excluded,
    });
  }
  const resolvedAt = toIsoOrNull(row.resolved_at);
  if (resolvedAt) {
    out.push({
      sourceEventKey: `support_escalations:${id}:resolved`,
      correlationId: `support_escalations:${id}`,
      sourceSystem: "support_escalations",
      worker: "support",
      eventType: "escalation_resolved",
      outcome: "completed",
      observation: "record_timestamp",
      occurredAt: resolvedAt,
      summary: `${risk} escalation resolved`,
      sourceRef: `support_escalations#${id}`,
      sourceHref: "/admin-support",
      excluded,
    });
  }
  return out;
}

export function mapFinanceJobRun(row: Row): ActivityEventInput[] {
  const job = str(row.job_name) ?? "finance job";
  return mapStartFinishRun({
    table: "finance_job_runs",
    row,
    worker: "finance",
    eventType: job,
    label: job === "finance_reconciliation" ? "Finance reconciliation" : job,
    href: "/admin-finance",
    finishedAtColumn: "finished_at",
    errorColumn: "error",
    describe: () => "",
  });
}

export function mapDecisionEngineRun(row: Row): ActivityEventInput[] {
  return mapStartFinishRun({
    table: "decision_engine_runs",
    row,
    worker: "decision_engine",
    eventType: "decision_run",
    label: "Decision engine run",
    href: "/admin-decisions",
    finishedAtColumn: "completed_at",
    errorColumn: "error_summary",
    describe: (r) =>
      `${num(r.signals_created)} signals created · ${num(r.signals_resolved)} resolved`,
  });
}

export function mapExternalMetricSyncRun(row: Row): ActivityEventInput[] {
  const provider = str(row.provider) ?? "external";
  return mapStartFinishRun({
    table: "external_metric_sync_runs",
    row,
    worker: "data_sync",
    eventType: `${provider}_sync`,
    label: `${provider} sync`,
    href: provider === "search_console" ? "/admin-data" : "/admin-acquisition",
    finishedAtColumn: "completed_at",
    errorColumn: "error_summary",
    describe: (r) =>
      `${num(r.records_received)} received · ${num(r.records_written)} written`,
  });
}

export function mapRetentionJobRun(row: Row): ActivityEventInput[] {
  const id = str(row.id);
  const occurredAt = toIsoOrNull(row.finished_at);
  if (!id || !occurredAt) return [];
  const outcome = okFlagOutcome(row.ok);
  const err = str(row.error_summary);
  return [
    {
      sourceEventKey: `retention_job_runs:${id}:finished`,
      correlationId: `retention_job_runs:${id}`,
      sourceSystem: "retention_job_runs",
      worker: "retention",
      eventType: "retention_run_finished",
      outcome,
      observation: "run_log",
      occurredAt,
      summary:
        outcome === "failed" && err
          ? `Retention run failed — ${err}`
          : `Retention run: ${num(row.candidates)} candidates · ${num(row.sent)} sent · ${num(row.skipped)} skipped · ${num(row.failed)} failed`,
      sourceRef: `retention_job_runs#${id}`,
      sourceHref: "/admin-retention",
    },
  ];
}

export function mapDecisionSignal(row: Row): ActivityEventInput[] {
  const key = str(row.signal_key);
  if (!key) return [];
  const title = str(row.title) ?? "Decision signal";
  const priority = str(row.priority) ?? "";
  const area = str(row.area) ?? "";
  const href = str(row.source_href) ?? "/admin-decisions";
  const correlationId = `decision_signals:${key}`;
  const out: ActivityEventInput[] = [];
  const detected = toIsoOrNull(row.first_detected_at);
  if (detected) {
    const forLuke = str(row.recommended_owner) === "luke";
    out.push({
      sourceEventKey: `decision_signals:${key}:detected:${detected}`,
      correlationId,
      sourceSystem: "decision_signals",
      worker: "decision_engine",
      eventType: "signal_raised",
      outcome: forLuke ? "waiting" : "completed",
      observation: "record_timestamp",
      occurredAt: detected,
      summary: `${priority} ${area}: ${title}`.trim(),
      sourceRef: `decision_signals#${key}`,
      sourceHref: href,
    });
  }
  for (const [col, type, verb] of [
    ["resolved_at", "signal_resolved", "resolved"],
    ["dismissed_at", "signal_dismissed", "dismissed"],
  ] as const) {
    const at = toIsoOrNull(row[col]);
    if (!at) continue;
    out.push({
      sourceEventKey: `decision_signals:${key}:${verb}:${at}`,
      correlationId,
      sourceSystem: "decision_signals",
      worker: "decision_engine",
      eventType: type,
      outcome: "completed",
      observation: "record_timestamp",
      occurredAt: at,
      summary: `Signal ${verb}: ${title}`,
      sourceRef: `decision_signals#${key}`,
      sourceHref: href,
    });
  }
  return out;
}

export function mapCeoBrief(row: Row): ActivityEventInput[] {
  const id = str(row.id);
  if (!id) return [];
  const period = `${dateOnly(row.period_start) ?? "?"} → ${dateOnly(row.period_end) ?? "?"}`;
  const out: ActivityEventInput[] = [];
  const generatedAt = toIsoOrNull(row.generated_at);
  if (generatedAt) {
    out.push({
      sourceEventKey: `ceo_weekly_briefs:${id}:generated`,
      correlationId: `ceo_weekly_briefs:${id}`,
      sourceSystem: "ceo_weekly_briefs",
      worker: "ceo_brief",
      eventType: "brief_generated",
      outcome: "completed",
      observation: "record_timestamp",
      occurredAt: generatedAt,
      summary: `Weekly CEO brief generated (${period})`,
      sourceRef: `ceo_weekly_briefs#${id}`,
      sourceHref: "/admin-ceo",
    });
  }
  const sentAt = toIsoOrNull(row.email_sent_at);
  if (sentAt) {
    out.push({
      sourceEventKey: `ceo_weekly_briefs:${id}:email_sent`,
      correlationId: `ceo_weekly_briefs:${id}`,
      sourceSystem: "ceo_weekly_briefs",
      worker: "ceo_brief",
      eventType: "brief_email_sent",
      outcome: "completed",
      observation: "record_timestamp",
      occurredAt: sentAt,
      summary: `CEO brief email sent (${period})`,
      sourceRef: `ceo_weekly_briefs#${id}`,
      sourceHref: "/admin-ceo",
    });
  }
  return out;
}

/** Row selected with `snapshot_json->'test'` / `->'reporting_excluded'` flag columns. */
export function customerIntelSnapshotRecord(row: Row): CustomerIntelSnapshotRecord {
  return {
    periodStart: row.period_start,
    periodEnd: row.period_end,
    generatedAt: row.generated_at,
    snapshot: { test: row.test_flag, reporting_excluded: row.excluded_flag },
  };
}

export function mapCustomerIntelSnapshot(row: Row): ActivityEventInput[] {
  const id = str(row.id);
  const generatedAt = toIsoOrNull(row.generated_at);
  if (!id || !generatedAt) return [];
  const exclusion = customerIntelSnapshotExclusion(customerIntelSnapshotRecord(row));
  return [
    {
      sourceEventKey: `customer_intelligence_snapshots:${id}:generated`,
      correlationId: `customer_intelligence_snapshots:${id}`,
      sourceSystem: "customer_intelligence_snapshots",
      worker: "customer_intelligence",
      eventType: "snapshot_generated",
      outcome: "completed",
      observation: "record_timestamp",
      occurredAt: generatedAt,
      summary: `Customer intelligence snapshot generated (${dateOnly(row.period_start) ?? "?"} → ${dateOnly(row.period_end) ?? "?"})`,
      sourceRef: `customer_intelligence_snapshots#${id}`,
      sourceHref: "/admin-customer-intelligence",
      excluded: exclusion !== null,
    },
  ];
}

/** One row per snapshot_date (grouped in SQL). */
export function mapInventorySnapshotDay(row: Row): ActivityEventInput[] {
  const day = str(row.snapshot_date);
  const occurredAt = toIsoOrNull(row.recorded_at);
  if (!day || !occurredAt) return [];
  return [
    {
      sourceEventKey: `inventory_monitor_snapshots:${day}`,
      correlationId: `inventory_monitor_snapshots:${day}`,
      sourceSystem: "inventory_monitor_snapshots",
      worker: "inventory",
      eventType: "monitor_snapshot",
      outcome: "completed",
      observation: "record_timestamp",
      occurredAt,
      summary: `Inventory monitor snapshot for ${day}: ${num(row.sku_count)} SKU(s)`,
      sourceRef: `inventory_monitor_snapshots@${day}`,
      sourceHref: "/admin-inventory",
    },
  ];
}

export function mapDiscordInteraction(row: Row): ActivityEventInput[] {
  const id = str(row.id);
  const occurredAt = toIsoOrNull(row.created_at);
  if (!id || !occurredAt) return [];
  const command = str(row.command) ?? "command";
  const result = str(row.outcome) ?? "unknown";
  const category = str(row.category);
  return [
    {
      sourceEventKey: `discord_interactions:${id}`,
      sourceSystem: "discord_interactions",
      worker: "discord",
      eventType: "interaction",
      outcome: result === "unknown" ? "outcome_unknown" : "completed",
      observation: "record_timestamp",
      occurredAt,
      summary: `/${command} → ${result}${category ? ` (${category})` : ""}`,
      sourceRef: `discord_interactions#${id}`,
      sourceHref: "/admin-discord",
      excluded: Boolean(row.reporting_excluded),
    },
  ];
}

export function mapFulfillmentWorkflow(row: Row): ActivityEventInput[] {
  const orderId = str(row.order_id);
  if (!orderId) return [];
  const correlationId = `order:${orderId}`;
  const out: ActivityEventInput[] = [];
  const packingAt = toIsoOrNull(row.packing_started_at);
  if (packingAt) {
    out.push({
      sourceEventKey: `fulfillment_workflow:${orderId}:packing_started:${packingAt}`,
      correlationId,
      sourceSystem: "fulfillment_workflow",
      worker: "fulfillment",
      eventType: "packing_started",
      outcome: "started",
      observation: "record_timestamp",
      occurredAt: packingAt,
      summary: "Packing started",
      sourceRef: `order ${orderId}`,
      sourceHref: "/admin-fulfillment",
    });
  }
  const packedAt = toIsoOrNull(row.packed_at);
  if (packedAt) {
    out.push({
      sourceEventKey: `fulfillment_workflow:${orderId}:packed:${packedAt}`,
      correlationId,
      sourceSystem: "fulfillment_workflow",
      worker: "fulfillment",
      eventType: "packed",
      outcome: "completed",
      observation: "record_timestamp",
      occurredAt: packedAt,
      summary: "Order packed — awaiting tracking",
      sourceRef: `order ${orderId}`,
      sourceHref: "/admin-fulfillment",
    });
  }
  const updatedAt = toIsoOrNull(row.updated_at);
  if (str(row.workflow_status) === "hold" && updatedAt) {
    out.push({
      sourceEventKey: `fulfillment_workflow:${orderId}:hold:${updatedAt}`,
      correlationId,
      sourceSystem: "fulfillment_workflow",
      worker: "fulfillment",
      eventType: "hold",
      outcome: "waiting",
      observation: "record_timestamp",
      occurredAt: updatedAt,
      summary: "Order placed on fulfillment hold",
      sourceRef: `order ${orderId}`,
      sourceHref: "/admin-fulfillment",
    });
  }
  return out;
}

export function mapOrderShipped(row: Row): ActivityEventInput[] {
  const orderId = str(row.order_id);
  const shippedAt = toIsoOrNull(row.shipped_at);
  if (!orderId || !shippedAt) return [];
  const carrier = str(row.tracking_carrier);
  return [
    {
      sourceEventKey: `orders:${orderId}:shipped:${shippedAt}`,
      correlationId: `order:${orderId}`,
      sourceSystem: "orders",
      worker: "fulfillment",
      eventType: "shipped",
      outcome: "completed",
      observation: "record_timestamp",
      occurredAt: shippedAt,
      summary: `Order marked shipped${carrier ? ` (${carrier})` : ""}`,
      sourceRef: `order ${orderId}`,
      sourceHref: "/admin-fulfillment",
      excluded: Boolean(row.reporting_excluded),
    },
  ];
}

export function mapBtcpostageLabel(row: Row): ActivityEventInput[] {
  const orderId = str(row.psl_order_id);
  if (!orderId) return [];
  const test = Boolean(row.test_mode);
  const prefix = test ? "[test] " : "";
  const correlationId = `order:${orderId}`;
  const status = str(row.purchase_status);
  const out: ActivityEventInput[] = [];
  const purchasedAt = toIsoOrNull(row.purchased_at);
  if (purchasedAt) {
    const service = [str(row.carrier), str(row.service)].filter(Boolean).join(" ");
    out.push({
      sourceEventKey: `btcpostage_labels:${orderId}:purchased:${purchasedAt}`,
      correlationId,
      sourceSystem: "btcpostage_labels",
      worker: "fulfillment",
      eventType: "label_purchased",
      outcome: "completed",
      observation: "record_timestamp",
      occurredAt: purchasedAt,
      summary: `${prefix}Shipping label purchased${service ? ` (${service})` : ""}`,
      sourceRef: `order ${orderId}`,
      sourceHref: "/admin-fulfillment",
      excluded: test,
    });
  }
  const updatedAt = toIsoOrNull(row.updated_at);
  if (updatedAt && (status === "failed" || status === "needs_review")) {
    out.push({
      sourceEventKey: `btcpostage_labels:${orderId}:${status}:${updatedAt}`,
      correlationId,
      sourceSystem: "btcpostage_labels",
      worker: "fulfillment",
      eventType: `label_${status}`,
      outcome: status === "failed" ? "failed" : "outcome_unknown",
      observation: "record_timestamp",
      occurredAt: updatedAt,
      summary:
        status === "failed"
          ? `${prefix}Label purchase failed — review in fulfillment`
          : `${prefix}Label purchase outcome needs review — do not retry blindly`,
      sourceRef: `order ${orderId}`,
      sourceHref: "/admin-fulfillment",
      excluded: test,
    });
  }
  return out;
}

export function mapContentBrief(row: Row): ActivityEventInput[] {
  const id = str(row.id);
  if (!id) return [];
  const risk = str(row.risk_level) ?? "LOW";
  const review = Boolean(row.claims_review_required);
  const correlationId = `authority_opportunities:${str(row.opportunity_id) ?? "?"}`;
  const out: ActivityEventInput[] = [];
  const generatedAt = toIsoOrNull(row.generated_at);
  if (generatedAt) {
    out.push({
      sourceEventKey: `content_briefs:${id}:generated`,
      correlationId,
      parentTaskId: correlationId,
      sourceSystem: "content_briefs",
      worker: "authority",
      eventType: "brief_generated",
      outcome: review ? "waiting" : "completed",
      observation: "record_timestamp",
      occurredAt: generatedAt,
      summary: `Content brief generated (${risk} risk${review ? ", claims review required" : ""})`,
      sourceRef: `content_briefs#${id}`,
      sourceHref: "/admin-authority",
    });
  }
  const approvedAt = toIsoOrNull(row.approved_at);
  if (approvedAt) {
    out.push({
      sourceEventKey: `content_briefs:${id}:approved:${approvedAt}`,
      correlationId,
      parentTaskId: correlationId,
      sourceSystem: "content_briefs",
      worker: "authority",
      eventType: "brief_approved",
      outcome: "completed",
      observation: "record_timestamp",
      occurredAt: approvedAt,
      summary: "Content brief approved",
      sourceRef: `content_briefs#${id}`,
      sourceHref: "/admin-authority",
    });
  }
  return out;
}

export function mapAuthorityOpportunity(row: Row): ActivityEventInput[] {
  const id = str(row.id);
  if (!id) return [];
  const type = str(row.type) ?? "opportunity";
  const correlationId = `authority_opportunities:${id}`;
  const out: ActivityEventInput[] = [];
  for (const [col, verb] of [
    ["approved_at", "approved"],
    ["dismissed_at", "dismissed"],
  ] as const) {
    const at = toIsoOrNull(row[col]);
    if (!at) continue;
    out.push({
      sourceEventKey: `authority_opportunities:${id}:${verb}:${at}`,
      correlationId,
      sourceSystem: "authority_opportunities",
      worker: "authority",
      eventType: `opportunity_${verb}`,
      outcome: "completed",
      observation: "record_timestamp",
      occurredAt: at,
      summary: `Authority opportunity ${verb} (${type})`,
      sourceRef: `authority_opportunities#${id}`,
      sourceHref: "/admin-authority",
    });
  }
  return out;
}

type SqlClient = ReturnType<typeof getSql>;

type ActivitySource = {
  name: string;
  fetch: (sql: SqlClient) => Promise<Row[]>;
  map: (row: Row) => ActivityEventInput[];
};

const L = SOURCE_ROW_LIMIT;

export const ACTIVITY_SOURCES: ActivitySource[] = [
  {
    name: "support_job_runs",
    fetch: async (sql) =>
      (await sql`SELECT * FROM support_job_runs ORDER BY id DESC LIMIT ${L}`) as Row[],
    map: mapSupportJobRun,
  },
  {
    name: "support_escalations",
    fetch: async (sql) =>
      (await sql`
        SELECT e.id, e.risk_level, e.created_at, e.resolved_at, m.reporting_excluded
        FROM support_escalations e
        LEFT JOIN support_messages m ON m.id = e.message_id
        ORDER BY e.id DESC
        LIMIT ${L}
      `) as Row[],
    map: mapSupportEscalation,
  },
  {
    name: "finance_job_runs",
    fetch: async (sql) =>
      (await sql`SELECT id, job_name, started_at, finished_at, status, error FROM finance_job_runs ORDER BY id DESC LIMIT ${L}`) as Row[],
    map: mapFinanceJobRun,
  },
  {
    name: "decision_engine_runs",
    fetch: async (sql) =>
      (await sql`SELECT id, started_at, completed_at, status, signals_created, signals_resolved, error_summary FROM decision_engine_runs ORDER BY id DESC LIMIT ${L}`) as Row[],
    map: mapDecisionEngineRun,
  },
  {
    name: "decision_signals",
    fetch: async (sql) =>
      (await sql`
        SELECT signal_key, title, priority, area, source_href, recommended_owner,
          first_detected_at, resolved_at, dismissed_at
        FROM decision_signals
        ORDER BY updated_at DESC
        LIMIT ${L}
      `) as Row[],
    map: mapDecisionSignal,
  },
  {
    name: "retention_job_runs",
    fetch: async (sql) =>
      (await sql`SELECT * FROM retention_job_runs ORDER BY id DESC LIMIT ${L}`) as Row[],
    map: mapRetentionJobRun,
  },
  {
    name: "external_metric_sync_runs",
    fetch: async (sql) =>
      (await sql`SELECT id, provider, started_at, completed_at, status, records_received, records_written, error_summary FROM external_metric_sync_runs ORDER BY id DESC LIMIT ${L}`) as Row[],
    map: mapExternalMetricSyncRun,
  },
  {
    name: "ceo_weekly_briefs",
    fetch: async (sql) =>
      (await sql`SELECT id, period_start, period_end, generated_at, email_sent_at FROM ceo_weekly_briefs ORDER BY id DESC LIMIT ${L}`) as Row[],
    map: mapCeoBrief,
  },
  {
    name: "customer_intelligence_snapshots",
    fetch: async (sql) =>
      (await sql`
        SELECT id, period_start, period_end, generated_at,
          snapshot_json->'test' AS test_flag,
          snapshot_json->'reporting_excluded' AS excluded_flag
        FROM customer_intelligence_snapshots ORDER BY id DESC LIMIT ${L}
      `) as Row[],
    map: mapCustomerIntelSnapshot,
  },
  {
    name: "inventory_monitor_snapshots",
    fetch: async (sql) =>
      (await sql`
        SELECT snapshot_date::text AS snapshot_date,
          COUNT(*)::int AS sku_count,
          MAX(created_at) AS recorded_at
        FROM inventory_monitor_snapshots
        GROUP BY snapshot_date
        ORDER BY snapshot_date DESC
        LIMIT 30
      `) as Row[],
    map: mapInventorySnapshotDay,
  },
  {
    name: "discord_interactions",
    fetch: async (sql) =>
      (await sql`SELECT id, command, category, outcome, reporting_excluded, created_at FROM discord_interactions ORDER BY id DESC LIMIT ${L}`) as Row[],
    map: mapDiscordInteraction,
  },
  {
    name: "fulfillment_workflow",
    fetch: async (sql) =>
      (await sql`SELECT order_id, workflow_status, packing_started_at, packed_at, updated_at FROM fulfillment_workflow ORDER BY updated_at DESC LIMIT ${L}`) as Row[],
    map: mapFulfillmentWorkflow,
  },
  {
    name: "orders_shipped",
    fetch: async (sql) =>
      (await sql`
        SELECT o.order_id, o.shipped_at, o.tracking_carrier,
          EXISTS (
            SELECT 1 FROM finance_transactions ft
            WHERE ft.psl_order_id = o.order_id AND ft.reporting_excluded = true
          ) AS reporting_excluded
        FROM orders o
        WHERE o.shipped_at IS NOT NULL
        ORDER BY o.shipped_at DESC
        LIMIT ${L}
      `) as Row[],
    map: mapOrderShipped,
  },
  {
    name: "btcpostage_labels",
    fetch: async (sql) =>
      (await sql`SELECT psl_order_id, purchase_status, carrier, service, test_mode, purchased_at, updated_at FROM btcpostage_labels ORDER BY updated_at DESC LIMIT ${L}`) as Row[],
    map: mapBtcpostageLabel,
  },
  {
    name: "content_briefs",
    fetch: async (sql) =>
      (await sql`SELECT id, opportunity_id, risk_level, claims_review_required, generated_at, approved_at FROM content_briefs ORDER BY updated_at DESC LIMIT ${L}`) as Row[],
    map: mapContentBrief,
  },
  {
    name: "authority_opportunities",
    fetch: async (sql) =>
      (await sql`
        SELECT id, type, approved_at, dismissed_at
        FROM authority_opportunities
        WHERE approved_at IS NOT NULL OR dismissed_at IS NOT NULL
        ORDER BY updated_at DESC
        LIMIT ${L}
      `) as Row[],
    map: mapAuthorityOpportunity,
  },
];

export function describeSourceError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/relation .* does not exist/i.test(message)) {
    return "Source table not present in this database";
  }
  if (/column .* does not exist/i.test(message)) {
    return "Source table is missing an expected column (migration pending?)";
  }
  return message.slice(0, 200);
}

/** Atomic throttle so concurrent tabs/instances project at most once per interval. */
export async function claimActivitySync(
  minIntervalSeconds = ACTIVITY_SYNC_MIN_INTERVAL_SECONDS
): Promise<boolean> {
  if (!getMissionControlWriteMode().enabled) return false;
  const sql = getSql();
  const rows = (await sql`
    INSERT INTO ops_activity_sync_state (source, last_attempt_at)
    VALUES (${CLAIM_SOURCE}, now())
    ON CONFLICT (source) DO UPDATE SET last_attempt_at = now()
    WHERE ops_activity_sync_state.last_attempt_at IS NULL
      OR ops_activity_sync_state.last_attempt_at
        < now() - (${Math.max(1, Math.floor(minIntervalSeconds))}::int * interval '1 second')
    RETURNING source
  `) as Array<{ source: string }>;
  return rows.length > 0;
}

async function recordSourceState(
  sql: SqlClient,
  source: string,
  result: { ok: boolean; inserted: number; error: string | null }
): Promise<void> {
  await sql`
    INSERT INTO ops_activity_sync_state (
      source, last_attempt_at, last_ok_at, last_error, last_inserted
    ) VALUES (
      ${source},
      now(),
      ${result.ok ? new Date().toISOString() : null},
      ${result.error},
      ${result.inserted}
    )
    ON CONFLICT (source) DO UPDATE SET
      last_attempt_at = now(),
      last_ok_at = COALESCE(EXCLUDED.last_ok_at, ops_activity_sync_state.last_ok_at),
      last_error = EXCLUDED.last_error,
      last_inserted = EXCLUDED.last_inserted
  `;
}

export type ActivitySyncResult = {
  ran: boolean;
  disabled: boolean;
  reason: string | null;
  inserted: number;
  sources: Array<{ source: string; inserted: number; error: string | null }>;
};

/**
 * Read-only against sources; each source is isolated so one failure never
 * blocks others. Refuses to run (no queries at all) unless writes are enabled
 * server-side — `force` only skips the throttle, never the gate.
 */
export async function syncActivityFromSources(options?: {
  force?: boolean;
  sources?: ActivitySource[];
}): Promise<ActivitySyncResult> {
  const mode = getMissionControlWriteMode();
  if (!mode.enabled) {
    return { ran: false, disabled: true, reason: mode.reason, inserted: 0, sources: [] };
  }
  if (!options?.force && !(await claimActivitySync())) {
    return { ran: false, disabled: false, reason: "Throttled", inserted: 0, sources: [] };
  }
  const sql = getSql();
  const results = await Promise.all(
    (options?.sources ?? ACTIVITY_SOURCES).map(async (source) => {
      let inserted = 0;
      let error: string | null = null;
      try {
        const rows = await source.fetch(sql);
        inserted = await insertActivityEvents(rows.flatMap(source.map));
      } catch (e) {
        error = describeSourceError(e);
      }
      await recordSourceState(sql, source.name, {
        ok: error === null,
        inserted,
        error,
      }).catch(() => undefined);
      return { source: source.name, inserted, error };
    })
  );
  return {
    ran: true,
    disabled: false,
    reason: null,
    inserted: results.reduce((s, r) => s + r.inserted, 0),
    sources: results,
  };
}

/** Read-only; callers must confirm the table exists first. */
export async function listActivitySyncStates(): Promise<ActivitySyncState[]> {
  const sql = getSql();
  const rows = (await sql`
    SELECT * FROM ops_activity_sync_state
    WHERE source <> ${CLAIM_SOURCE}
    ORDER BY source
  `) as Row[];
  return rows.map((r) => ({
    source: String(r.source),
    lastAttemptAt: toIsoOrNull(r.last_attempt_at),
    lastOkAt: toIsoOrNull(r.last_ok_at),
    lastError: str(r.last_error),
    lastInserted: num(r.last_inserted),
  }));
}
