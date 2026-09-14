import { createHash } from "node:crypto";

import { getSql } from "@/lib/db/sql";

import { ensureDecisionEngineSchema } from "./schema";
import type {
  DecisionCandidate,
  DecisionPriority,
  DecisionConfidence,
  DecisionOwner,
  DecisionSignalRow,
  DecisionSignalStatus,
} from "./types";

function asJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}

export function evidenceHashForCandidate(c: DecisionCandidate): string {
  const payload = {
    priority: c.priority,
    confidence: c.confidence,
    evidence: c.evidence,
    recommendation: c.recommendation,
  };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 32);
}

function mapRow(r: Record<string, unknown>): DecisionSignalRow {
  return {
    id: Number(r.id),
    signalKey: String(r.signal_key),
    signalType: String(r.signal_type),
    area: String(r.area),
    priority: r.priority as DecisionPriority,
    confidence: r.confidence as DecisionConfidence,
    status: r.status as DecisionSignalStatus,
    title: String(r.title),
    summary: String(r.summary ?? ""),
    recommendation: String(r.recommendation ?? ""),
    reasoningJson: (r.reasoning_json as Record<string, unknown>) ?? {},
    evidenceJson: (r.evidence_json as Record<string, unknown>) ?? {},
    risksJson: (r.risks_json as Record<string, unknown>) ?? {},
    whatCouldMakeWrongJson: r.what_could_make_wrong_json ?? [],
    dataNeededJson: r.data_needed_json ?? [],
    recommendedOwner: (r.recommended_owner as DecisionOwner) ?? "luke",
    sourceHref: String(r.source_href ?? "/admin-decisions"),
    firstDetectedAt: String(r.first_detected_at),
    lastDetectedAt: String(r.last_detected_at),
    acknowledgedAt: r.acknowledged_at ? String(r.acknowledged_at) : null,
    resolvedAt: r.resolved_at ? String(r.resolved_at) : null,
    dismissedAt: r.dismissed_at ? String(r.dismissed_at) : null,
    lastNotifiedAt: r.last_notified_at ? String(r.last_notified_at) : null,
    lastNotifiedEvidenceHash: r.last_notified_evidence_hash
      ? String(r.last_notified_evidence_hash)
      : null,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

export async function startDecisionRun(sourcesChecked: string[]): Promise<number> {
  await ensureDecisionEngineSchema();
  const sql = getSql();
  const rows = (await sql`
    INSERT INTO decision_engine_runs (status, sources_checked_json)
    VALUES ('running', ${asJson({ sources: sourcesChecked })}::jsonb)
    RETURNING id
  `) as Array<{ id: number }>;
  return Number(rows[0].id);
}

export async function finishDecisionRun(input: {
  id: number;
  status: "ok" | "error";
  signalsCreated: number;
  signalsResolved: number;
  errorSummary?: string | null;
}): Promise<void> {
  await ensureDecisionEngineSchema();
  const sql = getSql();
  await sql`
    UPDATE decision_engine_runs SET
      completed_at = now(),
      status = ${input.status},
      signals_created = ${input.signalsCreated},
      signals_resolved = ${input.signalsResolved},
      error_summary = ${input.errorSummary ?? null}
    WHERE id = ${input.id}
  `;
}

export async function listDecisionSignals(options?: {
  statuses?: DecisionSignalStatus[];
  limit?: number;
}): Promise<DecisionSignalRow[]> {
  await ensureDecisionEngineSchema();
  const sql = getSql();
  const limit = options?.limit ?? 100;
  const statuses = options?.statuses;
  if (statuses && statuses.length > 0) {
    const rows = (await sql`
      SELECT * FROM decision_signals
      WHERE status = ANY(${statuses as unknown as string[]})
      ORDER BY
        CASE priority WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 ELSE 3 END,
        last_detected_at DESC
      LIMIT ${limit}
    `) as Array<Record<string, unknown>>;
    return rows.map(mapRow);
  }
  const rows = (await sql`
    SELECT * FROM decision_signals
    ORDER BY
      CASE priority WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 ELSE 3 END,
      last_detected_at DESC
    LIMIT ${limit}
  `) as Array<Record<string, unknown>>;
  return rows.map(mapRow);
}

export async function getDecisionSignalByKey(
  signalKey: string
): Promise<DecisionSignalRow | null> {
  await ensureDecisionEngineSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT * FROM decision_signals WHERE signal_key = ${signalKey} LIMIT 1
  `) as Array<Record<string, unknown>>;
  return rows[0] ? mapRow(rows[0]) : null;
}

/**
 * Upsert candidate. Does not resurrect dismissed unless evidence materially changed
 * and priority is P0/P1 — still keeps dismissed until manually re-opened; we update
 * last_detected on active/acknowledged only, and re-activate resolved when condition returns.
 */
export async function upsertDecisionSignal(
  candidate: DecisionCandidate
): Promise<{ created: boolean; reactivated: boolean }> {
  await ensureDecisionEngineSchema();
  const sql = getSql();
  const existing = await getDecisionSignalByKey(candidate.signalKey);
  const reasoning = {
    decision: candidate.decision,
    why: candidate.why,
    expectedUpside: candidate.expectedUpside,
    opportunityCost: candidate.opportunityCost,
    nextAction: candidate.nextAction,
    recommendedOwner: candidate.recommendedOwner,
    autoResolveWhenGone: candidate.autoResolveWhenGone,
  };
  const evidence = { items: candidate.evidence };
  const risks = { mainRisks: candidate.mainRisks };
  const wrong = candidate.whatCouldMakeWrong;
  const needed = candidate.dataNeeded;

  if (!existing) {
    await sql`
      INSERT INTO decision_signals (
        signal_key, signal_type, area, priority, confidence, status,
        title, summary, recommendation,
        reasoning_json, evidence_json, risks_json,
        what_could_make_wrong_json, data_needed_json,
        recommended_owner, source_href
      ) VALUES (
        ${candidate.signalKey},
        ${candidate.signalType},
        ${candidate.area},
        ${candidate.priority},
        ${candidate.confidence},
        'active',
        ${candidate.title},
        ${candidate.summary},
        ${candidate.recommendation},
        ${asJson(reasoning)}::jsonb,
        ${asJson(evidence)}::jsonb,
        ${asJson(risks)}::jsonb,
        ${asJson(wrong)}::jsonb,
        ${asJson(needed)}::jsonb,
        ${candidate.recommendedOwner},
        ${candidate.sourceHref}
      )
    `;
    return { created: true, reactivated: false };
  }

  if (existing.status === "dismissed") {
    // Retain dismissed in audit history — update evidence timestamps only lightly
    await sql`
      UPDATE decision_signals SET
        last_detected_at = now(),
        evidence_json = ${asJson(evidence)}::jsonb,
        updated_at = now()
      WHERE signal_key = ${candidate.signalKey}
    `;
    return { created: false, reactivated: false };
  }

  const reactivate = existing.status === "resolved";
  const nextStatus = existing.status === "acknowledged" ? "acknowledged" : "active";

  await sql`
    UPDATE decision_signals SET
      signal_type = ${candidate.signalType},
      area = ${candidate.area},
      priority = ${candidate.priority},
      confidence = ${candidate.confidence},
      status = ${reactivate ? "active" : nextStatus},
      title = ${candidate.title},
      summary = ${candidate.summary},
      recommendation = ${candidate.recommendation},
      reasoning_json = ${asJson(reasoning)}::jsonb,
      evidence_json = ${asJson(evidence)}::jsonb,
      risks_json = ${asJson(risks)}::jsonb,
      what_could_make_wrong_json = ${asJson(wrong)}::jsonb,
      data_needed_json = ${asJson(needed)}::jsonb,
      recommended_owner = ${candidate.recommendedOwner},
      source_href = ${candidate.sourceHref},
      last_detected_at = now(),
      resolved_at = ${reactivate ? null : existing.resolvedAt},
      updated_at = now()
    WHERE signal_key = ${candidate.signalKey}
  `;
  return { created: false, reactivated: reactivate };
}

export async function resolveMissingAutoSignals(
  activeKeys: Set<string>
): Promise<number> {
  await ensureDecisionEngineSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT signal_key, reasoning_json, status
    FROM decision_signals
    WHERE status IN ('active', 'acknowledged')
  `) as Array<{
    signal_key: string;
    reasoning_json: { autoResolveWhenGone?: boolean };
    status: string;
  }>;

  let resolved = 0;
  for (const row of rows) {
    if (activeKeys.has(row.signal_key)) continue;
    // Sticky friction (false) needs stability — never auto-resolve from one quiet day.
    if (row.reasoning_json?.autoResolveWhenGone !== true) continue;

    await sql`
      UPDATE decision_signals SET
        status = 'resolved',
        resolved_at = now(),
        updated_at = now()
      WHERE signal_key = ${row.signal_key}
        AND status IN ('active', 'acknowledged')
    `;
    resolved += 1;
  }
  return resolved;
}

export async function acknowledgeDecisionSignal(
  signalKey: string
): Promise<boolean> {
  await ensureDecisionEngineSchema();
  const sql = getSql();
  const rows = (await sql`
    UPDATE decision_signals SET
      status = 'acknowledged',
      acknowledged_at = now(),
      updated_at = now()
    WHERE signal_key = ${signalKey}
      AND status = 'active'
    RETURNING id
  `) as Array<{ id: number }>;
  return rows.length > 0;
}

export async function dismissDecisionSignal(signalKey: string): Promise<boolean> {
  await ensureDecisionEngineSchema();
  const sql = getSql();
  const rows = (await sql`
    UPDATE decision_signals SET
      status = 'dismissed',
      dismissed_at = now(),
      updated_at = now()
    WHERE signal_key = ${signalKey}
      AND status IN ('active', 'acknowledged')
    RETURNING id
  `) as Array<{ id: number }>;
  return rows.length > 0;
}

export async function markDecisionSignalResolved(
  signalKey: string
): Promise<boolean> {
  await ensureDecisionEngineSchema();
  const sql = getSql();
  const rows = (await sql`
    UPDATE decision_signals SET
      status = 'resolved',
      resolved_at = now(),
      updated_at = now()
    WHERE signal_key = ${signalKey}
      AND status IN ('active', 'acknowledged')
    RETURNING id
  `) as Array<{ id: number }>;
  return rows.length > 0;
}

export async function markDecisionSignalsNotified(
  updates: Array<{ signalKey: string; evidenceHash: string }>
): Promise<void> {
  await ensureDecisionEngineSchema();
  const sql = getSql();
  for (const u of updates) {
    await sql`
      UPDATE decision_signals SET
        last_notified_at = now(),
        last_notified_evidence_hash = ${u.evidenceHash},
        updated_at = now()
      WHERE signal_key = ${u.signalKey}
    `;
  }
}

export async function getLatestDecisionRun(): Promise<{
  id: number;
  status: string;
  completedAt: string | null;
  signalsCreated: number;
  signalsResolved: number;
} | null> {
  await ensureDecisionEngineSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT id, status, completed_at, signals_created, signals_resolved
    FROM decision_engine_runs
    ORDER BY id DESC
    LIMIT 1
  `) as Array<{
    id: number;
    status: string;
    completed_at: string | null;
    signals_created: number;
    signals_resolved: number;
  }>;
  if (!rows[0]) return null;
  return {
    id: Number(rows[0].id),
    status: rows[0].status,
    completedAt: rows[0].completed_at,
    signalsCreated: Number(rows[0].signals_created),
    signalsResolved: Number(rows[0].signals_resolved),
  };
}
