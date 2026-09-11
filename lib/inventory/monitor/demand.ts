import { getSql } from "@/lib/db/sql";
import { ensureFinanceSchema } from "@/lib/finance/schema";
import { ensureOrdersSchema } from "@/lib/orders/store";
import { getActiveCatalogProducts } from "@/lib/products/catalog";

export type SkuDemandMetrics = {
  handle: string;
  sku: string;
  sold7d: number;
  sold14d: number;
  sold28d: number;
  validOrders28d: number;
  lifetimeSold: number;
  firstValidSaleAt: string | null;
  observedSellingDays: number | null;
  shareOfValidUnits28d: number | null;
};

/**
 * Demand from paid/shipped orders only.
 * Excludes finance_transactions.reporting_excluded = TRUE.
 * Keeps legitimate orders even if finance side-effect row is missing.
 */
export async function computeSkuDemandMetrics(
  asOf: Date = new Date()
): Promise<SkuDemandMetrics[]> {
  await ensureOrdersSchema();
  await ensureFinanceSchema();
  const sql = getSql();
  const asOfIso = asOf.toISOString();

  const rows = (await sql`
    WITH valid_orders AS (
      SELECT
        o.order_id,
        o.items,
        COALESCE(o.paid_at, o.created_at) AS sale_at
      FROM orders o
      WHERE o.status IN ('paid', 'shipped')
        AND COALESCE(o.paid_at, o.created_at) <= ${asOfIso}::timestamptz
        -- Exclude only when a finance row marks reporting_excluded.
        -- Missing finance row still qualifies (side-effect lag must not drop sales).
        AND NOT EXISTS (
          SELECT 1
          FROM finance_transactions ft
          WHERE ft.psl_order_id = o.order_id
            AND ft.reporting_excluded = true
        )
    ),
    exploded AS (
      SELECT
        vo.order_id,
        vo.sale_at,
        elem->>'handle' AS handle,
        (elem->>'quantity')::int AS qty
      FROM valid_orders vo
      CROSS JOIN LATERAL jsonb_array_elements(vo.items) AS elem
      WHERE elem->>'handle' IS NOT NULL
        AND (elem->>'quantity')::int > 0
    )
    SELECT
      handle,
      COALESCE(SUM(qty) FILTER (
        WHERE sale_at >= ${asOfIso}::timestamptz - interval '7 days'
      ), 0)::int AS sold_7d,
      COALESCE(SUM(qty) FILTER (
        WHERE sale_at >= ${asOfIso}::timestamptz - interval '14 days'
      ), 0)::int AS sold_14d,
      COALESCE(SUM(qty) FILTER (
        WHERE sale_at >= ${asOfIso}::timestamptz - interval '28 days'
      ), 0)::int AS sold_28d,
      COUNT(DISTINCT order_id) FILTER (
        WHERE sale_at >= ${asOfIso}::timestamptz - interval '28 days'
      )::int AS valid_orders_28d,
      COALESCE(SUM(qty), 0)::int AS lifetime_sold,
      MIN(sale_at) AS first_valid_sale_at
    FROM exploded
    GROUP BY handle
  `) as Array<{
    handle: string;
    sold_7d: number;
    sold_14d: number;
    sold_28d: number;
    valid_orders_28d: number;
    lifetime_sold: number;
    first_valid_sale_at: string | null;
  }>;

  const byHandle = new Map(rows.map((r) => [r.handle, r]));
  const total28 = rows.reduce((sum, r) => sum + Number(r.sold_28d), 0);

  return getActiveCatalogProducts().map((product) => {
    const row = byHandle.get(product.handle);
    const sold7d = row?.sold_7d ?? 0;
    const sold14d = row?.sold_14d ?? 0;
    const sold28d = row?.sold_28d ?? 0;
    const first = row?.first_valid_sale_at
      ? new Date(row.first_valid_sale_at)
      : null;
    const observedSellingDays = first
      ? Math.max(
          1,
          Math.floor((asOf.getTime() - first.getTime()) / (24 * 60 * 60 * 1000)) +
            1
        )
      : null;

    return {
      handle: product.handle,
      sku: product.sku,
      sold7d,
      sold14d,
      sold28d,
      validOrders28d: row?.valid_orders_28d ?? 0,
      lifetimeSold: row?.lifetime_sold ?? 0,
      firstValidSaleAt: first ? first.toISOString() : null,
      observedSellingDays,
      shareOfValidUnits28d:
        total28 > 0 ? sold28d / total28 : sold28d > 0 ? 1 : null,
    };
  });
}
