import { getSql } from "@/lib/db/sql";

import { ensureCustomerIntelligenceSchema } from "./schema";
import type {
  CiConfidence,
  CiRecommendationType,
  CiSignalStatus,
  EvidenceClass,
} from "./taxonomy";

export type CustomerIntelSignalRow = {
  id: number;
  signalKey: string;
  signalType: string;
  theme: string;
  evidenceClass: EvidenceClass;
  productSku: string | null;
  sourceChannel: string;
  currentCount: number;
  priorCount: number;
  sampleSize: number;
  confidenceLevel: CiConfidence;
  firstSeenAt: string;
  lastSeenAt: string;
  evidenceJson: Record<string, unknown>;
  status: CiSignalStatus;
  recommendation: string | null;
};

export async function upsertCustomerIntelSignal(input: {
  signalKey: string;
  signalType: string;
  theme: string;
  evidenceClass: EvidenceClass;
  productSku?: string | null;
  sourceChannel: string;
  currentCount: number;
  priorCount: number;
  sampleSize: number;
  confidenceLevel: CiConfidence;
  status: CiSignalStatus;
  recommendation?: CiRecommendationType | null;
  evidenceJson: Record<string, unknown>;
}): Promise<CustomerIntelSignalRow> {
  await ensureCustomerIntelligenceSchema();
  const sql = getSql();
  const existing = (await sql`
    SELECT id, status FROM customer_intelligence_signals
    WHERE signal_key = ${input.signalKey}
    LIMIT 1
  `) as Array<{ id: number; status: string }>;

  // Preserve resolved/dismissed/watch unless scan reopens early/validated only when not dismissed
  let status = input.status;
  if (existing[0]?.status === "dismissed" || existing[0]?.status === "resolved") {
    status = existing[0].status as CiSignalStatus;
  } else if (existing[0]?.status === "watch") {
    status = "watch";
  }

  const rows = (await sql`
    INSERT INTO customer_intelligence_signals (
      signal_key, signal_type, theme, evidence_class, product_sku,
      source_channel, current_count, prior_count, sample_size,
      confidence_level, evidence_json, status, recommendation,
      first_seen_at, last_seen_at, updated_at
    ) VALUES (
      ${input.signalKey},
      ${input.signalType},
      ${input.theme},
      ${input.evidenceClass},
      ${input.productSku ?? null},
      ${input.sourceChannel},
      ${input.currentCount},
      ${input.priorCount},
      ${input.sampleSize},
      ${input.confidenceLevel},
      ${JSON.stringify(input.evidenceJson)}::jsonb,
      ${status},
      ${input.recommendation ?? null},
      now(),
      now(),
      now()
    )
    ON CONFLICT (signal_key) DO UPDATE SET
      signal_type = EXCLUDED.signal_type,
      theme = EXCLUDED.theme,
      evidence_class = EXCLUDED.evidence_class,
      product_sku = EXCLUDED.product_sku,
      source_channel = EXCLUDED.source_channel,
      current_count = EXCLUDED.current_count,
      prior_count = EXCLUDED.prior_count,
      sample_size = EXCLUDED.sample_size,
      confidence_level = EXCLUDED.confidence_level,
      evidence_json = EXCLUDED.evidence_json,
      status = CASE
        WHEN customer_intelligence_signals.status IN ('dismissed', 'resolved', 'watch')
          THEN customer_intelligence_signals.status
        ELSE EXCLUDED.status
      END,
      recommendation = EXCLUDED.recommendation,
      last_seen_at = now(),
      updated_at = now()
    RETURNING *
  `) as Array<Record<string, unknown>>;

  return mapSignal(rows[0]);
}

export async function listCustomerIntelSignals(options?: {
  limit?: number;
}): Promise<CustomerIntelSignalRow[]> {
  await ensureCustomerIntelligenceSchema();
  const sql = getSql();
  const limit = Math.min(Math.max(options?.limit ?? 200, 1), 500);
  const rows = (await sql`
    SELECT * FROM customer_intelligence_signals
    ORDER BY
      CASE confidence_level
        WHEN 'strong' THEN 0
        WHEN 'meaningful' THEN 1
        WHEN 'early_signal' THEN 2
        ELSE 3
      END,
      current_count DESC,
      last_seen_at DESC
    LIMIT ${limit}
  `) as Array<Record<string, unknown>>;
  return rows.map(mapSignal);
}

