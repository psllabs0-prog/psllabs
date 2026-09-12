/**
 * Explicit, idempotent authority schema migration.
 *
 * Usage:
 *   npm run migrate-authority
 */
import { loadEnvLocal } from "./_env";
import { getSql } from "@/lib/db/sql";
import {
  AUTHORITY_TABLES,
  ensureAuthoritySchema,
} from "@/lib/authority/schema";

loadEnvLocal();

async function main() {
  console.log("[migrate-authority] applying idempotent schema…");
  await ensureAuthoritySchema();
  const sql = getSql();
  const tables = (await sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = ANY(${AUTHORITY_TABLES as unknown as string[]})
    ORDER BY table_name
  `) as Array<{ table_name: string }>;

  const found = new Set(tables.map((t) => t.table_name));
  for (const name of AUTHORITY_TABLES) {
    if (!found.has(name)) {
      throw new Error(`Expected table missing after migration: ${name}`);
    }
    console.log(`[migrate-authority] ok: ${name}`);
  }
  console.log("[migrate-authority] done. No fake opportunities inserted.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
