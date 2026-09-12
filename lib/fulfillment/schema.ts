import { getSql } from "@/lib/db/sql";

export const FULFILLMENT_TABLES = ["fulfillment_workflow"] as const;

export type FulfillmentWorkflowStatus =
  | "ready"
  | "packing"
  | "packed"
  | "hold";

let schemaReady: Promise<void> | null = null;

export async function ensureFulfillmentSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      const sql = getSql();
      await sql`
        CREATE TABLE IF NOT EXISTS fulfillment_workflow (
          order_id TEXT PRIMARY KEY,
          workflow_status TEXT NOT NULL DEFAULT 'ready',
          hold_reason TEXT,
          packing_started_at TIMESTAMPTZ,
          packed_at TIMESTAMPTZ,
          owner_note TEXT,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS fulfillment_workflow_status_idx
        ON fulfillment_workflow (workflow_status, updated_at DESC)
      `;
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  await schemaReady;
}
