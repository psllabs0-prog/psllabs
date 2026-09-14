/**
 * Explicit, idempotent decision engine schema migration.
 *
 * Usage:
 *   npm run migrate-decision-engine
 */
import { loadEnvLocal } from "./_env";
import { getSql } from "@/lib/db/sql";
import {
  DECISION_ENGINE_TABLES,
  ensureDecisionEngineSchema,
} from "@/lib/decision-engine/schema";

loadEnvLocal();

async function main() {
  console.log("[migrate-decision-engine] applying idempotent schema…");
  await ensureDecisionEngineSchema();
  const sql = getSql();
  const tables = (await sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = ANY(${DECISION_ENGINE_TABLES as unknown as string[]})
    ORDER BY table_name
  `) as Array<{ table_name: string }>;

  const found = new Set(tables.map((t) => t.table_name));
  for (const name of DECISION_ENGINE_TABLES) {
    if (!found.has(name)) {
      throw new Error(`Expected table missing after migration: ${name}`);
    }
    console.log(`[migrate-decision-engine] ok: ${name}`);
  }
  console.log("[migrate-decision-engine] done.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
