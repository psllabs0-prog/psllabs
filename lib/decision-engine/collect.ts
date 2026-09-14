/**
 * Collect live DecisionContext from existing authoritative systems.
 * Read-only — never confuse collection failure with zero activity.
 */

import { collectAcquisitionSnapshot } from "@/lib/ceo-brief/acquisition";
import { collectSalesSnapshot } from "@/lib/ceo-brief/finance";
import { collectFulfillmentSnapshot } from "@/lib/ceo-brief/fulfillment";
import { collectInventorySnapshot } from "@/lib/ceo-brief/inventory";
import {
  getLastCompletedWeekUtc,
  previousWeekPeriod,
} from "@/lib/ceo-brief/period";
import { collectSeoSnapshot } from "@/lib/ceo-brief/seo";
import { collectSupportSnapshot } from "@/lib/ceo-brief/support";
import { listCustomerIntelSignals } from "@/lib/customer-intelligence/signals-store";
import { getDiscordAdminStatusSafe } from "@/lib/discord/config";
import { getDiscordAnalyticsSummary } from "@/lib/discord/store";
import { getAllPaidProviderStatuses } from "@/lib/external-metrics/paid/providers";
import {
  getLatestSuccessfulExternalMetricSyncRun,
  countSearchConsoleRows,
} from "@/lib/external-metrics/store";
import { getSearchConsoleProperty } from "@/lib/external-metrics/search-console";
import {
  getLatestFinanceJobRun,
  listOpenReconciliationWarnings,
  listFinanceTransactionsNeedingSheetSync,
} from "@/lib/finance/store";
import { computeInventoryMonitorMetrics } from "@/lib/inventory/monitor/run";
import { getSql } from "@/lib/db/sql";
import { getLatestCeoBrief } from "@/lib/ceo-brief/store";
import { getLatestJobRun as getLatestSupportJobRun } from "@/lib/support/store";
import { listAuthorityOpportunities } from "@/lib/authority/store";
import { getDecisionMinDaysForBaseline } from "./thresholds";

import { emptyDecisionContext, type DecisionContext } from "./types";
import {
  emptySourceHealth,
  markSourceFailed,
  markSourceOk,
  sourcesAuditJson,
} from "./source-health";

const MS_DAY = 24 * 60 * 60 * 1000;

function ageDays(iso: string | null | undefined, asOf: Date): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return (asOf.getTime() - t) / MS_DAY;
}

function isStale(
  iso: string | null | undefined,
  asOf: Date,
  maxDays: number
): boolean {
  const age = ageDays(iso, asOf);
  if (age == null) return true;
  return age > maxDays;
}

