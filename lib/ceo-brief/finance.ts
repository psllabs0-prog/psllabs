import { getSql } from "@/lib/db/sql";
import { ensureFinanceSchema } from "@/lib/finance/schema";
import { listOpenReconciliationWarnings } from "@/lib/finance/store";
import { ensureOrdersSchema } from "@/lib/orders/store";

import {
  formatPctChange,
  type BriefPeriod,
} from "./period";
import type { CeoSalesSnapshot } from "./types";

type PeriodTotals = {
  orders: number;
  grossRevenueUsd: number;
  units: number;
};

async function periodOrderTotals(period: BriefPeriod): Promise<PeriodTotals> {
  await ensureOrdersSchema();
  await ensureFinanceSchema();
  const sql = getSql();
  const start = period.periodStart.toISOString();
  const end = period.periodEnd.toISOString();

  const rows = (await sql`
    WITH valid_orders AS (
      SELECT
        o.order_id,
        o.total,
        o.items
      FROM orders o
      WHERE o.status IN ('paid', 'shipped')
        AND COALESCE(o.paid_at, o.created_at) >= ${start}::timestamptz
        AND COALESCE(o.paid_at, o.created_at) < ${end}::timestamptz
        AND NOT EXISTS (
          SELECT 1
          FROM finance_transactions ft
          WHERE ft.psl_order_id = o.order_id
            AND ft.reporting_excluded = true
        )
    )
    SELECT
      COUNT(*)::int AS orders,
      COALESCE(SUM(total), 0)::float AS gross,
      COALESCE((
        SELECT SUM((elem->>'quantity')::int)
        FROM valid_orders vo
        CROSS JOIN LATERAL jsonb_array_elements(vo.items) AS elem
        WHERE (elem->>'quantity')::int > 0
      ), 0)::int AS units
    FROM valid_orders
  `) as Array<{ orders: number; gross: number; units: number }>;

  return {
    orders: Number(rows[0]?.orders ?? 0),
    grossRevenueUsd: Number(rows[0]?.gross ?? 0),
    units: Number(rows[0]?.units ?? 0),
  };
}

async function revenueBySku(period: BriefPeriod): Promise<
  CeoSalesSnapshot["revenueBySku"]
> {
  await ensureOrdersSchema();
  await ensureFinanceSchema();
  const sql = getSql();
  const start = period.periodStart.toISOString();
  const end = period.periodEnd.toISOString();

  const rows = (await sql`
    WITH valid_orders AS (
      SELECT o.items
      FROM orders o
      WHERE o.status IN ('paid', 'shipped')
        AND COALESCE(o.paid_at, o.created_at) >= ${start}::timestamptz
        AND COALESCE(o.paid_at, o.created_at) < ${end}::timestamptz
        AND NOT EXISTS (
          SELECT 1
          FROM finance_transactions ft
          WHERE ft.psl_order_id = o.order_id
            AND ft.reporting_excluded = true
        )
    )
    SELECT
      COALESCE(elem->>'handle', 'unknown') AS handle,
      COALESCE(elem->>'sku', '') AS sku,
      COALESCE(SUM((elem->>'quantity')::int), 0)::int AS units,
      COALESCE(SUM((elem->>'lineTotal')::float), 0)::float AS revenue
    FROM valid_orders
    CROSS JOIN LATERAL jsonb_array_elements(items) AS elem
    WHERE (elem->>'quantity')::int > 0
    GROUP BY 1, 2
    ORDER BY revenue DESC, units DESC
  `) as Array<{
    handle: string;
    sku: string;
    units: number;
    revenue: number;
  }>;

  return rows.map((r) => ({
    handle: r.handle,
    sku: r.sku || r.handle,
    units: Number(r.units),
    revenueUsd: Number(r.revenue),
  }));
}

async function paymentMix(
  period: BriefPeriod
): Promise<CeoSalesSnapshot["paymentMethodMix"]> {
  await ensureOrdersSchema();
  await ensureFinanceSchema();
  const sql = getSql();
  const start = period.periodStart.toISOString();
  const end = period.periodEnd.toISOString();

  const rows = (await sql`
    SELECT
      COALESCE(o.payment_method, 'unknown') AS method,
      COUNT(*)::int AS orders,
      COALESCE(SUM(o.total), 0)::float AS revenue
    FROM orders o
    WHERE o.status IN ('paid', 'shipped')
      AND COALESCE(o.paid_at, o.created_at) >= ${start}::timestamptz
      AND COALESCE(o.paid_at, o.created_at) < ${end}::timestamptz
      AND NOT EXISTS (
        SELECT 1
        FROM finance_transactions ft
        WHERE ft.psl_order_id = o.order_id
          AND ft.reporting_excluded = true
      )
    GROUP BY 1
    ORDER BY revenue DESC
  `) as Array<{ method: string; orders: number; revenue: number }>;

  return rows.map((r) => ({
    method: r.method,
    orders: Number(r.orders),
    revenueUsd: Number(r.revenue),
  }));
}

function aov(orders: number, revenue: number): number | null {
  if (orders <= 0) return null;
  return revenue / orders;
}

export async function collectSalesSnapshot(
  period: BriefPeriod,
  prior: BriefPeriod
): Promise<CeoSalesSnapshot> {
  const [current, previous, bySku, mix, warnings] = await Promise.all([
    periodOrderTotals(period),
    periodOrderTotals(prior),
    revenueBySku(period),
    paymentMix(period),
    listOpenReconciliationWarnings(25),
  ]);

  return {
    periodLabel: `${period.labelStart} → ${period.labelEnd}`,
    priorPeriodLabel: `${prior.labelStart} → ${prior.labelEnd}`,
    legitimateOrders: current.orders,
    priorLegitimateOrders: previous.orders,
    grossRevenueUsd: current.grossRevenueUsd,
    priorGrossRevenueUsd: previous.grossRevenueUsd,
    netBusinessRevenueUsd: null,
    unitsSold: current.units,
    priorUnitsSold: previous.units,
    aovUsd: aov(current.orders, current.grossRevenueUsd),
    priorAovUsd: aov(previous.orders, previous.grossRevenueUsd),
    revenueBySku: bySku,
    paymentMethodMix: mix,
    refundsUsd: null,
    refundsNote: "Refund totals not available in Neon finance records yet.",
    reconciliationWarnings: warnings.map((w) => ({
      type: w.warningType,
      message: w.message,
      orderId: w.pslOrderId,
    })),
    ordersChangeNote: formatPctChange(current.orders, previous.orders),
    revenueChangeNote: formatPctChange(
      current.grossRevenueUsd,
      previous.grossRevenueUsd
    ),
  };
}
