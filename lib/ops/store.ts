import { getSql } from "@/lib/db/sql";

import { ensureOpsSchema } from "./schema";

export type OpsAckRow = {
  sourceType: string;
  sourceId: string;
  acknowledgedAt: string;
  acknowledgedBy: string | null;
  note: string | null;
  resolvedAt: string | null;
};

function mapAck(row: Record<string, unknown>): OpsAckRow {
  return {
    sourceType: String(row.source_type),
    sourceId: String(row.source_id),
    acknowledgedAt: new Date(String(row.acknowledged_at)).toISOString(),
    acknowledgedBy: row.acknowledged_by ? String(row.acknowledged_by) : null,
    note: row.note ? String(row.note) : null,
    resolvedAt: row.resolved_at
      ? new Date(String(row.resolved_at)).toISOString()
      : null,
  };
}

export async function listOpenOpsAcknowledgements(): Promise<OpsAckRow[]> {
  await ensureOpsSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT *
    FROM ops_exception_acknowledgements
    WHERE resolved_at IS NULL
  `) as Record<string, unknown>[];
  return rows.map(mapAck);
}

export async function acknowledgeOpsException(input: {
  sourceType: string;
  sourceId: string;
  acknowledgedBy?: string | null;
  note?: string | null;
}): Promise<OpsAckRow> {
  await ensureOpsSchema();
  const sql = getSql();
  const rows = (await sql`
    INSERT INTO ops_exception_acknowledgements (
      source_type, source_id, acknowledged_by, note, acknowledged_at, resolved_at
    ) VALUES (
      ${input.sourceType},
      ${input.sourceId},
      ${input.acknowledgedBy ?? "luke"},
      ${input.note ?? null},
      now(),
      NULL
    )
    ON CONFLICT (source_type, source_id) DO UPDATE SET
      acknowledged_at = now(),
      acknowledged_by = EXCLUDED.acknowledged_by,
      note = COALESCE(EXCLUDED.note, ops_exception_acknowledgements.note),
      resolved_at = NULL
    RETURNING *
  `) as Record<string, unknown>[];
  return mapAck(rows[0]);
}

export async function clearOpsAcknowledgement(input: {
  sourceType: string;
  sourceId: string;
}): Promise<void> {
  await ensureOpsSchema();
  const sql = getSql();
  await sql`
    UPDATE ops_exception_acknowledgements
    SET resolved_at = now()
    WHERE source_type = ${input.sourceType}
      AND source_id = ${input.sourceId}
      AND resolved_at IS NULL
  `;
}
