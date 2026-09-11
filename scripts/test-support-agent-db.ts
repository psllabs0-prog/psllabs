/**
 * DB fixture tests for support agent — no real customer SMTP/IMAP sends.
 * Run: npx tsx scripts/test-support-agent-db.ts
 */
process.env.SUPPORT_TEST_MODE = "true";
process.env.SUPPORT_AUTO_SEND_ENABLED = "false";

import { loadEnvLocal } from "./_env";
import { getSql } from "@/lib/db/sql";
import { ensureSupportSchema } from "@/lib/support/schema";
import { processInboundEmail, runSupportInboxJob } from "@/lib/support/process";
import type { InboundEmailNormalized } from "@/lib/support/types";

loadEnvLocal();

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function fixture(overrides: Partial<InboundEmailNormalized> = {}): InboundEmailNormalized {
  const id = `test-${Date.now()}-${Math.random().toString(16).slice(2)}@fixture.local`;
  return {
    providerMessageId: id,
    threadKey: `pair:fixture@example.com|coa question`,
    fromEmail: "fixture@example.com",
    fromName: "Fixture",
    toEmail: "support@psllabs.org",
    subject: "Where is the COA?",
    receivedAt: new Date().toISOString(),
    normalizedBody: "Where can I find the certificate of analysis / COA?",
    rawHeadersSummary: null,
    ...overrides,
  };
}

async function cleanupFixtures(sql: ReturnType<typeof getSql>) {
  await sql`
    DELETE FROM support_escalations
    WHERE message_id IN (
      SELECT id FROM support_messages
      WHERE provider_message_id LIKE '%@fixture.local'
         OR from_email = 'fixture@example.com'
    )
  `;
  await sql`
    DELETE FROM support_responses
    WHERE message_id IN (
      SELECT id FROM support_messages
      WHERE provider_message_id LIKE '%@fixture.local'
         OR from_email = 'fixture@example.com'
    )
  `;
  await sql`
    DELETE FROM support_classifications
    WHERE message_id IN (
      SELECT id FROM support_messages
      WHERE provider_message_id LIKE '%@fixture.local'
         OR from_email = 'fixture@example.com'
    )
  `;
  await sql`
    DELETE FROM support_messages
    WHERE provider_message_id LIKE '%@fixture.local'
       OR from_email = 'fixture@example.com'
  `;
  await sql`
    DELETE FROM support_threads
    WHERE from_email = 'fixture@example.com'
  `;
}

async function main() {
  if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
    console.log("[test-support-agent-db] skipped (no DATABASE_URL)");
    return;
  }

  await ensureSupportSchema();
  const sql = getSql();
  await cleanupFixtures(sql);

  try {
    // Migration idempotency
    await ensureSupportSchema();

    const first = fixture();
    const r1 = await processInboundEmail(first);
    assert(!r1.skippedDuplicate, "first insert");
    assert(r1.autoSent === false, "auto-send off — no customer send");
    assert(r1.category === "coa_location", "classified COA");

    const r2 = await processInboundEmail(first);
    assert(r2.skippedDuplicate, "same email never processed twice");

    const refund = fixture({
      providerMessageId: `refund-${Date.now()}@fixture.local`,
      subject: "I want a refund",
      normalizedBody: "Please refund my order immediately.",
      threadKey: `pair:fixture@example.com|refund`,
    });
    const r3 = await processInboundEmail(refund);
    assert(r3.riskLevel === "RED", "refund red");
    assert(r3.escalated, "refund escalated");
    assert(r3.autoSent === false, "no autonomous refund");

    const human = fixture({
      providerMessageId: `dose-${Date.now()}@fixture.local`,
      subject: "Dosing",
      normalizedBody: "What dose should I inject?",
      threadKey: `pair:fixture@example.com|dosing`,
    });
    const r4 = await processInboundEmail(human);
    assert(r4.category === "human_use_request", "human use");
    assert(r4.escalated, "human use escalated");

    const summary = await runSupportInboxJob({
      fixtures: [
        fixture({
          providerMessageId: `job-${Date.now()}@fixture.local`,
          subject: "Bitcoin payment?",
          normalizedBody: "Do you accept bitcoin / BTC?",
          threadKey: `pair:fixture@example.com|btc`,
        }),
      ],
    });
    assert(summary.newMessages >= 1, "job processed fixture");
    assert(summary.autoSent === 0, "job did not auto-send");

    console.log("[test-support-agent-db] all passed.");
  } finally {
    await cleanupFixtures(sql);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
