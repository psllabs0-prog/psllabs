/**
 * Explicit, idempotent support agent schema migration.
 *
 * Usage:
 *   npm run migrate-support
 */
import { loadEnvLocal } from "./_env";
import { getSql } from "@/lib/db/sql";
import {
  SUPPORT_TABLES,
  ensureSupportSchema,
} from "@/lib/support/schema";

loadEnvLocal();

async function main() {
  console.log("[migrate-support] applying idempotent schema…");
  await ensureSupportSchema();
  const sql = getSql();
  const tables = (await sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = ANY(${SUPPORT_TABLES as unknown as string[]})
    ORDER BY table_name
  `) as Array<{ table_name: string }>;

  const found = new Set(tables.map((t) => t.table_name));
  for (const name of SUPPORT_TABLES) {
    if (!found.has(name)) {
      throw new Error(`Expected table missing after migration: ${name}`);
    }
    console.log(`[migrate-support] ok: ${name}`);
  }

  console.log(
    "[migrate-support] note: SUPPORT_AUTO_SEND_ENABLED defaults off — do not enable until ready."
  );
  console.log(
    "[migrate-support] note: mark QA messages TEST/EXCLUDED explicitly in /admin-support (no auto-inference)."
  );
  console.log("[migrate-support] done.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
