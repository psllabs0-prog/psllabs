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
  getLatestSuccessfulSupportJobRun,
  getSupportExpectedPollMinutes,
  listRetryableCustomerSendMessages,
  listUnnotifiedEscalations,
} from "@/lib/support/store";
import { collectFulfillmentBoard } from "@/lib/fulfillment/store";
import { getLatestCeoBrief } from "@/lib/ceo-brief/store";
import { ensureCeoBriefSchema } from "@/lib/ceo-brief/schema";
import {
  getLatestExternalMetricSyncRun,
  getLatestSuccessfulExternalMetricSyncRun,
  sumPaidAcquisitionSpendUsd,
  aggregateSearchConsolePeriod,
} from "@/lib/external-metrics/store";
import { ensureExternalMetricsSchema } from "@/lib/external-metrics/schema";
import { getSearchConsoleConnectorStatus } from "@/lib/external-metrics/search-console";
import { getAllPaidProviderStatuses } from "@/lib/external-metrics/paid/providers";
import { computeLearningBudget } from "@/lib/acquisition/config";
import { countApprovedBriefsWaitingDays } from "@/lib/authority/store";
import { ensureAuthoritySchema } from "@/lib/authority/schema";
import { SEO_MIN_IMPRESSIONS_FOR_SIGNAL } from "@/lib/external-metrics/seo-brief";
import { listCustomerIntelSignals } from "@/lib/customer-intelligence/signals-store";
import { getCustomerIntelMinTrendCount } from "@/lib/customer-intelligence/thresholds";
import {
  getDiscordConfig,
  isDiscordBotEnabled,
} from "@/lib/discord/config";
import { getDiscordAnalyticsSummary } from "@/lib/discord/store";

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

    const [
      failedSends,
      unnotified,
      supportJob,
      lastOk,
      expectedMinutes,
    ] = await Promise.all([
      listRetryableCustomerSendMessages(10),
      listUnnotifiedEscalations(10),
      getLatestSupportJobRun(),
      getLatestSuccessfulSupportJobRun().catch(() => null),
      Promise.resolve(getSupportExpectedPollMinutes()),
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

    // Stale polling — avoid false alarm right after deploy (grace = 2x expected).
    if (lastOk?.finishedAt) {
      const ageMin =
        (Date.now() - Date.parse(lastOk.finishedAt)) / (60 * 1000);
      const staleAfter = expectedMinutes * 2;
      if (ageMin > staleAfter) {
        out.push({
          sourceType: "support_polling_stale",
          sourceId: lastOk.finishedAt,
          priority: "P2",
          area: "support",
          title: "Support polling stale",
          why: `Last successful inbox run ${lastOk.finishedAt}. Expected ~${expectedMinutes}m (stale after ${staleAfter}m).`,
          detectedAt: lastOk.finishedAt,
          href: "/admin-support",
        });
      }
    } else if (supportJob?.finishedAt) {
      // Had runs but none successful — already covered by failed job above when ok=false.
    }
    // No job history yet → Day-0 / post-deploy: do not alarm.
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
    const board = await collectFulfillmentBoard();
    const hours = getUnshippedReviewHours();
    const now = Date.now();

    if (board.hold.length > 0) {
      const first = board.hold[0];
      out.push({
        sourceType: "fulfillment_blocked",
        sourceId: first.orderId,
        priority: "P1",
        area: "fulfillment",
        title: `${board.hold.length} payment-confirmed order(s) blocked from fulfillment`,
        why: first.blocker || first.holdReason || "Hold / review required",
        detectedAt: first.paidAt ?? first.createdAt,
        href: "/admin-fulfillment",
      });
    }

    const awaiting = board.ready.length + board.packed.length;
    if (awaiting > 0) {
      let overdueCount = 0;
      if (hours != null) {
        for (const c of [...board.ready, ...board.packed]) {
          const t = Date.parse(c.paidAt ?? c.createdAt);
          if (Number.isFinite(t) && (now - t) / (60 * 60 * 1000) >= hours) {
            overdueCount += 1;
          }
        }
      }

      if (overdueCount > 0) {
        out.push({
          sourceType: "fulfillment_unshipped_review",
          sourceId: "overdue_batch",
          priority: "P1",
          area: "fulfillment",
          title: `${overdueCount} order(s) past unshipped review hours`,
          why: `Configured OPS_UNSHIPPED_REVIEW_HOURS=${hours}. Awaiting fulfillment review — not a carrier SLA.`,
          detectedAt: new Date().toISOString(),
          href: "/admin-fulfillment",
        });
      } else {
        out.push({
          sourceType: "fulfillment_queue",
          sourceId: "ready_pack",
          priority: "P2",
          area: "fulfillment",
          title: `${board.summary.readyOrders} ready to pack · ${board.summary.packedWaitingTracking} packed awaiting tracking`,
          why:
            hours == null
              ? `Awaiting fulfillment (units to pick: ${board.summary.unitsToPick}). No overdue threshold configured.`
              : `Awaiting fulfillment; none past ${hours}h review window yet.`,
          detectedAt: new Date().toISOString(),
          href: "/admin-fulfillment",
        });
      }
    }
  } catch {
    // Fallback: paid untracked count without workflow metadata.
    try {
      const orders = await getOrdersNeedingTracking(50);
      if (orders.length > 0) {
        out.push({
          sourceType: "fulfillment_queue",
          sourceId: "paid_untracked",
          priority: "P2",
          area: "fulfillment",
          title: `${orders.length} paid order(s) awaiting fulfillment`,
          why: "Awaiting fulfillment.",
          detectedAt: orders[0]?.paidAt ?? new Date().toISOString(),
          href: "/admin-fulfillment",
        });
      }
    } catch {
      // ignore
    }
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

    // Material non-brand visibility drop (authority P3 only when material)
    try {
      const end = new Date();
      const endStr = end.toISOString().slice(0, 10);
      const start28 = new Date(end.getTime() - 27 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
      const priorEnd = new Date(end.getTime() - 28 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
      const priorStart = new Date(end.getTime() - 55 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
      const [cur, prior] = await Promise.all([
        aggregateSearchConsolePeriod({ startDate: start28, endDate: endStr }),
        aggregateSearchConsolePeriod({
          startDate: priorStart,
          endDate: priorEnd,
        }),
      ]);
      if (
        prior.nonBrandImpressions >= SEO_MIN_IMPRESSIONS_FOR_SIGNAL &&
        cur.nonBrandImpressions < prior.nonBrandImpressions * 0.6 &&
        prior.nonBrandImpressions - cur.nonBrandImpressions >=
          SEO_MIN_IMPRESSIONS_FOR_SIGNAL
      ) {
        out.push({
          sourceType: "authority_visibility_drop",
          sourceId: "nonbrand_28d",
          priority: "P3",
          area: "seo",
          title: "Significant non-brand visibility drop",
          why: `Non-brand impressions ${prior.nonBrandImpressions.toFixed(0)} → ${cur.nonBrandImpressions.toFixed(0)} vs prior 28d.`,
          detectedAt: new Date().toISOString(),
          href: "/admin-authority",
        });
      }
    } catch {
      // ignore
    }

    try {
      await ensureAuthoritySchema();
      const waiting = await countApprovedBriefsWaitingDays(21);
      if (waiting > 0) {
        out.push({
          sourceType: "authority_brief_waiting",
          sourceId: "approved_waiting",
          priority: "P3",
          area: "seo",
          title: "Approved authority brief waiting",
          why: `${waiting} approved/in-progress opportunit(ies) older than 21 days.`,
          detectedAt: new Date().toISOString(),
          href: "/admin-authority",
        });
      }
    } catch {
      // ignore
    }
  } catch {
    // ignore
  }

  return out;
}

async function collectAcquisitionExceptions(): Promise<RawOpsException[]> {
  const out: RawOpsException[] = [];
  try {
    await ensureExternalMetricsSchema();
    const spend = await sumPaidAcquisitionSpendUsd();
    const providers = await getAllPaidProviderStatuses();
    const adsLikelyActive = spend > 0;

    for (const p of providers) {
      // Do NOT exception merely because Meta/TikTok is not configured before ads.
      if (p.state === "not_configured") continue;

      if (p.state === "error" && adsLikelyActive) {
        out.push({
          sourceType: "paid_connector",
          sourceId: p.provider,
          priority: "P1",
          area: "acquisition",
          title: `${p.provider} paid reporting connector failed`,
          why: (p.lastError ?? p.message).slice(0, 240),
          detectedAt: p.lastSyncAt ?? new Date().toISOString(),
          href: "/admin-acquisition",
        });
      } else if (p.state === "error" && !adsLikelyActive) {
        out.push({
          sourceType: "paid_connector",
          sourceId: `${p.provider}:pre_spend`,
          priority: "P3",
          area: "acquisition",
          title: `${p.provider} connector error (no spend yet)`,
          why: (p.lastError ?? p.message).slice(0, 240),
          detectedAt: new Date().toISOString(),
          href: "/admin-acquisition",
        });
      } else if (p.state === "configured" || p.state === "healthy") {
        // Stale sync when configured and spend exists
        if (adsLikelyActive && p.lastSyncAt) {
          const age =
            (Date.now() - Date.parse(p.lastSyncAt)) / (24 * 60 * 60 * 1000);
          if (age > 3.5) {
            out.push({
              sourceType: "paid_sync_stale",
              sourceId: p.provider,
              priority: "P3",
              area: "acquisition",
              title: `${p.provider} paid sync stale`,
              why: `Last sync ${p.lastSyncAt}.`,
              detectedAt: p.lastSyncAt,
              href: "/admin-acquisition",
            });
          }
        }
      }
    }

    const budget = computeLearningBudget(spend);
    if (budget.reviewState === "exceeded" || budget.reviewState === "reached") {
      out.push({
        sourceType: "learning_budget",
        sourceId: "ceiling",
        priority: "P2",
        area: "acquisition",
        title: "Paid learning ceiling reached/exceeded",
        why: `Spent $${budget.spentUsd.toFixed(2)} vs ceiling $${budget.ceilingUsd} (${budget.reviewState}). Informational — system does not change budgets.`,
        detectedAt: new Date().toISOString(),
        href: "/admin-acquisition",
      });
    }

    // Serious attribution mismatch only when active spend
    if (adsLikelyActive) {
      const sql = getSql();
      const unmatchedSpend = (await sql`
        SELECT COUNT(*)::int AS n FROM (
          SELECT campaign_id
          FROM paid_acquisition_daily
          WHERE spend_usd > 0
            AND date >= (CURRENT_DATE - interval '14 days')
          GROUP BY platform, campaign_id
        ) t
      `) as Array<{ n: number }>;
      // Lightweight heuristic: if we have spend rows but zero paid-attributed orders in 14d
      const paidOrders = (await sql`
        SELECT COUNT(*)::int AS n
        FROM orders o
        WHERE o.status IN ('paid', 'shipped')
          AND COALESCE(o.paid_at, o.created_at) >= now() - interval '14 days'
          AND NOT EXISTS (
            SELECT 1 FROM finance_transactions ft
            WHERE ft.psl_order_id = o.order_id
              AND ft.reporting_excluded = true
          )
          AND (
            LOWER(COALESCE(o.attribution->>'utmMedium', '')) IN
              ('cpc', 'paid_social', 'display', 'sponsored', 'ppc')
            OR LOWER(COALESCE(o.attribution->>'utmSource', '')) IN
              ('meta', 'facebook', 'instagram', 'tiktok', 'google')
          )
      `) as Array<{ n: number }>;
      const spendRows = Number(unmatchedSpend[0]?.n ?? 0);
      const orders = Number(paidOrders[0]?.n ?? 0);
      const minSpend = Number(
        process.env.ACQUISITION_REVIEW_MIN_SPEND_USD ?? 0
      );
      if (spendRows > 0 && orders === 0 && spend >= Math.max(minSpend, 50)) {
        out.push({
          sourceType: "paid_attribution_mismatch",
          sourceId: "14d",
          priority: "P2",
          area: "acquisition",
          title: "Serious paid attribution mismatch during active spend",
          why: "Platform spend present with no matched PSL paid-attributed orders in 14d.",
          detectedAt: new Date().toISOString(),
          href: "/admin-acquisition",
        });
      }
    }
  } catch {
    // ignore
  }
  return out;
}

async function collectCustomerIntelAndDiscordExceptions(): Promise<
  RawOpsException[]
> {
  const out: RawOpsException[] = [];

  try {
    const signals = await listCustomerIntelSignals({ limit: 30 });
    const minTrend = getCustomerIntelMinTrendCount();
    for (const s of signals) {
      if (s.status === "dismissed" || s.status === "resolved") continue;
      if (s.theme === "restricted_human_use_request") continue;
      if (s.evidenceClass !== "customer") continue;

      if (
        s.confidenceLevel === "strong" &&
        s.currentCount >= minTrend &&
        [
          "checkout_friction",
          "payment_friction",
          "shipping_question",
          "coa_findability",
        ].includes(s.theme)
      ) {
        out.push({
          sourceType: "customer_intel_friction",
          sourceId: s.signalKey,
          priority: "P2",
          area: "support",
          title: `Repeated customer friction: ${s.theme}`,
          why: String(s.evidenceJson.note ?? `${s.currentCount} observations`),
          detectedAt: s.lastSeenAt,
          href: "/admin-customer-intelligence",
        });
      } else if (
        (s.confidenceLevel === "meaningful" ||
          s.confidenceLevel === "strong") &&
        s.recommendation &&
        s.currentCount >= minTrend
      ) {
        out.push({
          sourceType: "customer_intel_review",
          sourceId: s.signalKey,
          priority: "P3",
          area: "support",
          title: `Customer intel review: ${s.recommendation}`,
          why: String(s.evidenceJson.note ?? s.theme),
          detectedAt: s.lastSeenAt,
          href: "/admin-customer-intelligence",
        });
      }
    }
  } catch {
    // ignore
  }

  // Discord: no exception when disabled
  try {
    if (isDiscordBotEnabled()) {
      const cfg = getDiscordConfig();
      if (!cfg.ready) {
        out.push({
          sourceType: "discord_config",
          sourceId: "enabled_not_ready",
          priority: "P2",
          area: "system",
          title: "Discord bot enabled but not fully configured",
          why: "DISCORD_BOT_ENABLED=true but application/public key/token incomplete.",
          detectedAt: new Date().toISOString(),
          href: "/admin-discord",
        });
      } else {
        const analytics = await getDiscordAnalyticsSummary();
        if (
          analytics.interactionCount >= 20 &&
          analytics.restrictedCount / analytics.interactionCount > 0.5
        ) {
          out.push({
            sourceType: "discord_error_rate",
            sourceId: "restricted_share",
            priority: "P3",
            area: "system",
            title: "Elevated Discord restricted-request share",
            why: `${analytics.restrictedCount}/${analytics.interactionCount} restricted outcomes (compliance watch only).`,
            detectedAt: analytics.lastInteractionAt ?? new Date().toISOString(),
            href: "/admin-discord",
          });
        }
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
  const [
    finance,
    support,
    inventory,
    fulfillment,
    ceoData,
    acquisition,
    customerDiscord,
    acks,
  ] = await Promise.all([
    collectFinanceExceptions(),
    collectSupportExceptions(),
    collectInventoryExceptions(),
    collectFulfillmentExceptions(),
    collectCeoAndDataExceptions(),
    collectAcquisitionExceptions(),
    collectCustomerIntelAndDiscordExceptions(),
    listOpenOpsAcknowledgements().catch(() => []),
  ]);

  const raw = [
    ...finance,
    ...support,
    ...inventory,
    ...fulfillment,
    ...ceoData,
    ...acquisition,
    ...customerDiscord,
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
