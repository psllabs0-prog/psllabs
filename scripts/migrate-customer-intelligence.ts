/**
 * Idempotent customer intelligence + Discord schema migration.
 * Does not fabricate feedback, interactions, or trends.
 *
 * Usage: npm run migrate-customer-intelligence
 */
import { loadEnvLocal } from "./_env";
import { getSql } from "@/lib/db/sql";
import {
  CUSTOMER_INTEL_TABLES,
  ensureCustomerIntelligenceSchema,
} from "@/lib/customer-intelligence/schema";
import { ensureDiscordSchema } from "@/lib/discord/store";

loadEnvLocal();

async function main() {
  console.log("[migrate-customer-intelligence] applying…");
  await ensureCustomerIntelligenceSchema();
  await ensureDiscordSchema();
  const sql = getSql();
  const tables = (await sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = ANY(${[
        ...CUSTOMER_INTEL_TABLES,
        "discord_interactions",
        "discord_rate_limits",
        "discord_command_registrations",
        "customer_feedback",
      ] as unknown as string[]})
    ORDER BY table_name
  `) as Array<{ table_name: string }>;
  for (const t of tables) {
    console.log(`[migrate-customer-intelligence] ok: ${t.table_name}`);
  }
  console.log("[migrate-customer-intelligence] done. No fabricated rows.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
