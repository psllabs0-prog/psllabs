import { createHash } from "node:crypto";
import { ensureSqlSchema, getSql } from "@/lib/db/sql";
import { ensureOrdersSchema } from "@/lib/orders/store";
import { ensureFinanceSchema } from "@/lib/finance/schema";
import type { ShippingNotificationStatus } from "./shipping-flow-types";

export const privateDigest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export async function ensureShippingFlowSchema() {
  await ensureSqlSchema("fulfillment-shipping-flow", async () => {
    await ensureOrdersSchema();
    const sql = getSql();
    await sql`CREATE TABLE IF NOT EXISTS fulfillment_label_previews (
      token_hash TEXT PRIMARY KEY, order_id TEXT NOT NULL, fingerprint TEXT NOT NULL,
      postage_usd NUMERIC(10,2) NOT NULL, expires_at TIMESTAMPTZ NOT NULL,
      consumed_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
    await sql`CREATE INDEX IF NOT EXISTS fulfillment_preview_order_idx ON fulfillment_label_previews(order_id, expires_at)`;
    await sql`CREATE TABLE IF NOT EXISTS fulfillment_tracking_outbox (
      order_id TEXT PRIMARY KEY, tracking_number TEXT NOT NULL, carrier TEXT NOT NULL,
      recipient_hash TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
      claimed_at TIMESTAMPTZ, sent_at TIMESTAMPTZ, last_error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
  });
}

/** Fail closed when accounting tables are unavailable; do not rely on a UI bucket. */
export async function shippingPaymentBlocked(orderId: string): Promise<boolean> {
  await ensureFinanceSchema();
  const sql = getSql();
  const rows = await sql`SELECT 1 AS blocked WHERE EXISTS (
    SELECT 1 FROM finance_transactions WHERE psl_order_id = ${orderId} AND reporting_excluded = true
  ) OR EXISTS (
    SELECT 1 FROM finance_reconciliation_warnings WHERE psl_order_id = ${orderId} AND status = 'open'
  )`;
  return rows.length > 0;
}

export async function saveLabelPreview(input: { token: string; orderId: string; fingerprint: string; postageUsd: number; expiresAt: string }) {
  await ensureShippingFlowSchema();
  const sql = getSql();
  await sql`INSERT INTO fulfillment_label_previews(token_hash, order_id, fingerprint, postage_usd, expires_at)
    VALUES(${privateDigest(input.token)}, ${input.orderId}, ${input.fingerprint}, ${input.postageUsd}, ${input.expiresAt}::timestamptz)`;
}

/** Single-use token is server stored, time bounded, order-bound and never contains PII. */
export async function consumeLabelPreview(orderId: string, token: string) {
  await ensureShippingFlowSchema();
  const sql = getSql();
  const rows = await sql`UPDATE fulfillment_label_previews SET consumed_at = now()
    WHERE token_hash = ${privateDigest(token)} AND order_id = ${orderId}
      AND expires_at > now() AND consumed_at IS NULL
    RETURNING fingerprint, postage_usd`;
  if (rows.length !== 1) throw new Error("The label preview expired or was already used. Check label status before preparing again.");
  return { fingerprint: String(rows[0].fingerprint), postageUsd: Number(rows[0].postage_usd) };
}

/** Tracking and its outbox entry commit in one PostgreSQL statement, before any send. */
export async function saveTrackingAndQueue(input: { orderId: string; trackingNumber: string; carrier: string; recipientHash: string; recipientEmail: string; markShipped?: boolean }) {
  await ensureShippingFlowSchema();
  const sql = getSql();
  const rows = await sql`WITH tracked AS (
    UPDATE orders SET tracking_number = ${input.trackingNumber}, tracking_carrier = ${input.carrier},
      tracking_saved_at = COALESCE(tracking_saved_at, now()), updated_at = now(),
      status = CASE WHEN ${Boolean(input.markShipped)} THEN 'shipped' ELSE status END,
      shipped_at = CASE WHEN ${Boolean(input.markShipped)} THEN COALESCE(shipped_at, now()) ELSE shipped_at END
    WHERE order_id = ${input.orderId} AND status IN ('paid', 'shipped')
      AND (tracking_number IS NULL OR trim(tracking_number) = '' OR tracking_number = ${input.trackingNumber})
      AND (tracking_carrier IS NULL OR trim(tracking_carrier) = '' OR tracking_carrier = ${input.carrier})
      AND lower(trim(email)) = ${input.recipientEmail.trim().toLowerCase()}
      AND NOT EXISTS (SELECT 1 FROM fulfillment_tracking_outbox existing
        WHERE existing.order_id = orders.order_id AND (existing.tracking_number <> ${input.trackingNumber}
          OR existing.recipient_hash <> ${input.recipientHash} OR existing.carrier <> ${input.carrier}))
    RETURNING order_id, tracking_email_sent
  ) INSERT INTO fulfillment_tracking_outbox(order_id, tracking_number, carrier, recipient_hash, status)
    SELECT order_id, ${input.trackingNumber}, ${input.carrier}, ${input.recipientHash},
      CASE WHEN tracking_email_sent THEN 'sent' ELSE 'pending' END FROM tracked
    ON CONFLICT(order_id) DO UPDATE SET updated_at = now()
      WHERE fulfillment_tracking_outbox.tracking_number = EXCLUDED.tracking_number
        AND fulfillment_tracking_outbox.recipient_hash = EXCLUDED.recipient_hash
        AND fulfillment_tracking_outbox.carrier = EXCLUDED.carrier
    RETURNING order_id`;
  if (rows.length !== 1) throw new Error("Tracking differs from an existing shipment or this order is no longer eligible. Review without purchasing again.");
}

export async function getTrackingNotification(orderId: string): Promise<ShippingNotificationStatus | null> {
  await ensureShippingFlowSchema();
  const sql = getSql();
  // A server crash during SMTP is ambiguous. Never release it to an automatic retry.
  await sql`UPDATE fulfillment_tracking_outbox SET status = 'needs_review',
    last_error = 'Email delivery was interrupted. Check Sent mail before attempting another notification.', updated_at = now()
    WHERE order_id = ${orderId} AND status = 'sending' AND claimed_at < now() - interval '5 minutes'`;
  const rows = await sql`SELECT status, last_error FROM fulfillment_tracking_outbox WHERE order_id = ${orderId}`;
  if (!rows.length) return null;
  return { status: String(rows[0].status) as ShippingNotificationStatus["status"], lastError: rows[0].last_error ? String(rows[0].last_error) : null };
}

export async function claimTrackingNotification(orderId: string, tracking: string, recipientHash: string, recipientEmail: string): Promise<boolean> {
  await ensureShippingFlowSchema();
  const sql = getSql();
  const rows = await sql`UPDATE fulfillment_tracking_outbox SET status = 'sending', claimed_at = now(), updated_at = now()
    WHERE order_id = ${orderId} AND status = 'pending' AND tracking_number = ${tracking}
      AND recipient_hash = ${recipientHash}
      AND EXISTS (SELECT 1 FROM orders o WHERE o.order_id = ${orderId} AND o.status IN ('paid', 'shipped')
        AND o.tracking_number = ${tracking} AND lower(trim(o.email)) = ${recipientEmail.trim().toLowerCase()})
    RETURNING order_id`;
  return rows.length === 1;
}

export async function finishTrackingNotification(orderId: string) {
  const sql = getSql();
  await sql`WITH sent AS (
    UPDATE fulfillment_tracking_outbox SET status = 'sent', sent_at = now(), last_error = NULL, updated_at = now()
    WHERE order_id = ${orderId} AND status = 'sending' RETURNING order_id
  ) UPDATE orders SET tracking_email_sent = true, updated_at = now() WHERE order_id IN (SELECT order_id FROM sent)`;
}

export async function reviewTrackingNotification(orderId: string) {
  const sql = getSql();
  await sql`UPDATE fulfillment_tracking_outbox SET status = 'needs_review',
    last_error = 'Delivery is unconfirmed. Check Sent mail before resending; no automatic retry will run.', updated_at = now()
    WHERE order_id = ${orderId} AND status = 'sending'`;
}
