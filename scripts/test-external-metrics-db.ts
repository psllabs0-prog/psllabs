/**
 * DB tests for Search Console upsert idempotency.
 * Run: npm run test:external-metrics-db
 */
import { loadEnvLocal } from "./_env";
import { ensureExternalMetricsSchema } from "../lib/external-metrics/schema";
import {
  countSearchConsoleRows,
  upsertSearchConsoleDailyRows,
} from "../lib/external-metrics/store";
import { getSql } from "../lib/db/sql";
import { isBrandSearchQuery } from "../lib/external-metrics/brand";

loadEnvLocal();

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    console.log("[test-external-metrics-db] skipped (no DATABASE_URL)");
    return;
  }

  console.log("[test-external-metrics-db] running…");
  await ensureExternalMetricsSchema();
  const sql = getSql();
  const property = "sc-domain:test-psllabs-upsert.example";
  const date = "2099-01-01";

  await sql`
    DELETE FROM search_console_daily
    WHERE property = ${property}
  `;

  const row = {
    date,
    property,
    page: "https://example.com/guides/test",
    query: "bpc 157 research",
    clicks: 3,
    impressions: 40,
    ctr: 0.075,
    position: 12.5,
    isBrand: isBrandSearchQuery("bpc 157 research"),
  };

  const w1 = await upsertSearchConsoleDailyRows([row]);
  assert(w1 === 1, "first write");
  const mid = await countSearchConsoleRows();

  const w2 = await upsertSearchConsoleDailyRows([
    { ...row, clicks: 5, impressions: 50, ctr: 0.1, position: 11 },
  ]);
  assert(w2 === 1, "second upsert write attempt");

  const rows = (await sql`
    SELECT clicks::float AS clicks, impressions::float AS impressions, COUNT(*)::int AS n
    FROM search_console_daily
    WHERE property = ${property}
      AND date = ${date}::date
      AND page = ${row.page}
      AND query = ${row.query}
    GROUP BY clicks, impressions
  `) as Array<{ clicks: number; impressions: number; n: number }>;

  assert(rows.length === 1, "single row after upsert");
  assert(Number(rows[0].clicks) === 5, "clicks updated");
  assert(Number(rows[0].impressions) === 50, "impressions updated");

  const after = await countSearchConsoleRows();
  // Net count should not grow by more than the first insert relative to mid/after.
  assert(after === mid, "no duplicate row growth on second upsert");

  await sql`
    DELETE FROM search_console_daily
    WHERE property = ${property}
  `;

  console.log("[test-external-metrics-db] all passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
