/**
 * Explicit, idempotent inventory monitor / pipeline schema migration.
 *
 * Usage:
 *   npm run migrate-inventory-monitor
 */
import { loadEnvLocal } from "./_env";
import { getSql } from "@/lib/db/sql";
import { ensureInventoryMonitorSchema } from "@/lib/inventory/monitor/schema";

loadEnvLocal();

const EXPECTED_TABLES = [
  "inventory_pipeline_lots",
  "inventory_monitor_baselines",
  "inventory_monitor_snapshots",
  "inventory_monitor_alert_states",
] as const;

async function main() {
  console.log("[migrate-inventory-monitor] applying idempotent schema…");
  await ensureInventoryMonitorSchema();

  const sql = getSql();
  const tables = (await sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = ANY(${EXPECTED_TABLES as unknown as string[]})
    ORDER BY table_name
  `) as Array<{ table_name: string }>;

  const found = new Set(tables.map((t) => t.table_name));
  for (const name of EXPECTED_TABLES) {
    if (!found.has(name)) {
      throw new Error(`Expected table missing after migration: ${name}`);
    }
    console.log(`[migrate-inventory-monitor] ok: ${name}`);
  }

  const fns = (await sql`
    SELECT proname
    FROM pg_proc
    WHERE proname IN ('inventory_increment_stock', 'inventory_release_pipeline_lot')
  `) as Array<{ proname: string }>;
  const fnSet = new Set(fns.map((f) => f.proname));
  for (const name of [
    "inventory_increment_stock",
    "inventory_release_pipeline_lot",
  ]) {
    if (!fnSet.has(name)) {
      throw new Error(`Expected function missing: ${name}`);
    }
    console.log(`[migrate-inventory-monitor] ok: function ${name}`);
  }

  console.log(
    "[migrate-inventory-monitor] note: do NOT seed inbound lots from projected post-release totals."
  );
  console.log("[migrate-inventory-monitor] done.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
