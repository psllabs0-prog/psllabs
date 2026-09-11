import { getSql } from "@/lib/db/sql";

import { ensureInventoryMonitorSchema } from "./schema";

export async function getInventoryBaseline(
  sku: string
): Promise<{ baselineStock: number; source: string; setAt: string } | null> {
  await ensureInventoryMonitorSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT baseline_stock, source, set_at
    FROM inventory_monitor_baselines
    WHERE sku = ${sku}
    LIMIT 1
  `) as { baseline_stock: number; source: string; set_at: string }[];
  const row = rows[0];
  if (!row) return null;
  return {
    baselineStock: row.baseline_stock,
    source: row.source,
    setAt: new Date(row.set_at).toISOString(),
  };
}

export async function resetInventoryBaseline(
  sku: string,
  baselineStock: number,
  source: "pipeline_release" | "manual_stock_increase" | "initial"
): Promise<void> {
  await ensureInventoryMonitorSchema();
  const sql = getSql();
  await sql`
    INSERT INTO inventory_monitor_baselines (sku, baseline_stock, source, set_at, updated_at)
    VALUES (${sku}, ${baselineStock}, ${source}, now(), now())
    ON CONFLICT (sku) DO UPDATE SET
      baseline_stock = EXCLUDED.baseline_stock,
      source = EXCLUDED.source,
      set_at = now(),
      updated_at = now()
  `;
}

/** Ensure a baseline exists; seed from current sellable if missing. */
export async function ensureInventoryBaseline(
  sku: string,
  currentSellable: number
): Promise<number> {
  const existing = await getInventoryBaseline(sku);
  if (existing) return existing.baselineStock;
  await resetInventoryBaseline(sku, currentSellable, "initial");
  return currentSellable;
}
