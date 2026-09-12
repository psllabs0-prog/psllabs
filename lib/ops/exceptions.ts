import { shouldCreateInventoryRiskLukeAction } from "@/lib/ceo-brief/inventory";
import type { CeoInventorySkuRow } from "@/lib/ceo-brief/types";
import {
  getLatestFinanceJobRun,
  listFinanceTransactionsNeedingSheetSync,
  listOpenReconciliationWarnings,
} from "@/lib/finance/store";
import { isGoogleSheetsConfigured } from "@/lib/finance/google-sheets";
import { listPipelineLots } from "@/lib/inventory/monitor/pipeline";
import { computeInventoryMonitorMetrics } from "@/lib/inventory/monitor/run";
import { getOrdersNeedingTracking } from "@/lib/orders/store";
import { getSql } from "@/lib/db/sql";
import { ensureSupportSchema } from "@/lib/support/schema";
import {
  getLatestJobRun as getLatestSupportJobRun,
  listRetryableCustomerSendMessages,
  listUnnotifiedEscalations,
} from "@/lib/support/store";
import { getLatestCeoBrief } from "@/lib/ceo-brief/store";
import { ensureCeoBriefSchema } from "@/lib/ceo-brief/schema";
import {
  getLatestExternalMetricSyncRun,
  getLatestSuccessfulExternalMetricSyncRun,
} from "@/lib/external-metrics/store";
import { ensureExternalMetricsSchema } from "@/lib/external-metrics/schema";
import { getSearchConsoleConnectorStatus } from "@/lib/external-metrics/search-console";

import { listOpenOpsAcknowledgements } from "./store";
import {
  sortOpsExceptions,
  type OpsException,
  type OpsPriority,
} from "./types";

export type RawOpsException = Omit<
  OpsException,
  "acknowledged" | "acknowledgedAt" | "note"
>;

/** Pure: apply acknowledgements; drop resolved-at-source items (caller filters). */
export function applyAcknowledgements(
  raw: RawOpsException[],
  acks: Array<{
    sourceType: string;
    sourceId: string;
    acknowledgedAt: string;
    note: string | null;
  }>
): OpsException[] {
  const map = new Map(
    acks.map((a) => [`${a.sourceType}:${a.sourceId}`, a] as const)
  );
  return sortOpsExceptions(
    raw.map((r) => {
      const ack = map.get(`${r.sourceType}:${r.sourceId}`);
      return {
        ...r,
        acknowledged: Boolean(ack),
        acknowledgedAt: ack?.acknowledgedAt ?? null,
        note: ack?.note ?? null,
      };
    })
  );
}

export function supportEscalationEligible(input: {
  reportingExcluded: boolean;
  category: string | null;
  status: string | null;
}): boolean {
  if (input.reportingExcluded) return false;
  if (input.status === "ignored") return false;
  const cat = (input.category ?? "").toLowerCase();
  if (cat === "spam_solicitation" || cat === "vendor_solicitation") return false;
  return true;
}

export function inventorySkuToOpsCandidate(
  sku: Pick<
    CeoInventorySkuRow,
    | "handle"
    | "sku"
    | "name"
    | "sellableUnits"
    | "orderedInbound"
    | "inTransit"
    | "awaitingTesting"
    | "inboundPipelineTotal"
    | "forecastConfidence"
    | "statusFlags"
  >
): RawOpsException | null {
  if (!shouldCreateInventoryRiskLukeAction(sku)) return null;
  return {
    sourceType: "inventory_reorder_review",
    sourceId: sku.sku,
    priority: "P2",
    area: "inventory",
    title: `Inventory risk: ${sku.name}`,
    why: `Sellable ${sku.sellableUnits}, inbound ${sku.inboundPipelineTotal}, confidence ${sku.forecastConfidence}. Human review only.`,
    detectedAt: new Date().toISOString(),
    href: "/admin-inventory",
  };
}

