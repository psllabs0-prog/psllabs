import assert from "node:assert/strict";
import type { NeonQueryFunction } from "@neondatabase/serverless";
import type { SendMailOptions } from "nodemailer";
import { __setSqlClientForTests } from "../lib/db/sql";
import { __setRetentionTransportForTests, RetentionDeliveryError, sendRetention30dEmail } from "../lib/retention/email";
import { runRetention30dJob } from "../lib/retention/run";
import { claimRetentionSend } from "../lib/retention/store";

process.env.MARKETING_FROM_EMAIL = "updates@psllabs.org";
process.env.MARKETING_POSTAL_ADDRESS = "TEST POSTAL ADDRESS";
process.env.MARKETING_UNSUB_SECRET = "retention-offline-test-only";
process.env.RETENTION_AUTO_SEND_ENABLED = "true";
process.env.RETENTION_TEST_MODE = "false";
process.env.SUPPORT_TEST_MODE = "false";
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;

const recipient = "retention-fixture@example.invalid";
const mail: SendMailOptions[] = [];
const statements: Array<{ text: string; values: unknown[] }> = [];
let claimable = true;
let fixtureCandidates = true;
let confirmationWriteFails = false;
const fakeSql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
  const text = strings.join("?").replace(/\s+/g, " ").trim();
  statements.push({ text, values });
  if (text.startsWith("SELECT o.order_id")) return Promise.resolve(fixtureCandidates ? [{ order_id: "retention-offline-order", email: recipient, paid_at: "2026-01-01T00:00:00Z" }] : []);
  if (text.startsWith("UPDATE retention_email_sends SET claimed_at")) return Promise.resolve(claimable ? [{ id: 4242 }] : []);
  if (text.startsWith("SELECT id, sent_at")) return Promise.resolve([{ id: 4242, sent_at: null }]);
  if (text.startsWith("UPDATE retention_email_sends SET sent_at")) return confirmationWriteFails ? Promise.reject(new Error("Offline database failure after acceptance")) : Promise.resolve([{ id: 4242 }]);
  return Promise.resolve([]);
}) as unknown as NeonQueryFunction<false, false>;
__setSqlClientForTests(fakeSql);

async function main() {
  __setRetentionTransportForTests(async (m) => { mail.push(m); return { accepted: [recipient], rejected: [], response: "250 queued as offline-fixture" }; });
  const accepted = await sendRetention30dEmail({ to: recipient, sendId: 4242 });
  assert.deepEqual(accepted, { sent: true, simulated: false });
  await sendRetention30dEmail({ to: recipient, sendId: 4242 });
  assert.equal(mail[0].messageId, mail[1].messageId, "the persisted send row has a stable message ID");
  const headers = mail[0].headers as Record<string, string>;
  assert.ok(headers["List-Unsubscribe"].includes("/api/marketing/unsubscribe?token="));
  assert.equal(headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");

  for (const [response, expected] of [
    [{ accepted: [], rejected: [recipient] }, "rejected"],
    [{ accepted: [], rejected: [] }, "unknown"],
    [{ accepted: ["other@example.invalid"], rejected: [] }, "unknown"],
  ] as const) {
    __setRetentionTransportForTests(async () => ({ accepted: [...response.accepted], rejected: [...response.rejected] }));
    await assert.rejects(sendRetention30dEmail({ to: recipient, sendId: 4242 }), (e) => e instanceof RetentionDeliveryError && e.outcome === expected);
  }
  for (const [error, expected] of [
    [{ code: "ETIMEDOUT", message: "Timed out after submitting message" }, "unknown"],
    [{ code: "ETIMEDOUT", message: "Connection timeout" }, "failed"],
    [{ responseCode: 550, command: "RCPT TO", message: "Refused" }, "rejected"],
    [{ responseCode: 451, command: "DATA", message: "Temporary refusal" }, "failed"],
  ] as const) {
    __setRetentionTransportForTests(async () => { throw error; });
    await assert.rejects(sendRetention30dEmail({ to: recipient, sendId: 4242 }), (e) => e instanceof RetentionDeliveryError && e.outcome === expected);
  }

  for (const outcome of ["unknown", "rejected", "failed"] as const) {
    statements.length = 0;
    __setRetentionTransportForTests(async () => { throw new RetentionDeliveryError(outcome, "offline-fixture"); });
    const result = await runRetention30dJob();
    assert.equal(result.sent, 0);
    assert.equal(result.failed, 1);
    assert.ok(!statements.some((s) => s.text.includes("SET sent_at = now()")), "refused/unknown submission never becomes sent");
    assert.ok(statements.some((s) => outcome === "failed" ? s.text.includes("status = 'failed'") : s.text.includes("SET status = ?") && s.values.includes(outcome)), "ambiguous and permanent outcomes are held rather than marked retryable");
    assert.ok(statements.some((s) => s.text.includes("AND status IN ('pending', 'failed')") && s.text.includes("marketing_eligible = true") && s.text.includes("reporting_excluded = true")), "claim rechecks consent, suppression, eligible order and test exclusion");
    assert.ok(statements.some((s) => s.text.includes("AND (r.sent_at IS NOT NULL OR r.status IN ('unknown', 'rejected'))")), "held attempts are excluded from new candidates");
  }

  statements.length = 0;
  confirmationWriteFails = true;
  __setRetentionTransportForTests(async () => ({ accepted: [recipient] }));
  const acceptedButNotPersisted = await runRetention30dJob();
  assert.equal(acceptedButNotPersisted.sent, 0);
  assert.ok(statements.some((s) => s.text.includes("SET status = ?") && s.values.includes("unknown")), "database failure after SMTP acceptance holds the message instead of automatically sending it again");
  assert.ok(!statements.some((s) => s.text.includes("status = 'failed'")), "an accepted SMTP submission is never marked retryable");
  confirmationWriteFails = false;

  claimable = false;
  let transportCalls = 0;
  __setRetentionTransportForTests(async () => { transportCalls++; return { accepted: [recipient] }; });
  const held = await claimRetentionSend({ orderId: "retention-offline-order", email: recipient });
  assert.equal(held?.claimed, false);
  const skipped = await runRetention30dJob();
  assert.equal(skipped.skipped, 1);
  assert.equal(transportCalls, 0, "unclaimed or already-held records never submit another message");

  process.env.RETENTION_TEST_MODE = "true";
  statements.length = 0;
  assert.deepEqual(await sendRetention30dEmail({ to: recipient, sendId: 4242 }), { sent: false, simulated: true });
  const testRun = await runRetention30dJob({ force: true });
  assert.equal(testRun.sent, 0);
  assert.equal(statements.length, 0, "test mode does not write or consume production send records");
  assert.equal(transportCalls, 0);
  process.env.RETENTION_TEST_MODE = "false";
  fixtureCandidates = false;
  assert.equal((await runRetention30dJob()).candidates, 0);

  __setRetentionTransportForTests(null);
  __setSqlClientForTests(null);
  console.log("[retention-delivery] Passed SMTP acceptance, ambiguity, stable IDs, consent/test exclusions and held-retry checks. No network, database or emails.");
}
main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
