/**
 * Idempotent retention schema migration.
 * Usage: npm run migrate-retention
 */
import { loadEnvLocal } from "./_env";
import { getSql } from "@/lib/db/sql";
import { RETENTION_TABLES, ensureRetentionSchema } from "@/lib/retention/schema";

loadEnvLocal();

async function main() {
  console.log("[migrate-retention] applying idempotent schema…");
  await ensureRetentionSchema();
  const sql = getSql();
  const tables = (await sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = ANY(${RETENTION_TABLES as unknown as string[]})
    ORDER BY table_name
  `) as Array<{ table_name: string }>;
  const found = new Set(tables.map((t) => t.table_name));
  for (const name of RETENTION_TABLES) {
    if (!found.has(name)) throw new Error(`Missing table: ${name}`);
    console.log(`[migrate-retention] ok: ${name}`);
  }
  console.log("[migrate-retention] done.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
