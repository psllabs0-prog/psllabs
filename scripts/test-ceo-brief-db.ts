/**
 * DB tests for weekly CEO brief storage + duplicate email prevention.
 * Run: npm run test:ceo-brief-db
 */
process.env.CEO_BRIEF_TEST_MODE = "true";
process.env.SUPPORT_TEST_MODE = "true";

import { loadEnvLocal } from "./_env";
import { getSql } from "@/lib/db/sql";
import { ensureCeoBriefSchema } from "@/lib/ceo-brief/schema";
import { getLastCompletedWeekUtc } from "@/lib/ceo-brief/period";
import { generateWeeklyCeoBrief } from "@/lib/ceo-brief/run";
import {
  claimCeoBriefEmailSend,
  getCeoBriefForPeriod,
} from "@/lib/ceo-brief/store";

loadEnvLocal();

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

async function main() {
  if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
    console.log("[test-ceo-brief-db] skipped (no DATABASE_URL)");
    return;
  }

  await ensureCeoBriefSchema();
  const sql = getSql();
  const asOf = new Date(Date.UTC(2026, 8, 8)); // Monday
  const period = getLastCompletedWeekUtc(asOf);

  await sql`
    DELETE FROM ceo_weekly_briefs
    WHERE period_start = ${period.periodStart.toISOString()}::timestamptz
      AND period_end = ${period.periodEnd.toISOString()}::timestamptz
  `;

  try {
    const first = await generateWeeklyCeoBrief({
      asOf,
      regenerate: true,
      sendEmail: true,
    });
    assert(first.brief.actions.length <= 3, "≤3 actions");
    assert(first.emailSent === true, "test mode first email claimed/sent");
    assert(
      first.brief.acquisition.spendUsd === null,
      "paid spend not fabricated"
    );
    assert(first.brief.seo.clicks === null, "seo not fabricated");
    assert(
      first.brief.inventory.sellableUnitsTotal >= 0,
      "sellable non-negative"
    );

    const second = await generateWeeklyCeoBrief({
      asOf,
      regenerate: true,
      sendEmail: true,
    });
    assert(
      second.emailSkippedReason === "duplicate weekly send prevented" ||
        second.emailSent === false,
      "duplicate weekly send prevented"
    );

    const row = await getCeoBriefForPeriod(period.periodStart, period.periodEnd);
    assert(row?.emailSentAt != null, "email_sent_at stamped");
    const reclaimed = await claimCeoBriefEmailSend(row!.id);
    assert(reclaimed === false, "second claim fails");

    console.log("[test-ceo-brief-db] all passed.");
  } finally {
    await sql`
      DELETE FROM ceo_weekly_briefs
      WHERE period_start = ${period.periodStart.toISOString()}::timestamptz
        AND period_end = ${period.periodEnd.toISOString()}::timestamptz
    `;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
