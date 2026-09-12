import { getSql } from "@/lib/db/sql";
import { ensureFinanceSchema } from "@/lib/finance/schema";
import { ensureOrdersSchema } from "@/lib/orders/store";
import { ensureExternalMetricsSchema } from "@/lib/external-metrics/schema";
import {
  chooseRevenueTruth,
  normalizePaidPlatform,
  paidAttributionMatchScore,
} from "@/lib/external-metrics/paid/attribution";
import {
  countPaidAcquisitionRows,
  sumPaidAcquisitionSpendUsd,
  sumPaidSpendByPlatform,
} from "@/lib/external-metrics/store";
import { getAllPaidProviderStatuses } from "@/lib/external-metrics/paid/providers";

import {
  computeLearningBudget,
  contributionEconomicsLabel,
  hasEnoughEvidenceForPerformanceConclusion,
} from "./config";

export type AcquisitionCampaignRow = {
  platform: string;
  campaignId: string;
  campaignName: string;
  spendUsd: number;
  impressions: number;
  clicks: number;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  pslOrders: number;
  pslRevenueUsd: number;
  cacUsd: number | null;
  roas: number | null;
  platformPurchaseValueUsd: number | null;
  sampleNote: string;
  dataConfidence: "low" | "adequate";
};

export type AcquisitionCreativeRow = {
  platform: string;
  contentKey: string;
  spendUsd: number;
  orders: number;
  revenueUsd: number;
  cacUsd: number | null;
  roas: number | null;
  sampleNote: string;
};

export type AcquisitionReviewSignal = {
  code: string;
  severity: "info" | "warning";
  message: string;
};

export type AcquisitionDashboard = {
  connectors: Awaited<ReturnType<typeof getAllPaidProviderStatuses>>;
  learningBudget: ReturnType<typeof computeLearningBudget>;
  funnel: {
    sessions: null;
    addToCart: null;
    checkoutStart: null;
    paymentAttempt: null;
    note: string;
  };
  platformSummary: Array<{
    platform: string;
    spendUsd: number;
    clicks: number;
    impressions: number;
    pslOrders: number;
    pslRevenueUsd: number;
    cacUsd: number | null;
    roas: number | null;
  }>;
  campaigns: AcquisitionCampaignRow[];
  creatives: AcquisitionCreativeRow[];
  measurementWarnings: string[];
  unmatched: {
    platformCampaignsWithoutPsl: string[];
    pslOrdersWithoutPlatform: string[];
  };
  reviewSignals: AcquisitionReviewSignal[];
  contributionEconomics: "insufficient data";
  hasPaidData: boolean;
};

function isPaidOrderAttr(attr: {
  utmSource?: string | null;
  utmMedium?: string | null;
} | null): boolean {
  if (!attr) return false;
  const medium = (attr.utmMedium ?? "").toLowerCase();
  const source = normalizePaidPlatform(attr.utmSource);
  return (
    ["cpc", "paid_social", "display", "sponsored", "ppc"].includes(medium) ||
    ["meta", "tiktok", "google", "bing", "x", "reddit"].includes(source)
  );
}

