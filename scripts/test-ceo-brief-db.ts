/**
 * DB tests for CEO brief email claim/sent lifecycle.
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
  getCeoBriefById,
  getCeoBriefForPeriod,
  setCeoBriefEmailClaimForTests,
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
    // --- Generate without email never claims delivery ---
    const noEmail = await generateWeeklyCeoBrief({
      asOf,
      regenerate: true,
      sendEmail: false,
    });
    assert(noEmail.emailSent === false, "generate-only does not send");
    let row = await getCeoBriefById(noEmail.row.id);
    assert(row?.emailSentAt == null, "generate-only leaves email_sent_at NULL");
    assert(
      row?.emailSendClaimedAt == null,
      "generate-only never claims delivery"
    );
    assert(row?.emailSendLastError == null, "generate-only no last error");

    // --- SMTP failure leaves email_sent_at NULL + releases claim ---
    const fail = await generateWeeklyCeoBrief({
      asOf,
      regenerate: true,
      sendEmail: true,
      sendFn: async () => {
        throw new Error("SMTP unavailable during test");
      },
    });
    assert(fail.emailSent === false, "SMTP throw → not sent");
    row = await getCeoBriefById(fail.row.id);
    assert(row?.emailSentAt == null, "1: SMTP failure leaves email_sent_at NULL");
    assert(row?.emailSendClaimedAt == null, "2: SMTP failure releases claim");
    assert(
      /SMTP unavailable/i.test(row?.emailSendLastError ?? ""),
      "failure records concise error"
    );

    // --- SMTP-not-configured remains retryable ---
    const notConfigured = await generateWeeklyCeoBrief({
      asOf,
      regenerate: false,
      sendEmail: true,
      sendFn: async () => ({
        sent: false,
        skippedReason: "SMTP not configured",
      }),
    });
    assert(notConfigured.emailSent === false, "9: not configured → not sent");
    row = await getCeoBriefById(notConfigured.row.id);
    assert(row?.emailSentAt == null, "9: not configured remains retryable");
    assert(row?.emailSendClaimedAt == null, "9: claim released");
    assert(
      /SMTP not configured/i.test(row?.emailSendLastError ?? ""),
      "9: records skipped reason"
    );

    // --- Later retry can succeed ---
    const ok = await generateWeeklyCeoBrief({
      asOf,
      regenerate: false,
      sendEmail: true,
      sendFn: async () => ({ sent: true }),
    });
    assert(ok.emailSent === true, "3: later retry succeeds");
    row = await getCeoBriefById(ok.row.id);
    assert(row?.emailSentAt != null, "4: successful send sets email_sent_at");
    assert(row?.emailSendClaimedAt == null, "success clears claim");
    assert(row?.emailSendLastError == null, "success clears last error");
    const confirmedSentAt = row!.emailSentAt;

    // --- Successful brief cannot send twice ---
    const dup = await generateWeeklyCeoBrief({
      asOf,
      regenerate: false,
      sendEmail: true,
      sendFn: async () => ({ sent: true }),
    });
    assert(dup.emailSent === false, "5: no second send");
    assert(
      dup.emailSkippedReason === "duplicate weekly send prevented",
      "5: duplicate prevented"
    );
    const claimAfterSent = await claimCeoBriefEmailSend(row!.id);
    assert(claimAfterSent === false, "5: claim fails after confirmed send");

    // --- Regeneration does not clear confirmed email_sent_at ---
    const regen = await generateWeeklyCeoBrief({
      asOf,
      regenerate: true,
      sendEmail: false,
    });
    row = await getCeoBriefById(regen.row.id);
    assert(
      row?.emailSentAt === confirmedSentAt,
      "10: regeneration preserves email_sent_at"
    );
    assert(
      row?.emailSendClaimedAt == null,
      "10: generate-only after sent still no claim"
    );

    // Fresh period for concurrency / stale claim tests
    await sql`
      DELETE FROM ceo_weekly_briefs
      WHERE period_start = ${period.periodStart.toISOString()}::timestamptz
        AND period_end = ${period.periodEnd.toISOString()}::timestamptz
    `;

    const base = await generateWeeklyCeoBrief({
      asOf,
      regenerate: true,
      sendEmail: false,
    });
    const id = base.row.id;

    // --- Concurrent claims allow only one sender ---
    const c1 = await claimCeoBriefEmailSend(id);
    const c2 = await claimCeoBriefEmailSend(id);
    assert(c1 === true, "6: first claim wins");
    assert(c2 === false, "6: second concurrent claim blocked");

    // --- Stale claim can be reclaimed ---
    const stale = new Date(Date.now() - 20 * 60 * 1000);
    await setCeoBriefEmailClaimForTests(id, stale);
    const c3 = await claimCeoBriefEmailSend(id, { staleMinutes: 15 });
    assert(c3 === true, "7: stale claim can be reclaimed");

    // Release live claim from c3, then confirm send path
    await setCeoBriefEmailClaimForTests(id, null);
    const finalSend = await generateWeeklyCeoBrief({
      asOf,
      regenerate: false,
      sendEmail: true,
      sendFn: async () => ({ sent: true }),
    });
    assert(finalSend.emailSent === true, "stale reclaim path can complete send");
    row = await getCeoBriefForPeriod(period.periodStart, period.periodEnd);
    assert(row?.emailSentAt != null, "final confirmed send");

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
