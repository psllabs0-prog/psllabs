/**
 * Idempotent fulfillment schema migration.
 * Usage: npm run migrate-fulfillment
 */
import { loadEnvLocal } from "./_env";
import { getSql } from "@/lib/db/sql";
import {
  FULFILLMENT_TABLES,
  ensureFulfillmentSchema,
} from "@/lib/fulfillment/schema";

loadEnvLocal();

async function main() {
  console.log("[migrate-fulfillment] applying idempotent schema…");
  await ensureFulfillmentSchema();
  const sql = getSql();
  const tables = (await sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = ANY(${FULFILLMENT_TABLES as unknown as string[]})
    ORDER BY table_name
  `) as Array<{ table_name: string }>;
  const found = new Set(tables.map((t) => t.table_name));
  for (const name of FULFILLMENT_TABLES) {
    if (!found.has(name)) throw new Error(`Missing table: ${name}`);
    console.log(`[migrate-fulfillment] ok: ${name}`);
  }
  console.log("[migrate-fulfillment] done.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
