/**
 * Explicit, idempotent, additive migration for the newsletter welcome journey.
 * Creates only the five newsletter_* tables below (and their indexes). It
 * inserts no rows, never touches newsletter_subscribers or any retention,
 * order, or finance table, and enrolls nobody. The journey stays off until
 * its environment flags are set.
 *
 * Usage (owner, against the intended database only):
 *   npm run migrate-newsletter-welcome
 */
import { loadEnvLocal } from "./_env";
import { getSql } from "@/lib/db/sql";
import { ensureNewsletterWelcomeSchema, NEWSLETTER_WELCOME_TABLES } from "@/lib/newsletter/schema";
import { RETENTION_TABLES } from "@/lib/retention/schema";

loadEnvLocal();

async function main() {
  const sql = getSql();
  const required = [...RETENTION_TABLES] as string[];
  const present = (await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = ANY(${required})
  `) as Array<{ table_name: string }>;
  const missingRetention = required.filter((t) => !present.some((p) => p.table_name === t));
  if (missingRetention.length > 0) {
    throw new Error(`Refusing: existing marketing tables missing (${missingRetention.join(", ")}). Wrong database?`);
  }

  console.log("[migrate-newsletter-welcome] applying idempotent additive schema…");
  await ensureNewsletterWelcomeSchema();
  const expected = [...NEWSLETTER_WELCOME_TABLES] as string[];
  const rows = (await sql`
    SELECT t.table_name,
      (xpath('/row/c/text()', query_to_xml(format('SELECT COUNT(*) AS c FROM %I', t.table_name), false, true, '')))[1]::text::int AS n
    FROM information_schema.tables t
    WHERE t.table_schema = 'public' AND t.table_name = ANY(${expected})
    ORDER BY t.table_name
  `) as Array<{ table_name: string; n: number }>;
  for (const name of expected) {
    const row = rows.find((r) => r.table_name === name);
    if (!row) throw new Error(`Expected table missing after migration: ${name}`);
    console.log(`[migrate-newsletter-welcome] ok: ${name} (${row.n} rows)`);
  }
  console.log("[migrate-newsletter-welcome] done. No rows inserted; the journey stays off until NEWSLETTER_WELCOME_MODE is set.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