export async function collectDecisionContext(
  asOf: Date = new Date()
): Promise<{
  ctx: DecisionContext;
  sourcesAudit: ReturnType<typeof sourcesAuditJson>;
}> {
  const period = getLastCompletedWeekUtc(asOf);
  const prior = previousWeekPeriod(period);
  const ctx = emptyDecisionContext(asOf.toISOString());
  // Live collection starts with unchecked sources (fixture defaults are for tests).
  ctx.sourceHealth = emptySourceHealth();
  ctx.recentStart = period.labelStart;
  ctx.recentEnd = period.labelEnd;
  ctx.priorStart = prior.labelStart;
  ctx.priorEnd = prior.labelEnd;

  const minBaseline = getDecisionMinDaysForBaseline();
  // Completed week = 7 observed days when sales snapshot succeeds.
  ctx.observedBaselineDays = { sales: 0, paid: 0, fulfillment: 0 };

  // Finance
  try {
    const [sales, job, warnings, sheetNeed] = await Promise.all([
      collectSalesSnapshot(period, prior),
      getLatestFinanceJobRun("finance_reconciliation"),
      listOpenReconciliationWarnings(50),
      listFinanceTransactionsNeedingSheetSync(20).catch(() => []),
    ]);
    ctx.finance.legitimateOrders7d = sales.legitimateOrders;
    ctx.finance.legitimateOrdersPrior7d = sales.priorLegitimateOrders;
    ctx.finance.grossRevenueUsd7d = sales.grossRevenueUsd;
    ctx.finance.openReconciliationWarnings = warnings.length;
    ctx.finance.paymentHealthWarnings = warnings.filter((w) =>
      /payment|provider|settled|mismatch|currency|checkout|decline/i.test(
        `${w.warningType} ${w.message}`
      )
    ).length;
    ctx.finance.sheetsSyncFailed = sheetNeed.filter(
      (t) => t.sheetSyncStatus === "failed"
    ).length;
    ctx.finance.reconcileFailed = job?.status === "error";
    ctx.finance.fresh = job?.status !== "error";
    ctx.systemHealth.financeJobFailed = job?.status === "error";
    ctx.systemHealth.sheetsFailed = ctx.finance.sheetsSyncFailed > 0;
    // Two completed weeks available when prior also collected
    ctx.observedBaselineDays.sales = 14;
    markSourceOk(ctx.sourceHealth, "finance");
  } catch (e) {
    ctx.finance.fresh = false;
    markSourceFailed(ctx.sourceHealth, "finance", e);
  }

  // Acquisition
  try {
    const [acq, paid] = await Promise.all([
      collectAcquisitionSnapshot(period),
      getAllPaidProviderStatuses(),
    ]);
    const meta = paid.find((p) => p.provider === "meta");
    const tiktok = paid.find((p) => p.provider === "tiktok");
    ctx.acquisition.metaConfigured = Boolean(
      meta && meta.state !== "not_configured"
    );
    ctx.acquisition.tiktokConfigured = Boolean(
      tiktok && tiktok.state !== "not_configured"
    );
    ctx.acquisition.metaFresh = !(
      ctx.acquisition.metaConfigured &&
      isStale(meta?.lastSyncAt ?? null, asOf, 3.5)
    );
    ctx.acquisition.tiktokFresh = !(
      ctx.acquisition.tiktokConfigured &&
      isStale(tiktok?.lastSyncAt ?? null, asOf, 3.5)
    );
    ctx.systemHealth.metaStale =
      ctx.acquisition.metaConfigured && !ctx.acquisition.metaFresh;
    if (acq.status === "available") {
      ctx.acquisition.spendUsd7d = acq.spendUsd ?? 0;
      ctx.acquisition.clicks7d = acq.sessionsOrClicks ?? 0;
      ctx.acquisition.pslAttributedOrders7d = acq.attributedOrders ?? 0;
      ctx.acquisition.pslAttributedRevenueUsd7d = acq.attributedRevenueUsd ?? 0;
      ctx.acquisition.cacUsd = acq.cacUsd;
      ctx.acquisition.roas = acq.roas;
      ctx.acquisition.measurementWarnings = acq.measurementWarnings ?? [];
      ctx.acquisition.contributionEconomicsAvailable =
        acq.contributionEconomics !== "insufficient data" &&
        acq.contributionEconomics != null;
      ctx.observedBaselineDays.paid = 7;
    }
    ctx.acquisition.funnelDataAvailable = false;
    markSourceOk(ctx.sourceHealth, "acquisition");
  } catch (e) {
    markSourceFailed(ctx.sourceHealth, "acquisition", e);
  }

  // Inventory
  try {
    const sql = getSql();
    const snap = (await sql`
      SELECT MAX(snapshot_date)::text AS d FROM inventory_monitor_snapshots
    `) as Array<{ d: string | null }>;
    const snapDate = snap[0]?.d ?? null;
    ctx.inventory.monitorFresh = !(snapDate
      ? isStale(`${snapDate}T00:00:00.000Z`, asOf, 2.5)
      : false);
    if (!snapDate) ctx.inventory.monitorFresh = true;
    ctx.systemHealth.inventoryMonitorStale = Boolean(
      snapDate && isStale(`${snapDate}T00:00:00.000Z`, asOf, 2.5)
    );

    const [invSnap, metrics] = await Promise.all([
      collectInventorySnapshot(asOf),
      computeInventoryMonitorMetrics(asOf).catch(() => []),
    ]);
    const bySku = new Map(metrics.map((m) => [m.sku, m]));
    ctx.inventory.skus = invSnap.skus.map((s) => {
      const m = bySku.get(s.sku);
      return {
        sku: s.sku,
        handle: s.handle,
        name: s.name,
        sellableUnits: s.sellableUnits,
        orderedInbound: s.orderedInbound,
        inTransit: s.inTransit,
        awaitingTesting: s.awaitingTesting,
        inboundPipelineTotal: s.inboundPipelineTotal,
        forecastConfidence: s.forecastConfidence,
        statusFlags: s.statusFlags,
        daysSupply: m?.daysSupply ?? null,
      };
    });
    markSourceOk(ctx.sourceHealth, "inventory");
  } catch (e) {
    ctx.inventory.monitorFresh = false;
    markSourceFailed(ctx.sourceHealth, "inventory", e);
  }

  // Fulfillment
  try {
    const f = await collectFulfillmentSnapshot();
    ctx.fulfillment.readyOrders = f.readyOrders;
    ctx.fulfillment.holds = f.holds;
    ctx.fulfillment.packedWaitingTracking = f.packedWaitingTracking;
    ctx.fulfillment.packingOrReadyBacklog =
      f.readyOrders + f.packedWaitingTracking;
    ctx.fulfillment.slaConfigured = false;
    ctx.observedBaselineDays.fulfillment = Math.max(
      minBaseline,
      ctx.observedBaselineDays.sales || 7
    );
    markSourceOk(ctx.sourceHealth, "fulfillment");
  } catch (e) {
    markSourceFailed(ctx.sourceHealth, "fulfillment", e);
  }

  // Support
  try {
    const [support, supportJob] = await Promise.all([
      collectSupportSnapshot(period),
      getLatestSupportJobRun().catch(() => null),
    ]);
    ctx.support.genuineMessages7d = support.genuineCustomerMessages;
    ctx.support.green = support.green;
    ctx.support.yellow = support.yellow;
    ctx.support.red = support.red;
    ctx.support.unresolvedEscalations = support.unresolvedEscalations;
    ctx.support.topCategories = support.topGenuineCategories.map((c) => ({
      category: c.category,
      count: c.count,
    }));
    ctx.support.failedJobs = supportJob?.ok === false ? 1 : 0;
    ctx.systemHealth.supportJobFailed = supportJob?.ok === false;
    markSourceOk(ctx.sourceHealth, "support");
  } catch (e) {
    markSourceFailed(ctx.sourceHealth, "support", e);
  }

  // Customer intelligence
  try {
    const signals = await listCustomerIntelSignals({ limit: 40 });
    ctx.customerIntelligence.signals = signals.map((s) => ({
      signalKey: s.signalKey,
      theme: s.theme,
      evidenceClass: s.evidenceClass,
      currentCount: s.currentCount,
      confidenceLevel: s.confidenceLevel,
      recommendation: s.recommendation,
      status: s.status,
    }));
    markSourceOk(ctx.sourceHealth, "customerIntelligence");
  } catch (e) {
    markSourceFailed(ctx.sourceHealth, "customerIntelligence", e);
  }

  // SEO
  try {
    const [seo, lastOk, rows, waiting] = await Promise.all([
      collectSeoSnapshot(period, prior),
      getLatestSuccessfulExternalMetricSyncRun("search_console"),
      countSearchConsoleRows(),
      listAuthorityOpportunities({
        statuses: ["brief_ready", "approved"],
        limit: 10,
      }).catch(() => []),
    ]);
    const property = getSearchConsoleProperty();
    ctx.seo.gscConfigured = Boolean(property);
    ctx.seo.gscFresh = !(
      ctx.seo.gscConfigured && isStale(lastOk?.completedAt ?? null, asOf, 3.5)
    );
    if (ctx.seo.gscConfigured && !lastOk) ctx.seo.gscFresh = false;
    ctx.systemHealth.gscStale = ctx.seo.gscConfigured && !ctx.seo.gscFresh;
    if (seo.status === "available") {
      ctx.seo.nonBrandImpressions28d = seo.nonBrandImpressions ?? 0;
      ctx.seo.nonBrandClicks28d = seo.nonBrandClicks ?? 0;
      ctx.seo.materialOpportunity = seo.materialOpportunity;
      ctx.seo.pagesGaining = seo.pagesGaining ?? [];
    }
    void rows;
    ctx.seo.approvedBriefsWaiting = waiting.length;
    markSourceOk(ctx.sourceHealth, "seo");
  } catch (e) {
    markSourceFailed(ctx.sourceHealth, "seo", e);
  }

  // Discord
  try {
    const status = getDiscordAdminStatusSafe();
    const analytics = await getDiscordAnalyticsSummary().catch(() => null);
    ctx.discord.enabled = status.enabled;
    ctx.discord.ready = status.ready;
    ctx.discord.testMode = status.testMode;
    ctx.discord.interactionCount = analytics?.interactionCount ?? 0;
    ctx.discord.restrictedCount = analytics?.restrictedCount ?? 0;
    markSourceOk(ctx.sourceHealth, "discord");
  } catch (e) {
    markSourceFailed(ctx.sourceHealth, "discord", e);
  }

  // CEO brief health
  try {
    const latest = await getLatestCeoBrief();
    ctx.systemHealth.ceoBriefEmailFailed = Boolean(
      latest?.emailSendLastError && !latest.emailSentAt
    );
    markSourceOk(ctx.sourceHealth, "ceoBrief");
  } catch (e) {
    markSourceFailed(ctx.sourceHealth, "ceoBrief", e);
  }

  ctx.systemHealth.failureCount = [
    ctx.systemHealth.financeJobFailed,
    ctx.systemHealth.sheetsFailed,
    ctx.systemHealth.ceoBriefEmailFailed,
    ctx.systemHealth.supportJobFailed,
    ctx.systemHealth.inventoryMonitorStale,
    ctx.systemHealth.metaStale,
    ctx.systemHealth.gscStale,
    !ctx.sourceHealth.finance.ok,
    !ctx.sourceHealth.acquisition.ok,
    !ctx.sourceHealth.inventory.ok,
  ].filter(Boolean).length;

  return { ctx, sourcesAudit: sourcesAuditJson(ctx.sourceHealth) };
}
