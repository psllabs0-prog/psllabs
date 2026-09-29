/**
 * Explicit, idempotent, additive migration for the approved X post queue.
 * The queue tables are only ever created here (and by the isolated DB test) —
 * never by page loads, API reads, or n8n requests. Inserts no rows: without a
 * control row the queue is paused, and no sample posts are created.
 *
 * Usage (owner, against the intended database only):
 *   npm run migrate-x-publishing
 */
import { loadEnvLocal } from "./_env";
import { getSql } from "@/lib/db/sql";
import { X_PUBLISHING_TABLES, ensureXPublishingSchema } from "@/lib/x-publishing/schema";

loadEnvLocal();

async function main() {
  console.log("[migrate-x-publishing] applying idempotent additive schema…");
  await ensureXPublishingSchema();
  const sql = getSql();
  const expected = [...X_PUBLISHING_TABLES] as string[];
  const tables = (await sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = ANY(${expected})
    ORDER BY table_name
  `) as Array<{ table_name: string }>;
  const found = new Set(tables.map((t) => t.table_name));
  for (const name of expected) {
    if (!found.has(name)) throw new Error(`Expected table missing after migration: ${name}`);
    console.log(`[migrate-x-publishing] ok: ${name}`);
  }
  console.log("[migrate-x-publishing] done. Publishing stays paused until the owner resumes it in /admin-social.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
