/**
 * Explicit, idempotent external metrics schema migration.
 *
 * Usage:
 *   npm run migrate-external-metrics
 */
import { loadEnvLocal } from "./_env";
import { getSql } from "@/lib/db/sql";
import {
  EXTERNAL_METRICS_TABLES,
  ensureExternalMetricsSchema,
} from "@/lib/external-metrics/schema";

loadEnvLocal();

async function main() {
  console.log("[migrate-external-metrics] applying idempotent schema…");
  await ensureExternalMetricsSchema();
  const sql = getSql();
  const tables = (await sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = ANY(${EXTERNAL_METRICS_TABLES as unknown as string[]})
    ORDER BY table_name
  `) as Array<{ table_name: string }>;

  const found = new Set(tables.map((t) => t.table_name));
  for (const name of EXTERNAL_METRICS_TABLES) {
    if (!found.has(name)) {
      throw new Error(`Expected table missing after migration: ${name}`);
    }
    console.log(`[migrate-external-metrics] ok: ${name}`);
  }
  console.log("[migrate-external-metrics] done.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
