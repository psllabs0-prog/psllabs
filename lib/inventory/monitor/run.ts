import { getSql } from "@/lib/db/sql";
import { LOW_STOCK_THRESHOLD } from "@/lib/inventory/constants";
import { ensureInventorySchema } from "@/lib/inventory/store";
import { getActiveCatalogProducts } from "@/lib/products/catalog";
import { sendInventoryMonitorAlertEmail } from "@/lib/email/inventory-monitor-alert";

import {
  enterAlertState,
  getOpenAlertKeys,
  resolveAlertState,
  type AlertKey,
} from "./alerts";
import { ensureInventoryBaseline } from "./baselines";
import { computeSkuDemandMetrics } from "./demand";
import {
  buildSkuMonitorMetrics,
  type SkuMonitorMetrics,
} from "./metrics";
import {
  listOpenPipelineLotsForSku,
  sumPipelineBySku,
} from "./pipeline";
import { ensureInventoryMonitorSchema } from "./schema";
import { syncInventoryMonitorSheet } from "./sheets";

export type InventoryMonitorRunSummary = {
  asOf: string;
  skuCount: number;
  snapshotsWritten: number;
  alertsSent: number;
  alertsFailed: number;
  alertsResolved: number;
  sheets: { synced: number; failed: boolean; error?: string };
  metrics: SkuMonitorMetrics[];
};

function alertKeysFromMetrics(m: SkuMonitorMetrics): AlertKey[] {
  const keys: AlertKey[] = [];
  if (m.statusFlags.includes("ABSOLUTE_LOW_STOCK")) {
    keys.push("absolute_low_stock");
  }
  if (m.statusFlags.includes("REORDER_REVIEW")) {
    keys.push("reorder_review");
  }
  if (m.statusFlags.includes("DEPLETION_WATCH")) {
    keys.push("depletion_watch");
  }
  return keys;
}

const ALL_ALERT_KEYS: AlertKey[] = [
  "absolute_low_stock",
  "reorder_review",
  "depletion_watch",
];

async function writeSnapshot(
  asOfDate: string,
  m: SkuMonitorMetrics
): Promise<void> {
  const sql = getSql();
  await sql`
    INSERT INTO inventory_monitor_snapshots (
      snapshot_date,
      sku,
      sellable_stock,
      ordered_inbound,
      in_transit,
      awaiting_testing,
      sold_7d,
      sold_14d,
      sold_28d,
      valid_orders_28d,
      avg_7d,
      avg_14d,
      avg_28d,
      planning_velocity,
      days_supply,
      risk_adjusted_days_supply,
      projected_stockout_at,
      reorder_review_at,
      baseline_stock,
      depletion_pct,
      monitor_status
    ) VALUES (
      ${asOfDate}::date,
      ${m.sku},
      ${m.sellableStock},
      ${m.orderedInbound},
      ${m.inTransit},
      ${m.awaitingTesting},
      ${m.sold7d},
      ${m.sold14d},
      ${m.sold28d},
      ${m.validOrders28d},
      ${m.avg7d},
      ${m.avg14d},
      ${m.avg28d},
      ${m.planningVelocity},
      ${m.daysSupply},
      ${m.riskAdjustedDaysSupply},
      ${m.projectedStockoutAt},
      ${m.reorderReviewAt},
      ${m.baselineStock},
      ${m.depletionPct},
      ${m.monitorStatus}
    )
    ON CONFLICT (snapshot_date, sku) DO UPDATE SET
      sellable_stock = EXCLUDED.sellable_stock,
      ordered_inbound = EXCLUDED.ordered_inbound,
      in_transit = EXCLUDED.in_transit,
      awaiting_testing = EXCLUDED.awaiting_testing,
      sold_7d = EXCLUDED.sold_7d,
      sold_14d = EXCLUDED.sold_14d,
      sold_28d = EXCLUDED.sold_28d,
      valid_orders_28d = EXCLUDED.valid_orders_28d,
      avg_7d = EXCLUDED.avg_7d,
      avg_14d = EXCLUDED.avg_14d,
      avg_28d = EXCLUDED.avg_28d,
      planning_velocity = EXCLUDED.planning_velocity,
      days_supply = EXCLUDED.days_supply,
      risk_adjusted_days_supply = EXCLUDED.risk_adjusted_days_supply,
      projected_stockout_at = EXCLUDED.projected_stockout_at,
      reorder_review_at = EXCLUDED.reorder_review_at,
      baseline_stock = EXCLUDED.baseline_stock,
      depletion_pct = EXCLUDED.depletion_pct,
      monitor_status = EXCLUDED.monitor_status
  `;
}

