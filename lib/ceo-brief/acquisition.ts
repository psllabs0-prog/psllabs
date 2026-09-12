import { getSql } from "@/lib/db/sql";
import { ensureFinanceSchema } from "@/lib/finance/schema";
import { ensureOrdersSchema } from "@/lib/orders/store";
import { ensureExternalMetricsSchema } from "@/lib/external-metrics/schema";
import { sumPaidAcquisitionSpendUsd } from "@/lib/external-metrics/store";
import {
  hasEnoughEvidenceForPerformanceConclusion,
} from "@/lib/acquisition/config";
import {
  normalizePaidPlatform,
  assignOrderToUniqueCampaign,
} from "@/lib/external-metrics/paid/attribution";

import type { BriefPeriod } from "./period";
import type { CeoAcquisitionSnapshot } from "./types";

/**
 * Paid acquisition snapshot.
 * Spend comes from paid_acquisition_daily only when real rows exist.
 * Orders/revenue use internal PSL attribution (reporting_excluded excluded).
 */
export async function collectAcquisitionSnapshot(
  period?: BriefPeriod
): Promise<CeoAcquisitionSnapshot> {
  const emptyUnavailable = (): CeoAcquisitionSnapshot => ({
    status: "unavailable",
    message: "Paid acquisition spend data not yet available.",
    spendUsd: null,
    sessionsOrClicks: null,
    attributedOrders: null,
    attributedRevenueUsd: null,
    cacUsd: null,
    roas: null,
    winners: [],
    losers: [],
    measurementWarnings: [],
    topCampaign: null,
    contributionEconomics: "insufficient data",
  });

  try {
    await ensureExternalMetricsSchema();
    const spendAllTime = await sumPaidAcquisitionSpendUsd();
    if (spendAllTime <= 0 || !period) {
      return emptyUnavailable();
    }

    await ensureOrdersSchema();
    await ensureFinanceSchema();
    const sql = getSql();
    const start = period.periodStart.toISOString();
    const end = period.periodEnd.toISOString();

    const spendRows = (await sql`
      SELECT
        COALESCE(SUM(spend_usd), 0)::float AS spend,
        COALESCE(SUM(clicks), 0)::bigint AS clicks
      FROM paid_acquisition_daily
      WHERE date >= ${period.labelStart}::date
        AND date <= ${period.labelEnd}::date
    `) as Array<{ spend: number; clicks: number }>;

    const spend = Number(spendRows[0]?.spend ?? 0);
    const clicks = Number(spendRows[0]?.clicks ?? 0);

    if (spend <= 0) {
      return emptyUnavailable();
    }

    const orderRows = (await sql`
      SELECT
        o.order_id,
        o.total::float AS total,
        o.attribution
      FROM orders o
      WHERE o.status IN ('paid', 'shipped')
        AND COALESCE(o.paid_at, o.created_at) >= ${start}::timestamptz
        AND COALESCE(o.paid_at, o.created_at) < ${end}::timestamptz
        AND NOT EXISTS (
          SELECT 1 FROM finance_transactions ft
          WHERE ft.psl_order_id = o.order_id
            AND ft.reporting_excluded = true
        )
        AND (
          LOWER(COALESCE(o.attribution->>'utmMedium', '')) IN
            ('cpc', 'paid_social', 'display', 'sponsored', 'ppc')
          OR LOWER(COALESCE(o.attribution->>'utmSource', '')) IN
            ('meta', 'facebook', 'instagram', 'tiktok', 'google', 'bing', 'x', 'reddit')
        )
    `) as Array<{
      order_id: string;
      total: number;
      attribution: Record<string, unknown> | null;
    }>;

    const orders = orderRows.length;
    const revenue = orderRows.reduce((s, o) => s + Number(o.total), 0);
    const cac = orders > 0 ? spend / orders : null;
    const roas = spend > 0 ? revenue / spend : null;

    const campaignRows = (await sql`
      SELECT
        platform,
        campaign_id,
        MAX(campaign_name) AS campaign_name,
        COALESCE(SUM(spend_usd), 0)::float AS spend,
        COALESCE(SUM(clicks), 0)::bigint AS clicks
      FROM paid_acquisition_daily
      WHERE date >= ${period.labelStart}::date
        AND date <= ${period.labelEnd}::date
      GROUP BY platform, campaign_id
      ORDER BY spend DESC
      LIMIT 25
    `) as Array<{
      platform: string;
      campaign_id: string;
      campaign_name: string;
      spend: number;
      clicks: number;
    }>;

    const measurementWarnings: string[] = [];
    let topCampaign: string | null = null;
    let bestRoas = -1;

    const campaignKeys = campaignRows.map((c) => ({
      key: `${c.platform}:${c.campaign_id}`,
      platform: c.platform,
      campaignId: c.campaign_id,
      campaignName: c.campaign_name,
      utmCampaign: c.campaign_name,
    }));
    const campaignStats = new Map<
      string,
      { orders: number; revenue: number }
    >();
    for (const c of campaignKeys) {
      campaignStats.set(c.key, { orders: 0, revenue: 0 });
    }

    for (const o of orderRows) {
      const attr = o.attribution ?? {};
      const assign = assignOrderToUniqueCampaign(
        {
          utmSource: attr.utmSource as string | null,
          utmMedium: attr.utmMedium as string | null,
          utmCampaign: attr.utmCampaign as string | null,
          utmContent: attr.utmContent as string | null,
          campaignId:
            typeof attr.campaignId === "string" ? attr.campaignId : null,
        },
        campaignKeys
      );
      if (assign.status === "matched") {
        const stats = campaignStats.get(assign.campaign.key);
        if (stats) {
          stats.orders += 1;
          stats.revenue += Number(o.total);
        }
      } else if (assign.status === "ambiguous") {
        measurementWarnings.push(
          `AMBIGUOUS attribution for order ${o.order_id}; assigned to no campaign.`
        );
      }
    }

    for (const c of campaignRows) {
      const key = `${c.platform}:${c.campaign_id}`;
      const stats = campaignStats.get(key) ?? { orders: 0, revenue: 0 };
      if (Number(c.spend) > 0 && stats.orders === 0) {
        measurementWarnings.push(
          `Platform spend without matched PSL campaign: ${c.platform}/${c.campaign_name || c.campaign_id}`
        );
      }
      const campRoas =
        Number(c.spend) > 0 ? stats.revenue / Number(c.spend) : 0;
      if (
        hasEnoughEvidenceForPerformanceConclusion({
          clicks: Number(c.clicks),
          spendUsd: Number(c.spend),
          orders: stats.orders,
        }) &&
        campRoas > bestRoas
      ) {
        bestRoas = campRoas;
        topCampaign = `${normalizePaidPlatform(c.platform)} · ${c.campaign_name || c.campaign_id}`;
      }
    }

    return {
      status: "available",
      message:
        "Paid spend from synced platform rows; orders/revenue from PSL Neon. Contribution economics: insufficient data.",
      spendUsd: spend,
      sessionsOrClicks: clicks,
      attributedOrders: orders,
      attributedRevenueUsd: revenue,
      cacUsd: cac,
      roas,
      winners: topCampaign ? [topCampaign] : [],
      losers: [],
      measurementWarnings: measurementWarnings.slice(0, 5),
      topCampaign,
      contributionEconomics: "insufficient data",
    };
  } catch {
    return emptyUnavailable();
  }
}
