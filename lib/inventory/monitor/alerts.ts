import { getSql } from "@/lib/db/sql";

import { ensureInventoryMonitorSchema } from "./schema";

export type AlertKey =
  | "absolute_low_stock"
  | "reorder_review"
  | "depletion_watch";

export type AlertRowState = {
  status: "open" | "resolved" | null;
  lastSentAt: string | null;
};

/**
 * Pure send decision for alert lifecycle tests / run loop.
 *
 * - First enter (null/resolved) → send
 * - Open without last_sent_at (prior SMTP failure) → retry send
 * - Open with last_sent_at (successful delivery) → do not resend
 */
export function decideAlertSend(state: AlertRowState): { shouldSend: boolean } {
  if (state.status === "open" && state.lastSentAt) {
    return { shouldSend: false };
  }
  return { shouldSend: true };
}

export async function getOpenAlertKeys(sku: string): Promise<Set<AlertKey>> {
  await ensureInventoryMonitorSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT alert_key
    FROM inventory_monitor_alert_states
    WHERE sku = ${sku} AND status = 'open'
  `) as { alert_key: string }[];
  return new Set(rows.map((r) => r.alert_key as AlertKey));
}

/**
 * Establish (or keep) open alert state.
 * Does NOT set last_sent_at — call markAlertSent only after SMTP success.
 */
export async function enterAlertState(input: {
  sku: string;
  alertKey: AlertKey;
  details?: Record<string, unknown>;
}): Promise<{ shouldSend: boolean }> {
  await ensureInventoryMonitorSchema();
  const sql = getSql();
  const details = input.details ?? null;

  const existing = (await sql`
    SELECT status, last_sent_at
    FROM inventory_monitor_alert_states
    WHERE sku = ${input.sku} AND alert_key = ${input.alertKey}
    LIMIT 1
  `) as { status: string; last_sent_at: string | null }[];

  const row = existing[0];
  const decision = decideAlertSend({
    status: row
      ? (row.status as "open" | "resolved")
      : null,
    lastSentAt: row?.last_sent_at ?? null,
  });

  if (row?.status === "open") {
    await sql`
      UPDATE inventory_monitor_alert_states
      SET details_json = ${details}, updated_at = now()
      WHERE sku = ${input.sku} AND alert_key = ${input.alertKey}
    `;
    return decision;
  }

  // New entry or re-entry after resolve: open, clear last_sent_at until success.
  await sql`
    INSERT INTO inventory_monitor_alert_states (
      sku, alert_key, status, last_sent_at, resolved_at, details_json
    ) VALUES (
      ${input.sku},
      ${input.alertKey},
      'open',
      NULL,
      NULL,
      ${details}
    )
    ON CONFLICT (sku, alert_key) DO UPDATE SET
      status = 'open',
      last_sent_at = NULL,
      resolved_at = NULL,
      details_json = EXCLUDED.details_json,
      updated_at = now()
  `;
  return { shouldSend: true };
}

/** Record successful email delivery; enables no-spam while open. */
export async function markAlertSent(
  sku: string,
  alertKey: AlertKey
): Promise<void> {
  await ensureInventoryMonitorSchema();
  const sql = getSql();
  await sql`
    UPDATE inventory_monitor_alert_states
    SET last_sent_at = now(), updated_at = now()
    WHERE sku = ${sku}
      AND alert_key = ${alertKey}
      AND status = 'open'
  `;
}

export async function resolveAlertState(
  sku: string,
  alertKey: AlertKey
): Promise<void> {
  await ensureInventoryMonitorSchema();
  const sql = getSql();
  await sql`
    UPDATE inventory_monitor_alert_states
    SET status = 'resolved', resolved_at = now(), updated_at = now()
    WHERE sku = ${sku}
      AND alert_key = ${alertKey}
      AND status = 'open'
  `;
}