export async function computeInventoryMonitorMetrics(
  asOf: Date = new Date()
): Promise<SkuMonitorMetrics[]> {
  await ensureInventorySchema();
  await ensureInventoryMonitorSchema();

  const sql = getSql();
  const products = getActiveCatalogProducts();
  const [demandRows, pipelineBySku, stockRowsRaw] = await Promise.all([
    computeSkuDemandMetrics(asOf),
    sumPipelineBySku(),
    sql`
      SELECT handle, sku, stock, name
      FROM products
      WHERE handle = ANY(${products.map((p) => p.handle)})
    `,
  ]);
  const stockRows = stockRowsRaw as Array<{
    handle: string;
    sku: string | null;
    stock: number;
    name: string;
  }>;

  const stockByHandle = new Map(
    stockRows.map((r) => [r.handle, r] as const)
  );
  const demandByHandle = new Map(demandRows.map((d) => [d.handle, d] as const));

  const metrics: SkuMonitorMetrics[] = [];
  for (const product of products) {
    const stockRow = stockByHandle.get(product.handle);
    const sellable = stockRow?.stock ?? 0;
    const demand = demandByHandle.get(product.handle) ?? {
      handle: product.handle,
      sku: product.sku,
      sold7d: 0,
      sold14d: 0,
      sold28d: 0,
      validOrders28d: 0,
      lifetimeSold: 0,
      firstValidSaleAt: null,
      observedSellingDays: null,
      shareOfValidUnits28d: null,
    };
    const pipeline = pipelineBySku.get(product.sku) ?? {
      ordered: 0,
      inTransit: 0,
      awaitingTesting: 0,
      released: 0,
    };
    const baselineStock = await ensureInventoryBaseline(product.sku, sellable);
    const openLots = await listOpenPipelineLotsForSku(product.sku);

    metrics.push(
      buildSkuMonitorMetrics({
        productName: product.name,
        sellableStock: sellable,
        pipeline: {
          ordered: pipeline.ordered,
          inTransit: pipeline.inTransit,
          awaitingTesting: pipeline.awaitingTesting,
        },
        openLots,
        demand,
        baselineStock,
        absoluteLowThreshold: LOW_STOCK_THRESHOLD,
        asOf,
      })
    );
  }

  return metrics;
}

export async function runInventoryMonitor(
  options?: { sendAlerts?: boolean; syncSheets?: boolean; asOf?: Date }
): Promise<InventoryMonitorRunSummary> {
  const asOf = options?.asOf ?? new Date();
  const sendAlerts = options?.sendAlerts ?? true;
  const syncSheets = options?.syncSheets ?? true;

  await ensureInventoryMonitorSchema();
  const metrics = await computeInventoryMonitorMetrics(asOf);
  const asOfDate = asOf.toISOString().slice(0, 10);

  let snapshotsWritten = 0;
  for (const m of metrics) {
    await writeSnapshot(asOfDate, m);
    snapshotsWritten += 1;
  }

  let alertsSent = 0;
  let alertsFailed = 0;
  let alertsResolved = 0;

  if (sendAlerts) {
    for (const m of metrics) {
      const active = new Set(alertKeysFromMetrics(m));
      for (const key of ALL_ALERT_KEYS) {
        if (active.has(key)) {
          const { shouldSend } = await enterAlertState({
            sku: m.sku,
            alertKey: key,
            details: {
              monitorStatus: m.monitorStatus,
              sellableStock: m.sellableStock,
              depletionPct: m.depletionPct,
              riskAdjustedDaysSupply: m.riskAdjustedDaysSupply,
            },
          });
          if (shouldSend) {
            try {
              await sendInventoryMonitorAlertEmail({
                sku: m.sku,
                productName: m.productName,
                alertKey: key,
                sellableStock: m.sellableStock,
                monitorStatus: m.monitorStatus,
                details:
                  key === "depletion_watch" && m.depletionPct !== null
                    ? `Depletion ${(m.depletionPct * 100).toFixed(1)}% of baseline ${m.baselineStock}. Sold 7d=${m.sold7d}.`
                    : key === "reorder_review"
                      ? `Risk-adjusted days supply=${m.riskAdjustedDaysSupply?.toFixed(1) ?? "n/a"}. Planning velocity=${m.planningVelocity?.toFixed(3) ?? "n/a"}.`
                      : `Sellable ${m.sellableStock} below absolute threshold ${LOW_STOCK_THRESHOLD}.`,
              });
              alertsSent += 1;
            } catch (error) {
              alertsFailed += 1;
              console.error(
                `[inventory-monitor] alert email failed ${m.sku}/${key}:`,
                error instanceof Error ? error.message : error
              );
            }
          }
        } else {
          const open = await getOpenAlertKeys(m.sku);
          if (open.has(key)) {
            await resolveAlertState(m.sku, key);
            alertsResolved += 1;
          }
        }
      }
    }
  }

  const sheets = syncSheets
    ? await syncInventoryMonitorSheet(metrics, asOfDate)
    : { synced: 0, failed: false, error: "skipped" };

  return {
    asOf: asOf.toISOString(),
    skuCount: metrics.length,
    snapshotsWritten,
    alertsSent,
    alertsFailed,
    alertsResolved,
    sheets,
    metrics,
  };
}
