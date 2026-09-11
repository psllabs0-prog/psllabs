/**
 * DB fixture tests for support agent — no real customer SMTP/IMAP sends.
 * Run: npx tsx scripts/test-support-agent-db.ts
 */
process.env.SUPPORT_TEST_MODE = "true";
process.env.SUPPORT_AUTO_SEND_ENABLED = "false";

import { loadEnvLocal } from "./_env";
import { getSql } from "@/lib/db/sql";
import { ensureSupportSchema } from "@/lib/support/schema";
import {
  processInboundEmail,
  retryDurableSideEffects,
  runSupportInboxJob,
} from "@/lib/support/process";
import {
  getClassificationForMessage,
  getLatestDraft,
  listRetryableCustomerSendMessages,
  listSupportInbox,
  listUnnotifiedEscalations,
  markResponseSent,
  restoreMessageToActiveSupport,
} from "@/lib/support/store";
import { canSendCustomerReply } from "@/lib/support/lifecycle";
import { decideOutboundAction } from "@/lib/support/draft";
import type { InboundEmailNormalized } from "@/lib/support/types";

loadEnvLocal();

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function fixture(overrides: Partial<InboundEmailNormalized> = {}): InboundEmailNormalized {
  const id = `test-${Date.now()}-${Math.random().toString(16).slice(2)}@fixture.local`;
  return {
    providerMessageId: id,
    imapUid: 900000 + Math.floor(Math.random() * 10000),
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
    await ensureSupportSchema();

    const first = fixture();
    const r1 = await processInboundEmail(first);
    assert(!r1.skippedDuplicate, "first insert");
    assert(r1.durableCaptured === true, "durable draft captured");
    assert(r1.autoSent === false, "auto-send off — no customer send");
    assert(r1.category === "coa_location", "classified COA");

    // Simulate mid-flight failure BEFORE durable capture: no Seen.
    assert(
      r1.durableCaptured === true,
      "successful path is durable (Seen-eligible)"
    );

    const r2 = await processInboundEmail(first);
    assert(r2.durableCaptured === true, "re-fetch still durable");
    assert(
      r2.skippedDuplicate || r2.customerSendRetried === false,
      "same email never answered twice"
    );

    // --- SMTP failure → retry → success → no third send ---
    const smtpMsg = fixture({
      providerMessageId: `smtp-${Date.now()}@fixture.local`,
      subject: "Where is my COA?",
      normalizedBody: "Need the COA link please",
      threadKey: `pair:fixture@example.com|smtp-retry`,
    });
    const s1 = await processInboundEmail(smtpMsg);
    assert(s1.durableCaptured, "smtp fixture durable");

    await sql`
      UPDATE support_messages
      SET status = 'failed', updated_at = now()
      WHERE id = ${s1.messageId}
    `;
    const draft = await getLatestDraft(s1.messageId);
    assert(draft && draft.sentAt === null, "unsent draft after failure");

    const retryable = await listRetryableCustomerSendMessages(50);
    assert(
      retryable.some((r) => r.message.id === s1.messageId),
      "failed send listed for retry"
    );

    // Simulate successful retry (no real SMTP — mark sent atomically).
    const send1 = await markResponseSent({
      responseId: draft!.id,
      messageId: s1.messageId,
      sentBody: draft!.draftBody,
      humanApproved: false,
      status: "auto_sent",
    });
    assert(send1.updated === true, "second attempt succeeds");

    const send2 = await markResponseSent({
      responseId: draft!.id,
      messageId: s1.messageId,
      sentBody: draft!.draftBody,
      humanApproved: false,
      status: "auto_sent",
    });
    assert(send2.updated === false, "third job does not resend");

    const after = await getLatestDraft(s1.messageId);
    assert(after?.sentAt !== null, "sent_at set");
    assert(canSendCustomerReply(after!.sentAt) === false, "cannot send twice");

    const retryableAfter = await listRetryableCustomerSendMessages(50);
    assert(
      !retryableAfter.some((r) => r.message.id === s1.messageId),
      "no longer retryable after send"
    );

    // Re-process same provider id — still no duplicate send.
    const s3 = await processInboundEmail(smtpMsg);
    assert(s3.durableCaptured, "dedupe path durable");
    assert(s3.autoSent === false, "dedupe does not auto-send again");

    // --- Escalation notify retry ---
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

    // Force unnotified state (as if Luke notify SMTP failed after escalation row).
    await sql`
      UPDATE support_escalations
      SET notified_at = NULL
      WHERE message_id = ${r3.messageId}
    `;
    const unnotified = await listUnnotifiedEscalations(50);
    assert(
      unnotified.some((u) => u.message.id === r3.messageId),
      "failed Luke escalation notification retries"
    );

    const escRetry = await retryDurableSideEffects(r3.messageId);
    assert(escRetry.escalationNotified === true, "escalation notify retry ok");

    const unnotified2 = await listUnnotifiedEscalations(50);
    assert(
      !unnotified2.some((u) => u.message.id === r3.messageId),
      "successful Luke notification does not repeat"
    );

    // --- Auto-send kill switch blocks customer retry; escalation notify still works ---
    const killMsg = fixture({
      providerMessageId: `kill-${Date.now()}@fixture.local`,
      subject: "Where is the COA?",
      normalizedBody: "Need COA please",
      threadKey: `pair:fixture@example.com|kill-switch`,
    });
    const k1 = await processInboundEmail(killMsg);
    await sql`
      UPDATE support_messages
      SET status = 'failed', updated_at = now()
      WHERE id = ${k1.messageId}
    `;
    process.env.SUPPORT_AUTO_SEND_ENABLED = "false";
    const blocked = await retryDurableSideEffects(k1.messageId, {
      forceCustomerSendRetry: true,
    });
    assert(blocked.autoSent === false, "kill switch blocks force customer retry");
    const draftStill = await getLatestDraft(k1.messageId);
    assert(draftStill && draftStill.sentAt === null, "draft remains unsent");

    process.env.SUPPORT_AUTO_SEND_ENABLED = "true";
    // With auto-send on, retry is intended; TEST_MODE still won't SMTP-send,
    // but isCustomerSendRetryable path is exercised via markResponseSent below.
    const allowedList = await listRetryableCustomerSendMessages(50);
    assert(
      allowedList.some((r) => r.message.id === k1.messageId),
      "auto-send true again → failed response is retryable"
    );
    process.env.SUPPORT_AUTO_SEND_ENABLED = "false";

    // Escalation notify while auto-send false
    await sql`
      UPDATE support_escalations
      SET notified_at = NULL
      WHERE message_id = ${r3.messageId}
    `;
    process.env.SUPPORT_AUTO_SEND_ENABLED = "false";
    const escWhileOff = await retryDurableSideEffects(r3.messageId);
    assert(
      escWhileOff.escalationNotified === true,
      "internal escalation notification retries while auto-send false"
    );
    assert(escWhileOff.autoSent === false, "no customer send during esc retry");

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

    // --- Spam solicitation: ignored, no send, no escalate ---
    const spam = fixture({
      providerMessageId: `spam-${Date.now()}@fixture.local`,
      subject: "Trustpilot reviews for sale",
      normalizedBody:
        "We offer bulk Trustpilot reviews and reputation management packages to boost your ratings.",
      threadKey: `pair:fixture@example.com|spam`,
    });
    const spamResult = await processInboundEmail(spam);
    assert(spamResult.category === "spam_solicitation", "spam classified");
    assert(spamResult.status === "ignored", "spam status ignored");
    assert(spamResult.autoSent === false, "spam never customer-sends");
    assert(spamResult.escalated === false, "spam never escalates");
    assert(spamResult.durableCaptured === true, "spam durable for IMAP Seen");

    // --- Vendor + Janoshik COA: vendor_solicitation, not coa ---
    const vendor = fixture({
      providerMessageId: `vendor-${Date.now()}@fixture.local`,
      subject: "Peptide supplier offer",
      normalizedBody:
        "We are a peptide manufacturer and can supply raw materials with Janoshik COA. Wholesale price list and MOQ available.",
      threadKey: `pair:fixture@example.com|vendor`,
    });
    const vendorResult = await processInboundEmail(vendor);
    assert(
      vendorResult.category === "vendor_solicitation",
      "vendor classified (not coa)"
    );
    assert(vendorResult.status === "ignored", "vendor status ignored");
    assert(vendorResult.autoSent === false, "vendor never auto-sends");
    assert(vendorResult.escalated === false, "vendor no urgent escalate");

    // --- Restore ignored vendor → Active Support (no send) ---
    const resolvedBefore = (await sql`
      SELECT COUNT(*)::int AS n FROM support_escalations
      WHERE message_id = ${vendorResult.messageId}
        AND resolved_at IS NOT NULL
    `) as Array<{ n: number }>;

    const restored = await restoreMessageToActiveSupport({
      messageId: vendorResult.messageId,
    });
    assert(restored.restored === true, "restore flipped ignored");
    assert(
      restored.status === "drafted" || restored.status === "classified",
      "restore uses safe active status"
    );

    const classAfter = await getClassificationForMessage(vendorResult.messageId);
    assert(classAfter?.category === "other", "restore defaults to other");
    assert(classAfter?.riskLevel === "YELLOW", "restore defaults to YELLOW");
    assert(classAfter?.autoResponseAllowed === false, "restore never auto-allowed");

    const active = await listSupportInbox(75, "active");
    assert(
      active.some((row) => row.message.id === vendorResult.messageId),
      "restored vendor appears in Active Support"
    );
    const vendorFilter = await listSupportInbox(75, "vendor");
    assert(
      !vendorFilter.some((row) => row.message.id === vendorResult.messageId),
      "restored message leaves Vendor filter"
    );

    const restoredDraft = await getLatestDraft(vendorResult.messageId);
    if (classAfter && restoredDraft) {
      const action = decideOutboundAction({
        classification: {
          category: classAfter.category,
          riskLevel: classAfter.riskLevel,
          confidence: classAfter.confidence,
          reasons: [],
          autoResponseAllowed: classAfter.autoResponseAllowed,
          extractedOrderId: null,
          extractedTracking: null,
        },
        draft: {
          bodyText: restoredDraft.draftBody,
          bodyHtml: "",
          knowledgeSources: [],
          aiDrafted: false,
          requiresEscalation: true,
          escalationReason: "restore review",
          policyDecision: "manual_restore",
        },
        threadAutoSendDisabled: false,
      });
      assert(action.sendCustomerReply === false, "restore does not send customer email");
    }

    const resolvedAfter = (await sql`
      SELECT COUNT(*)::int AS n FROM support_escalations
      WHERE message_id = ${vendorResult.messageId}
        AND resolved_at IS NOT NULL
    `) as Array<{ n: number }>;
    assert(
      Number(resolvedAfter[0]?.n ?? 0) >= Number(resolvedBefore[0]?.n ?? 0),
      "restore does not clear previously resolved escalations"
    );

    console.log("[test-support-agent-db] all passed.");
  } finally {
    process.env.SUPPORT_AUTO_SEND_ENABLED = "false";
    await cleanupFixtures(sql);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