export function getUnshippedReviewHours(): number | null {
  const raw = process.env.OPS_UNSHIPPED_REVIEW_HOURS?.trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

async function collectFinanceExceptions(): Promise<RawOpsException[]> {
  const out: RawOpsException[] = [];
  try {
    const [warnings, financeJob] = await Promise.all([
      listOpenReconciliationWarnings(25),
      getLatestFinanceJobRun("finance_reconciliation"),
    ]);

    for (const w of warnings) {
      const p1 =
        /mismatch|discrepan|provider|payment|amount/i.test(w.warningType) ||
        /mismatch|discrepan|provider|payment|amount/i.test(w.message);
      out.push({
        sourceType: "finance_reconciliation_warning",
        sourceId: String(w.id),
        priority: p1 ? "P1" : "P2",
        area: "finance",
        title: `Reconciliation: ${w.warningType}`,
        why: w.message.slice(0, 240),
        detectedAt: w.createdAt,
        href: "/admin-finance",
      });
    }

    if (financeJob?.status === "error") {
      out.push({
        sourceType: "finance_job_failure",
        sourceId: String(financeJob.id),
        priority: "P0",
        area: "finance",
        title: "Finance reconciliation job failed",
        why: (financeJob.error ?? "unknown error").slice(0, 240),
        detectedAt: financeJob.finishedAt ?? financeJob.startedAt,
        href: "/admin-finance",
      });
    }

    if (isGoogleSheetsConfigured()) {
      const pending = await listFinanceTransactionsNeedingSheetSync(20);
      const failed = pending.filter((t) => t.sheetSyncStatus === "failed");
      if (failed.length > 0) {
        out.push({
          sourceType: "finance_sheets_sync",
          sourceId: "failed_batch",
          priority: "P2",
          area: "finance",
          title: "Finance Sheets sync failures",
          why: `${failed.length}+ transaction row(s) failed Google Sheets sync.`,
          detectedAt: new Date().toISOString(),
          href: "/admin-finance",
        });
      }
    }
  } catch {
    // never crash ops center
  }
  return out;
}

async function collectSupportExceptions(): Promise<RawOpsException[]> {
  const out: RawOpsException[] = [];
  try {
    await ensureSupportSchema();
    const sql = getSql();
    const rows = (await sql`
      SELECT
        e.id,
        e.risk_level,
        e.reason,
        e.created_at,
        m.reporting_excluded,
        m.status AS msg_status,
        c.category
      FROM support_escalations e
      JOIN support_messages m ON m.id = e.message_id
      LEFT JOIN support_classifications c ON c.message_id = m.id
      WHERE e.resolved_at IS NULL
      ORDER BY e.created_at ASC
      LIMIT 50
    `) as Array<{
      id: number | string;
      risk_level: string;
      reason: string;
      created_at: string;
      reporting_excluded: boolean;
      msg_status: string | null;
      category: string | null;
    }>;

    for (const row of rows) {
      if (
        !supportEscalationEligible({
          reportingExcluded: Boolean(row.reporting_excluded),
          category: row.category,
          status: row.msg_status,
        })
      ) {
        continue;
      }
      const red = row.risk_level === "RED";
      out.push({
        sourceType: "support_escalation",
        sourceId: String(row.id),
        priority: red ? "P1" : "P2",
        area: "support",
        title: `${row.risk_level} support escalation`,
        why: (row.reason || "Open escalation needs human review").slice(0, 240),
        detectedAt: new Date(row.created_at).toISOString(),
        href: "/admin-support",
      });
    }

    const [failedSends, unnotified, supportJob] = await Promise.all([
      listRetryableCustomerSendMessages(10),
      listUnnotifiedEscalations(10),
      getLatestSupportJobRun(),
    ]);

    if (failedSends.length > 0) {
      out.push({
        sourceType: "support_customer_send_failed",
        sourceId: "batch",
        priority: "P2",
        area: "support",
        title: "Failed customer support send(s)",
        why: `${failedSends.length} message(s) need send retry.`,
        detectedAt: new Date().toISOString(),
        href: "/admin-support",
      });
    }

    if (unnotified.length > 0) {
      out.push({
        sourceType: "support_luke_notify_failed",
        sourceId: "batch",
        priority: "P2",
        area: "support",
        title: "Luke escalation notification pending/failed",
        why: `${unnotified.length} open escalation(s) without notified_at.`,
        detectedAt: new Date().toISOString(),
        href: "/admin-support",
      });
    }

    if (supportJob?.ok === false) {
      out.push({
        sourceType: "support_inbox_job",
        sourceId: supportJob.finishedAt ?? "latest",
        priority: "P2",
        area: "support",
        title: "Support inbox job failed",
        why: (supportJob.errorSummary ?? "unknown").slice(0, 240),
        detectedAt: supportJob.finishedAt ?? new Date().toISOString(),
        href: "/admin-support",
      });
    }
  } catch {
    // ignore
  }
  return out;
}

async function collectInventoryExceptions(): Promise<RawOpsException[]> {
  const out: RawOpsException[] = [];
  try {
    const [lots, metrics] = await Promise.all([
      listPipelineLots({ includeReleased: false, limit: 100 }),
      computeInventoryMonitorMetrics(new Date()),
    ]);

    const awaiting = lots.filter((l) => l.status === "received_awaiting_testing");
    for (const lot of awaiting) {
      out.push({
        sourceType: "inventory_awaiting_testing",
        sourceId: String(lot.id),
        priority: "P2",
        area: "inventory",
        title: `Lot awaiting testing: ${lot.sku}`,
        why: `Lot #${lot.id} is received_awaiting_testing — not sellable until released. Human decision only.`,
        detectedAt: lot.receivedAt ?? lot.updatedAt ?? lot.createdAt,
        href: "/admin-inventory",
      });
    }

    for (const m of metrics) {
      const candidate = inventorySkuToOpsCandidate({
        handle: m.handle,
        sku: m.sku,
        name: m.productName,
        sellableUnits: m.sellableStock,
        orderedInbound: m.orderedInbound,
        inTransit: m.inTransit,
        awaitingTesting: m.awaitingTesting,
        inboundPipelineTotal:
          m.orderedInbound + m.inTransit + m.awaitingTesting,
        forecastConfidence: m.forecastConfidence,
        statusFlags: m.statusFlags,
      });
      if (candidate) out.push(candidate);
    }

    // Stale monitor snapshots ≈ job failure / missed cron (Hobby-safe heuristic).
    const sql = getSql();
    const snap = (await sql`
      SELECT MAX(snapshot_date)::text AS d
      FROM inventory_monitor_snapshots
    `) as Array<{ d: string | null }>;
    const latest = snap[0]?.d;
    if (latest) {
      const ageDays =
        (Date.now() - Date.parse(`${latest}T00:00:00.000Z`)) /
        (24 * 60 * 60 * 1000);
      if (ageDays > 2.5) {
        out.push({
          sourceType: "inventory_monitor_stale",
          sourceId: latest,
          priority: "P2",
          area: "inventory",
          title: "Inventory monitor snapshots stale",
          why: `Latest snapshot date ${latest} — monitor cron may have failed.`,
          detectedAt: new Date().toISOString(),
          href: "/admin-inventory",
        });
      }
    }
  } catch {
    // ignore
  }
  return out;
}

async function collectFulfillmentExceptions(): Promise<RawOpsException[]> {
  const out: RawOpsException[] = [];
  try {
    const orders = await getOrdersNeedingTracking(50);
    if (orders.length === 0) return out;

    const hours = getUnshippedReviewHours();
    const now = Date.now();

    if (hours == null) {
      out.push({
        sourceType: "fulfillment_queue",
        sourceId: "paid_untracked",
        priority: "P1",
        area: "fulfillment",
        title: `${orders.length} paid order(s) awaiting tracking`,
        why: "Paid orders without tracking. No overdue SLA configured (OPS_UNSHIPPED_REVIEW_HOURS).",
        detectedAt: orders[0]?.paidAt ?? orders[0]?.createdAt ?? new Date().toISOString(),
        href: "/admin-ledger",
      });
      return out;
    }

    const overdue = orders.filter((o) => {
      const t = Date.parse(o.paidAt ?? o.createdAt);
      if (!Number.isFinite(t)) return false;
      return (now - t) / (60 * 60 * 1000) >= hours;
    });

    if (overdue.length > 0) {
      out.push({
        sourceType: "fulfillment_unshipped_review",
        sourceId: "overdue_batch",
        priority: "P1",
        area: "fulfillment",
        title: `${overdue.length} order(s) past unshipped review hours`,
        why: `Configured OPS_UNSHIPPED_REVIEW_HOURS=${hours}. Review fulfillment — do not invent carrier SLAs.`,
        detectedAt: overdue[0]?.paidAt ?? new Date().toISOString(),
        href: "/admin-ledger",
      });
    } else if (orders.length > 0) {
      out.push({
        sourceType: "fulfillment_queue",
        sourceId: "paid_untracked",
        priority: "P2",
        area: "fulfillment",
        title: `${orders.length} paid order(s) awaiting tracking`,
        why: "In fulfillment queue; none past configured review hours yet.",
        detectedAt: orders[0]?.paidAt ?? new Date().toISOString(),
        href: "/admin-ledger",
      });
    }
  } catch {
    // ignore
  }
  return out;
}

async function collectCeoAndDataExceptions(): Promise<RawOpsException[]> {
  const out: RawOpsException[] = [];
  try {
    await ensureCeoBriefSchema();
    const latest = await getLatestCeoBrief();
    if (latest?.emailSendLastError && !latest.emailSentAt) {
      out.push({
        sourceType: "ceo_brief_email",
        sourceId: String(latest.id),
        priority: "P2",
        area: "ceo",
        title: "CEO brief email failed",
        why: latest.emailSendLastError.slice(0, 240),
        detectedAt: latest.generatedAt,
        href: "/admin-ceo",
      });
    }
  } catch {
    // ignore
  }

  try {
    await ensureExternalMetricsSchema();
    const last = await getLatestExternalMetricSyncRun("search_console");
    if (last?.status === "error") {
      out.push({
        sourceType: "external_metric_sync",
        sourceId: `search_console:${last.id}`,
        priority: "P3",
        area: "data",
        title: "Search Console sync failed",
        why: (last.errorSummary ?? "sync error").slice(0, 240),
        detectedAt: last.completedAt ?? last.startedAt,
        href: "/admin-data",
      });
    } else {
      const connector = getSearchConsoleConnectorStatus({
        lastError: null,
      });
      if (connector.status === "error") {
        out.push({
          sourceType: "external_metric_sync",
          sourceId: "search_console:connector",
          priority: "P3",
          area: "data",
          title: "Search Console connector error",
          why: connector.message.slice(0, 240),
          detectedAt: new Date().toISOString(),
          href: "/admin-data",
        });
      }
    }

    // Stale successful sync (>3 days) when configured
    const ok = await getLatestSuccessfulExternalMetricSyncRun("search_console");
    const property = process.env.GOOGLE_SEARCH_CONSOLE_PROPERTY?.trim();
    if (property && ok?.completedAt) {
      const age =
        (Date.now() - Date.parse(ok.completedAt)) / (24 * 60 * 60 * 1000);
      if (age > 3.5) {
        out.push({
          sourceType: "external_metric_stale",
          sourceId: "search_console",
          priority: "P3",
          area: "data",
          title: "Search Console sync stale",
          why: `Last successful sync ${ok.completedAt}.`,
          detectedAt: ok.completedAt,
          href: "/admin-data",
        });
      }
    }
  } catch {
    // ignore
  }

  return out;
}

/**
 * Live exceptions from authoritative tables + optional acknowledgements.
 * Does not invent urgency; empty Day-0 → [].
 */
export async function collectOpsExceptions(): Promise<OpsException[]> {
  const [finance, support, inventory, fulfillment, ceoData, acks] =
    await Promise.all([
      collectFinanceExceptions(),
      collectSupportExceptions(),
      collectInventoryExceptions(),
      collectFulfillmentExceptions(),
      collectCeoAndDataExceptions(),
      listOpenOpsAcknowledgements().catch(() => []),
    ]);

  const raw = [
    ...finance,
    ...support,
    ...inventory,
    ...fulfillment,
    ...ceoData,
  ];
  return applyAcknowledgements(raw, acks);
}

export function priorityOutranks(
  higher: OpsPriority,
  lower: OpsPriority
): boolean {
  const rank: Record<OpsPriority, number> = {
    P0: 0,
    P1: 1,
    P2: 2,
    P3: 3,
  };
  return rank[higher] < rank[lower];
}