export async function updateCustomerIntelSignalStatus(input: {
  id: number;
  status: CiSignalStatus;
}): Promise<CustomerIntelSignalRow | null> {
  await ensureCustomerIntelligenceSchema();
  const sql = getSql();
  const rows = (await sql`
    UPDATE customer_intelligence_signals
    SET status = ${input.status}, updated_at = now()
    WHERE id = ${input.id}
    RETURNING *
  `) as Array<Record<string, unknown>>;
  return rows[0] ? mapSignal(rows[0]) : null;
}

export async function upsertCustomerIntelSnapshot(input: {
  periodStart: string;
  periodEnd: string;
  snapshot: Record<string, unknown>;
}): Promise<{ id: number; inserted: boolean }> {
  await ensureCustomerIntelligenceSchema();
  const sql = getSql();
  const existing = (await sql`
    SELECT id FROM customer_intelligence_snapshots
    WHERE period_start = ${input.periodStart}::date
      AND period_end = ${input.periodEnd}::date
    LIMIT 1
  `) as Array<{ id: number }>;

  if (existing[0]) {
    await sql`
      UPDATE customer_intelligence_snapshots
      SET
        snapshot_json = ${JSON.stringify(input.snapshot)}::jsonb,
        generated_at = now()
      WHERE id = ${existing[0].id}
    `;
    return { id: existing[0].id, inserted: false };
  }

  const rows = (await sql`
    INSERT INTO customer_intelligence_snapshots (
      period_start, period_end, snapshot_json
    ) VALUES (
      ${input.periodStart}::date,
      ${input.periodEnd}::date,
      ${JSON.stringify(input.snapshot)}::jsonb
    )
    ON CONFLICT (period_start, period_end) DO UPDATE SET
      snapshot_json = EXCLUDED.snapshot_json,
      generated_at = now()
    RETURNING id
  `) as Array<{ id: number }>;
  return { id: Number(rows[0].id), inserted: true };
}

export async function getLatestCustomerIntelSnapshot(): Promise<{
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  snapshot: Record<string, unknown>;
} | null> {
  await ensureCustomerIntelligenceSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT period_start, period_end, generated_at, snapshot_json
    FROM customer_intelligence_snapshots
    ORDER BY period_end DESC
    LIMIT 1
  `) as Array<{
    period_start: string | Date;
    period_end: string | Date;
    generated_at: string | Date;
    snapshot_json: Record<string, unknown>;
  }>;
  if (!rows[0]) return null;
  const r = rows[0];
  return {
    periodStart: String(r.period_start).slice(0, 10),
    periodEnd: String(r.period_end).slice(0, 10),
    generatedAt:
      r.generated_at instanceof Date
        ? r.generated_at.toISOString()
        : String(r.generated_at),
    snapshot: r.snapshot_json ?? {},
  };
}

function mapSignal(r: Record<string, unknown>): CustomerIntelSignalRow {
  return {
    id: Number(r.id),
    signalKey: String(r.signal_key),
    signalType: String(r.signal_type),
    theme: String(r.theme),
    evidenceClass: String(r.evidence_class) as EvidenceClass,
    productSku: r.product_sku ? String(r.product_sku) : null,
    sourceChannel: String(r.source_channel ?? ""),
    currentCount: Number(r.current_count ?? 0),
    priorCount: Number(r.prior_count ?? 0),
    sampleSize: Number(r.sample_size ?? 0),
    confidenceLevel: String(r.confidence_level) as CiConfidence,
    firstSeenAt: String(r.first_seen_at ?? ""),
    lastSeenAt: String(r.last_seen_at ?? ""),
    evidenceJson: (r.evidence_json ?? {}) as Record<string, unknown>,
    status: String(r.status) as CiSignalStatus,
    recommendation: r.recommendation ? String(r.recommendation) : null,
  };
}
