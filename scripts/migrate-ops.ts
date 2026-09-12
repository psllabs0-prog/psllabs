/**
 * Explicit, idempotent ops exception acknowledgements migration.
 *
 * Usage:
 *   npm run migrate-ops
 */
import { loadEnvLocal } from "./_env";
import { getSql } from "@/lib/db/sql";
import { OPS_TABLES, ensureOpsSchema } from "@/lib/ops/schema";

loadEnvLocal();

async function main() {
  console.log("[migrate-ops] applying idempotent schema…");
  await ensureOpsSchema();
  const sql = getSql();
  const tables = (await sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = ANY(${OPS_TABLES as unknown as string[]})
    ORDER BY table_name
  `) as Array<{ table_name: string }>;

  const found = new Set(tables.map((t) => t.table_name));
  for (const name of OPS_TABLES) {
    if (!found.has(name)) {
      throw new Error(`Expected table missing after migration: ${name}`);
    }
    console.log(`[migrate-ops] ok: ${name}`);
  }
  console.log("[migrate-ops] done.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
