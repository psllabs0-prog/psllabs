/** Durable authorization receipt only; never stores order/address/payment data. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { MANUAL_TEST_RECIPIENT as QA_RECIPIENT } from "./manual-test-constants";

export const QA_RECEIPT_SCHEMA = "psl_fulfillment_qa_receipts";
export const QA_MAIL_AUTHORIZATION = "20261016-lukeghaz-fulfillment-test";
export const QA_MAIL_RECIPIENT_HASH = createHash("sha256").update(QA_RECIPIENT).digest("hex");
export const QA_MAIL_MESSAGE_ID = `<psl-qa-${createHash("sha256").update(QA_MAIL_AUTHORIZATION).digest("hex")}@psllabs.org>`;
export type QaMailReceiptStatus = "claimed" | "smtp_accepted" | "needs_review";
type Query = (text: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;

export function createQaMailAuthorization(query: Query) {
  let ready: Promise<void> | null = null;
  async function ensure() {
    if (!ready) ready = (async () => {
      await query('CREATE SCHEMA IF NOT EXISTS "psl_fulfillment_qa_receipts"');
      const owner = (await query("SELECT oid::text,pg_get_userbyid(nspowner)=current_user AS owned FROM pg_catalog.pg_namespace WHERE nspname=$1", [QA_RECEIPT_SCHEMA])).rows[0];
      assert(owner?.owned === true, "QA authorization receipt namespace must belong to the current operator.");
      await query(`CREATE TABLE IF NOT EXISTS "psl_fulfillment_qa_receipts"."mail_authorizations" (
        authorization_key TEXT PRIMARY KEY, recipient_hash TEXT NOT NULL, message_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('claimed','smtp_accepted','needs_review')),
        claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
      const relations = (await query("SELECT relname,pg_get_userbyid(relowner)=current_user AS owned FROM pg_catalog.pg_class WHERE relnamespace=$1::oid", [owner.oid])).rows;
      assert(relations.every(row => row.owned === true && ["mail_authorizations", "mail_authorizations_pkey"].includes(String(row.relname))), "Unexpected relation in the dedicated QA receipt namespace.");
      const columns = (await query("SELECT attname FROM pg_catalog.pg_attribute WHERE attrelid='psl_fulfillment_qa_receipts.mail_authorizations'::regclass AND attnum>0 AND NOT attisdropped ORDER BY attname")).rows.map(row => String(row.attname));
      assert(JSON.stringify(columns) === JSON.stringify(["authorization_key", "claimed_at", "message_id", "recipient_hash", "status", "updated_at"]), "QA receipt metadata schema differs from the reviewed shape.");
    })();
    await ready;
  }
  async function status(): Promise<QaMailReceiptStatus | null> {
    await ensure();
    const row = (await query('SELECT recipient_hash,message_id,status FROM "psl_fulfillment_qa_receipts"."mail_authorizations" WHERE authorization_key=$1', [QA_MAIL_AUTHORIZATION])).rows[0];
    if (!row) return null;
    assert(row.recipient_hash === QA_MAIL_RECIPIENT_HASH && row.message_id === QA_MAIL_MESSAGE_ID && ["claimed", "smtp_accepted", "needs_review"].includes(String(row.status)), "QA authorization receipt identity differs from the reviewed authorization.");
    return row.status as QaMailReceiptStatus;
  }
  return {
    status,
    async claim(): Promise<boolean> {
      await ensure();
      // Fixed authorization key, independent of schema/nonce/commit. Never reclaimed.
      const rows = (await query(`INSERT INTO "psl_fulfillment_qa_receipts"."mail_authorizations"(authorization_key,recipient_hash,message_id,status)
        VALUES($1,$2,$3,'claimed') ON CONFLICT(authorization_key) DO NOTHING RETURNING authorization_key`,
      [QA_MAIL_AUTHORIZATION, QA_MAIL_RECIPIENT_HASH, QA_MAIL_MESSAGE_ID])).rows;
      if (!rows.length) await status();
      return rows.length === 1;
    },
    async accepted() {
      await query(`UPDATE "psl_fulfillment_qa_receipts"."mail_authorizations" SET status='smtp_accepted',updated_at=now()
        WHERE authorization_key=$1 AND recipient_hash=$2 AND message_id=$3 AND status='claimed'`, [QA_MAIL_AUTHORIZATION, QA_MAIL_RECIPIENT_HASH, QA_MAIL_MESSAGE_ID]);
      assert(await status() === "smtp_accepted", "SMTP acceptance receipt could not be confirmed; never resend blindly.");
    },
    async uncertain() {
      await query(`UPDATE "psl_fulfillment_qa_receipts"."mail_authorizations" SET status='needs_review',updated_at=now()
        WHERE authorization_key=$1 AND recipient_hash=$2 AND message_id=$3 AND status='claimed'`, [QA_MAIL_AUTHORIZATION, QA_MAIL_RECIPIENT_HASH, QA_MAIL_MESSAGE_ID]);
    },
  };
}