export async function buildAcquisitionDashboard(options?: {
  startDate?: string;
  endDate?: string;
}): Promise<AcquisitionDashboard> {
  await ensureExternalMetricsSchema();
  await ensureOrdersSchema();
  await ensureFinanceSchema();

  const sql = getSql();
  const endDate =
    options?.endDate ?? new Date().toISOString().slice(0, 10);
  const startDate =
    options?.startDate ??
    new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [connectors, totalSpend, paidRows, platformSpend] = await Promise.all([
    getAllPaidProviderStatuses(),
    sumPaidAcquisitionSpendUsd(),
    countPaidAcquisitionRows(),
    sumPaidSpendByPlatform(),
  ]);

  const learningBudget = computeLearningBudget(totalSpend);

  const paidAgg = (await sql`
    SELECT
      platform,
      campaign_id,
      MAX(campaign_name) AS campaign_name,
      COALESCE(SUM(spend_usd), 0)::float AS spend,
      COALESCE(SUM(impressions), 0)::bigint AS impressions,
      COALESCE(SUM(clicks), 0)::bigint AS clicks,
      COALESCE(SUM(platform_purchase_value_usd), 0)::float AS platform_value
    FROM paid_acquisition_daily
    WHERE date >= ${startDate}::date
      AND date <= ${endDate}::date
    GROUP BY platform, campaign_id
    ORDER BY spend DESC
    LIMIT 100
  `) as Array<{
    platform: string;
    campaign_id: string;
    campaign_name: string;
    spend: number;
    impressions: number;
    clicks: number;
    platform_value: number;
  }>;

  const creativeAgg = (await sql`
    SELECT
      platform,
      COALESCE(NULLIF(ad_name, ''), NULLIF(ad_id, ''), campaign_id) AS content_key,
      COALESCE(SUM(spend_usd), 0)::float AS spend
    FROM paid_acquisition_daily
    WHERE date >= ${startDate}::date
      AND date <= ${endDate}::date
    GROUP BY platform, COALESCE(NULLIF(ad_name, ''), NULLIF(ad_id, ''), campaign_id)
    ORDER BY spend DESC
    LIMIT 100
  `) as Array<{ platform: string; content_key: string; spend: number }>;

  const orderRows = (await sql`
    SELECT
      o.order_id,
      o.total::float AS total,
      o.attribution
    FROM orders o
    WHERE o.status IN ('paid', 'shipped')
      AND COALESCE(o.paid_at, o.created_at) >= ${startDate}::date
      AND COALESCE(o.paid_at, o.created_at) < (${endDate}::date + interval '1 day')
      AND NOT EXISTS (
        SELECT 1 FROM finance_transactions ft
        WHERE ft.psl_order_id = o.order_id
          AND ft.reporting_excluded = true
      )
  `) as Array<{
    order_id: string;
    total: number;
    attribution: Record<string, unknown> | null;
  }>;

  const paidOrders = orderRows.filter((o) =>
    isPaidOrderAttr(
      o.attribution
        ? {
            utmSource: o.attribution.utmSource as string | null,
            utmMedium: o.attribution.utmMedium as string | null,
          }
        : null
    )
  );

  const campaigns: AcquisitionCampaignRow[] = paidAgg.map((c) => {
    let pslOrders = 0;
    let pslRevenue = 0;
    for (const o of paidOrders) {
      const attr = o.attribution ?? {};
      const score = paidAttributionMatchScore(
        {
          utmSource: attr.utmSource as string | null,
          utmMedium: attr.utmMedium as string | null,
          utmCampaign: attr.utmCampaign as string | null,
          utmContent: attr.utmContent as string | null,
        },
        {
          platform: c.platform,
          campaignId: c.campaign_id,
          utmCampaign: c.campaign_name,
        }
      );
      // Require meaningful join (platform + campaign signal)
      if (score >= 5) {
        pslOrders += 1;
        pslRevenue += Number(o.total);
      }
    }
    const truth = chooseRevenueTruth({
      pslAttributedRevenueUsd: pslRevenue,
      platformPurchaseValueUsd: c.platform_value,
    });
    const spend = Number(c.spend);
    const clicks = Number(c.clicks);
    const impressions = Number(c.impressions);
    const adequate = hasEnoughEvidenceForPerformanceConclusion({
      clicks,
      spendUsd: spend,
      orders: pslOrders,
    });
    return {
      platform: c.platform,
      campaignId: c.campaign_id,
      campaignName: c.campaign_name || c.campaign_id,
      spendUsd: spend,
      impressions,
      clicks,
      ctr: impressions > 0 ? clicks / impressions : null,
      cpc: clicks > 0 ? spend / clicks : null,
      cpm: impressions > 0 ? (spend / impressions) * 1000 : null,
      pslOrders,
      pslRevenueUsd: truth.revenueUsd,
      cacUsd: pslOrders > 0 ? spend / pslOrders : null,
      roas: spend > 0 ? truth.revenueUsd / spend : null,
      platformPurchaseValueUsd: Number(c.platform_value) || null,
      sampleNote: adequate
        ? "Evidence thresholds met for comparison"
        : "Insufficient sample — show data only; no strong conclusion",
      dataConfidence: adequate ? "adequate" : "low",
    };
  });

  const creatives: AcquisitionCreativeRow[] = creativeAgg.map((c) => {
    let orders = 0;
    let revenue = 0;
    for (const o of paidOrders) {
      const attr = o.attribution ?? {};
      const content = String(attr.utmContent ?? "").toLowerCase();
      const key = String(c.content_key ?? "").toLowerCase();
      const src = normalizePaidPlatform(attr.utmSource as string | null);
      if (src === normalizePaidPlatform(c.platform) && content && key && content === key) {
        orders += 1;
        revenue += Number(o.total);
      }
    }
    const spend = Number(c.spend);
    const adequate = hasEnoughEvidenceForPerformanceConclusion({
      clicks: 0,
      spendUsd: spend,
      orders,
    });
    return {
      platform: c.platform,
      contentKey: c.content_key,
      spendUsd: spend,
      orders,
      revenueUsd: revenue,
      cacUsd: orders > 0 ? spend / orders : null,
      roas: spend > 0 ? revenue / spend : null,
      sampleNote: adequate
        ? "Evidence thresholds met"
        : "Insufficient sample for winner/loser labeling",
    };
  });

  // Platform rollups with PSL totals (all paid orders by source)
  const platformSummary = platformSpend.map((p) => {
    let orders = 0;
    let revenue = 0;
    for (const o of paidOrders) {
      const src = normalizePaidPlatform(
        (o.attribution?.utmSource as string | null) ?? null
      );
      if (src === normalizePaidPlatform(p.platform)) {
        orders += 1;
        revenue += Number(o.total);
      }
    }
    const periodSpendRows = paidAgg.filter(
      (c) => normalizePaidPlatform(c.platform) === normalizePaidPlatform(p.platform)
    );
    const spend = periodSpendRows.reduce((s, r) => s + Number(r.spend), 0);
    const clicks = periodSpendRows.reduce((s, r) => s + Number(r.clicks), 0);
    const impressions = periodSpendRows.reduce(
      (s, r) => s + Number(r.impressions),
      0
    );
    return {
      platform: p.platform,
      spendUsd: spend,
      clicks,
      impressions,
      pslOrders: orders,
      pslRevenueUsd: revenue,
      cacUsd: orders > 0 ? spend / orders : null,
      roas: spend > 0 ? revenue / spend : null,
    };
  });

  const measurementWarnings: string[] = [];
  const unmatchedPlatform: string[] = [];
  const unmatchedOrders: string[] = [];

  for (const c of campaigns) {
    if (c.spendUsd > 0 && c.pslOrders === 0) {
      unmatchedPlatform.push(`${c.platform}:${c.campaignName}`);
    }
  }
  for (const o of paidOrders) {
    const attr = o.attribution ?? {};
    let matched = false;
    for (const c of paidAgg) {
      const score = paidAttributionMatchScore(
        {
          utmSource: attr.utmSource as string | null,
          utmMedium: attr.utmMedium as string | null,
          utmCampaign: attr.utmCampaign as string | null,
          utmContent: attr.utmContent as string | null,
        },
        {
          platform: c.platform,
          campaignId: c.campaign_id,
          utmCampaign: c.campaign_name,
        }
      );
      if (score >= 5) {
        matched = true;
        break;
      }
    }
    if (!matched && paidAgg.length > 0) {
      unmatchedOrders.push(o.order_id);
    }
  }

  if (unmatchedPlatform.length > 0) {
    measurementWarnings.push(
      `${unmatchedPlatform.length} platform campaign(s) with spend and no matched PSL orders (measurement warning).`
    );
  }
  if (unmatchedOrders.length > 0) {
    measurementWarnings.push(
      `${unmatchedOrders.length} PSL paid-attributed order(s) without matching platform reporting row.`
    );
  }

  const reviewSignals: AcquisitionReviewSignal[] = [];
  if (unmatchedPlatform.length || unmatchedOrders.length) {
    reviewSignals.push({
      code: "MEASUREMENT_WARNING",
      severity: "warning",
      message: "Attribution matching incomplete during paid activity.",
    });
  }
  if (learningBudget.reviewState === "approaching") {
    reviewSignals.push({
      code: "LEARNING_BUDGET_80",
      severity: "info",
      message: `Learning budget approaching ceiling (${learningBudget.pctOfCeiling.toFixed(0)}% of $${learningBudget.ceilingUsd}). Informational only — system does not spend.`,
    });
  }
  if (
    learningBudget.reviewState === "reached" ||
    learningBudget.reviewState === "exceeded"
  ) {
    reviewSignals.push({
      code: "LEARNING_BUDGET_CEILING",
      severity: "warning",
      message: `Learning budget ceiling $${learningBudget.ceilingUsd} ${learningBudget.reviewState}. Informational only — system does not change budgets.`,
    });
  }

  const minSpend = Number(process.env.ACQUISITION_REVIEW_MIN_SPEND_USD ?? 0);
  const periodSpend = campaigns.reduce((s, c) => s + c.spendUsd, 0);
  const periodOrders = campaigns.reduce((s, c) => s + c.pslOrders, 0);
  if (
    minSpend > 0 &&
    periodSpend >= minSpend &&
    periodOrders === 0 &&
    hasEnoughEvidenceForPerformanceConclusion({
      clicks: campaigns.reduce((s, c) => s + c.clicks, 0),
      spendUsd: periodSpend,
      orders: 0,
    })
  ) {
    reviewSignals.push({
      code: "SPEND_WITHOUT_ORDER_SIGNAL",
      severity: "warning",
      message: "Meaningful spend with no matched PSL orders in window.",
    });
  }

  // Never invent creative winners without evidence thresholds
  const rankedCreatives = creatives.filter((c) =>
    hasEnoughEvidenceForPerformanceConclusion({
      clicks: 0,
      spendUsd: c.spendUsd,
      orders: c.orders,
    })
  );
  if (rankedCreatives.length >= 2) {
    const byRoas = [...rankedCreatives].sort(
      (a, b) => (b.roas ?? 0) - (a.roas ?? 0)
    );
    if ((byRoas[0].roas ?? 0) > 0) {
      reviewSignals.push({
        code: "CREATIVE_RELATIVE_WINNER",
        severity: "info",
        message: `Relative creative leader (sample ok): ${byRoas[0].contentKey}`,
      });
    }
  }

  return {
    connectors,
    learningBudget,
    funnel: {
      sessions: null,
      addToCart: null,
      checkoutStart: null,
      paymentAttempt: null,
      note: "Server-side funnel events unavailable — Plausible client events are not used as SoT.",
    },
    platformSummary,
    campaigns,
    creatives,
    measurementWarnings,
    unmatched: {
      platformCampaignsWithoutPsl: unmatchedPlatform.slice(0, 25),
      pslOrdersWithoutPlatform: unmatchedOrders.slice(0, 25),
    },
    reviewSignals,
    contributionEconomics: contributionEconomicsLabel(),
    hasPaidData: paidRows > 0 && totalSpend > 0,
  };
}
