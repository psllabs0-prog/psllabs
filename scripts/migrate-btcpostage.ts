/**
 * Idempotent BTCPostage label schema migration.
 * Usage: npm run migrate-btcpostage
 */
import { loadEnvLocal } from "./_env";
import { getSql } from "@/lib/db/sql";
import {
  BTCPOSTAGE_TABLES,
  ensureBtcpostageSchema,
} from "@/lib/btcpostage/schema";

loadEnvLocal();

async function main() {
  console.log("[migrate-btcpostage] applying idempotent schema…");
  await ensureBtcpostageSchema();
  const sql = getSql();
  const tables = (await sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = ANY(${BTCPOSTAGE_TABLES as unknown as string[]})
    ORDER BY table_name
  `) as Array<{ table_name: string }>;
  const found = new Set(tables.map((t) => t.table_name));
  for (const name of BTCPOSTAGE_TABLES) {
    if (!found.has(name)) throw new Error(`Missing table: ${name}`);
    console.log(`[migrate-btcpostage] ok: ${name}`);
  }
  console.log("[migrate-btcpostage] done.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
