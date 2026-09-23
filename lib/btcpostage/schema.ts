import { getSql } from "@/lib/db/sql";

export const BTCPOSTAGE_TABLES = ["btcpostage_labels"] as const;

let schemaReady: Promise<void> | null = null;

export async function ensureBtcpostageSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      const sql = getSql();
      await sql`
        CREATE TABLE IF NOT EXISTS btcpostage_labels (
          psl_order_id TEXT PRIMARY KEY,
          purchase_status TEXT NOT NULL DEFAULT 'none',
          btcp_order_id TEXT,
          shipment_id TEXT,
          carrier TEXT,
          service TEXT,
          postage_cost NUMERIC(10,2),
          tracking_number TEXT,
          label_url TEXT,
          label_format TEXT,
          test_mode BOOLEAN NOT NULL DEFAULT false,
          purchased_at TIMESTAMPTZ,
          purchase_claimed_at TIMESTAMPTZ,
          last_error TEXT,
          verified_street1 TEXT,
          verified_street2 TEXT,
          verified_city TEXT,
          verified_state TEXT,
          verified_zip TEXT,
          verified_country TEXT,
          weight_lbs NUMERIC(8,2),
          weight_oz NUMERIC(8,2),
          height_in NUMERIC(8,2),
          width_in NUMERIC(8,2),
          depth_in NUMERIC(8,2),
          raw_response JSONB,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;
      await sql`
        CREATE UNIQUE INDEX IF NOT EXISTS btcpostage_labels_btcp_order_id_uidx
        ON btcpostage_labels (btcp_order_id)
        WHERE btcp_order_id IS NOT NULL AND trim(btcp_order_id) <> ''
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS btcpostage_labels_status_idx
        ON btcpostage_labels (purchase_status, updated_at DESC)
      `;
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  await schemaReady;
}
