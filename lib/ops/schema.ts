import { getSql } from "@/lib/db/sql";

export const OPS_TABLES = ["ops_exception_acknowledgements"] as const;

let schemaReady: Promise<void> | null = null;

export async function ensureOpsSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      const sql = getSql();
      await sql`
        CREATE TABLE IF NOT EXISTS ops_exception_acknowledgements (
          id BIGSERIAL PRIMARY KEY,
          source_type TEXT NOT NULL,
          source_id TEXT NOT NULL,
          acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          acknowledged_by TEXT,
          note TEXT,
          resolved_at TIMESTAMPTZ,
          UNIQUE (source_type, source_id)
        )
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS ops_exception_ack_open_idx
        ON ops_exception_acknowledgements (resolved_at, acknowledged_at DESC)
      `;
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  await schemaReady;
}
