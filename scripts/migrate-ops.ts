/**
 * Explicit, idempotent ops migration: exception acknowledgements and
 * Mission Control activity records. Mission Control tables are only ever
 * created here — never by page loads or API reads.
 *
 * Usage:
 *   npm run migrate-ops
 */
import { loadEnvLocal } from "./_env";
import { getSql } from "@/lib/db/sql";
import { OPS_TABLES, ensureOpsSchema } from "@/lib/ops/schema";
import {
  MISSION_CONTROL_TABLES,
  ensureMissionControlSchema,
} from "@/lib/ops/mission-control/schema";

loadEnvLocal();

async function main() {
  console.log("[migrate-ops] applying idempotent schema…");
  await ensureOpsSchema();
  await ensureMissionControlSchema();
  const sql = getSql();
  const expected = [...OPS_TABLES, ...MISSION_CONTROL_TABLES] as string[];
  const tables = (await sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = ANY(${expected})
    ORDER BY table_name
  `) as Array<{ table_name: string }>;

  const found = new Set(tables.map((t) => t.table_name));
  for (const name of expected) {
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
