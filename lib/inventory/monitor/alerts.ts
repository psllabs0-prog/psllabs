import { getSql } from "@/lib/db/sql";

import { ensureInventoryMonitorSchema } from "./schema";

export type AlertKey =
  | "absolute_low_stock"
  | "reorder_review"
  | "depletion_watch";

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

/** Mark alert open and return whether a new send should happen (entered/re-entered). */
export async function enterAlertState(input: {
  sku: string;
  alertKey: AlertKey;
  details?: Record<string, unknown>;
}): Promise<{ shouldSend: boolean }> {
  await ensureInventoryMonitorSchema();
  const sql = getSql();
  const details = input.details ?? null;

  const existing = (await sql`
    SELECT status FROM inventory_monitor_alert_states
    WHERE sku = ${input.sku} AND alert_key = ${input.alertKey}
    LIMIT 1
  `) as { status: string }[];

  if (existing[0]?.status === "open") {
    await sql`
      UPDATE inventory_monitor_alert_states
      SET details_json = ${details}, updated_at = now()
      WHERE sku = ${input.sku} AND alert_key = ${input.alertKey}
    `;
    return { shouldSend: false };
  }

  await sql`
    INSERT INTO inventory_monitor_alert_states (
      sku, alert_key, status, last_sent_at, resolved_at, details_json
    ) VALUES (
      ${input.sku},
      ${input.alertKey},
      'open',
      now(),
      NULL,
      ${details}
    )
    ON CONFLICT (sku, alert_key) DO UPDATE SET
      status = 'open',
      last_sent_at = now(),
      resolved_at = NULL,
      details_json = EXCLUDED.details_json,
      updated_at = now()
  `;
  return { shouldSend: true };
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
