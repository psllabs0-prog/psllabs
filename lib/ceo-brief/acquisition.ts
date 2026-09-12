import { getSql } from "@/lib/db/sql";
import { ensureFinanceSchema } from "@/lib/finance/schema";
import { ensureOrdersSchema } from "@/lib/orders/store";
import { ensureExternalMetricsSchema } from "@/lib/external-metrics/schema";
import { sumPaidAcquisitionSpendUsd } from "@/lib/external-metrics/store";

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
  try {
    await ensureExternalMetricsSchema();
    const spendAllTime = await sumPaidAcquisitionSpendUsd();
    if (spendAllTime <= 0 || !period) {
      return {
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
      };
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
      return {
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
      };
    }

    // Internal attributed paid orders (UTM medium suggests paid).
    const orderRows = (await sql`
      SELECT
        COUNT(*)::int AS orders,
        COALESCE(SUM(o.total), 0)::float AS revenue
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
            ('meta', 'facebook', 'instagram', 'tiktok', 'google')
        )
    `) as Array<{ orders: number; revenue: number }>;

    const orders = Number(orderRows[0]?.orders ?? 0);
    const revenue = Number(orderRows[0]?.revenue ?? 0);
    const cac = orders > 0 ? spend / orders : null;
    const roas = spend > 0 ? revenue / spend : null;

    return {
      status: "available",
      message: "Paid spend from synced platform rows; orders/revenue from PSL Neon.",
      spendUsd: spend,
      sessionsOrClicks: clicks,
      attributedOrders: orders,
      attributedRevenueUsd: revenue,
      cacUsd: cac,
      roas,
      winners: [],
      losers: [],
    };
  } catch {
    return {
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
    };
  }
}
