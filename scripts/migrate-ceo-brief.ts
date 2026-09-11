/**
 * Explicit, idempotent CEO weekly brief schema migration.
 *
 * Usage:
 *   npm run migrate-ceo-brief
 */
import { loadEnvLocal } from "./_env";
import { getSql } from "@/lib/db/sql";
import {
  CEO_BRIEF_TABLES,
  ensureCeoBriefSchema,
} from "@/lib/ceo-brief/schema";

loadEnvLocal();

async function main() {
  console.log("[migrate-ceo-brief] applying idempotent schema…");
  await ensureCeoBriefSchema();
  const sql = getSql();
  const tables = (await sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = ANY(${CEO_BRIEF_TABLES as unknown as string[]})
    ORDER BY table_name
  `) as Array<{ table_name: string }>;

  const found = new Set(tables.map((t) => t.table_name));
  for (const name of CEO_BRIEF_TABLES) {
    if (!found.has(name)) {
      throw new Error(`Expected table missing after migration: ${name}`);
    }
    console.log(`[migrate-ceo-brief] ok: ${name}`);
  }
  console.log("[migrate-ceo-brief] done.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
