import { getSql } from "@/lib/db/sql";

import { getMissionControlWriteMode } from "./config";
import {
  ACTIVITY_OUTCOMES,
  MISSION_CONTROL_WORKERS,
  type ActivityEvent,
  type ActivityEventInput,
} from "./types";

export const ACTIVITY_SUMMARY_MAX = 280;
export const ACTIVITY_PAGE_MAX = 200;

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const LONG_DIGITS_RE = /\d{9,}/g;
const URL_QUERY_RE = /(https?:\/\/[^\s?#]+)\?[^\s]*/gi;

/**
 * Activity summaries are shown in a general admin feed: strip addresses,
 * long digit runs (phone/card/tracking), and URL query strings (tokens).
 */
export function sanitizeActivitySummary(text: string): string {
  const cleaned = text
    .replace(URL_QUERY_RE, "$1?…")
    .replace(EMAIL_RE, "[email]")
    .replace(LONG_DIGITS_RE, "[number]")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length <= ACTIVITY_SUMMARY_MAX) return cleaned;
  return `${cleaned.slice(0, ACTIVITY_SUMMARY_MAX - 1)}…`;
}

export function toIsoOrNull(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  const d = value instanceof Date ? value : new Date(String(value));
  const t = d.getTime();
  return Number.isFinite(t) ? d.toISOString() : null;
}

/** Validates the event contract; returns null for anything that cannot be stored honestly. */
export function normalizeActivityEvent(
  input: ActivityEventInput
): ActivityEventInput | null {
  const key = input.sourceEventKey?.trim();
  if (!key || key.length > 300) return null;
  if (!MISSION_CONTROL_WORKERS.includes(input.worker)) return null;
  if (!ACTIVITY_OUTCOMES.includes(input.outcome)) return null;
  const occurredAt = toIsoOrNull(input.occurredAt);
  if (!occurredAt) return null;
  const summary = sanitizeActivitySummary(input.summary ?? "");
  if (!summary) return null;
  return {
    ...input,
    sourceEventKey: key,
    occurredAt,
    summary,
    excluded: Boolean(input.excluded),
    versions: input.versions ?? {},
  };
}

function mapEventRow(row: Record<string, unknown>): ActivityEvent {
  const versions =
    typeof row.versions_json === "string"
      ? (JSON.parse(row.versions_json) as Record<string, string>)
      : ((row.versions_json as Record<string, string> | null) ?? {});
  return {
    id: Number(row.id),
    sourceEventKey: String(row.source_event_key),
    correlationId: row.correlation_id ? String(row.correlation_id) : null,
    parentTaskId: row.parent_task_id ? String(row.parent_task_id) : null,
    sourceSystem: String(row.source_system),
    worker: String(row.worker) as ActivityEvent["worker"],
    eventType: String(row.event_type),
    outcome: String(row.outcome) as ActivityEvent["outcome"],
    observation: String(row.observation) as ActivityEvent["observation"],
    occurredAt: toIsoOrNull(row.occurred_at) ?? "",
    receivedAt: toIsoOrNull(row.received_at) ?? "",
    summary: String(row.summary),
    sourceRef: row.source_ref ? String(row.source_ref) : null,
    sourceHref: row.source_href ? String(row.source_href) : null,
    excluded: Boolean(row.excluded),
    versions,
    estimatedCostUsd:
      row.estimated_cost_usd === null || row.estimated_cost_usd === undefined
        ? null
        : Number(row.estimated_cost_usd),
    providerCostUsd:
      row.provider_cost_usd === null || row.provider_cost_usd === undefined
        ? null
        : Number(row.provider_cost_usd),
  };
}

/**
 * Inserts events; duplicates (same source_event_key) are not re-inserted —
 * only a changed `excluded` flag is carried onto the existing row, so a
 * source record later marked test/reporting-excluded drops out of the default
 * feed. Returns the number of newly inserted rows. Does nothing unless Mission
 * Control writes are enabled server-side; never creates tables. Throws on DB
 * errors so the projector can surface coverage issues — use
 * `recordActivityEventSafe` from business code paths.
 */
export async function insertActivityEvents(
  inputs: ActivityEventInput[]
): Promise<number> {
  if (!getMissionControlWriteMode().enabled) return 0;
  const events = inputs
    .map(normalizeActivityEvent)
    .filter((e): e is ActivityEventInput => e !== null);
  if (events.length === 0) return 0;
  const sql = getSql();
  const unique = [
    ...new Map(events.map((e) => [e.sourceEventKey, e] as const)).values(),
  ];
  const col = <T>(pick: (e: ActivityEventInput) => T) => unique.map(pick);
  const rows = (await sql`
    INSERT INTO ops_activity_events (
      source_event_key, correlation_id, parent_task_id, source_system,
      worker, event_type, outcome, observation, occurred_at, summary,
      source_ref, source_href, excluded, versions_json,
      estimated_cost_usd, provider_cost_usd
    )
    SELECT
      k, c, p, s, w, t, o, ob, oc::timestamptz, sm, r, h, x, v::jsonb, ec, pc
    FROM unnest(
      ${col((e) => e.sourceEventKey)}::text[],
      ${col((e) => e.correlationId ?? null)}::text[],
      ${col((e) => e.parentTaskId ?? null)}::text[],
      ${col((e) => e.sourceSystem)}::text[],
      ${col((e) => e.worker)}::text[],
      ${col((e) => e.eventType)}::text[],
      ${col((e) => e.outcome)}::text[],
      ${col((e) => e.observation)}::text[],
      ${col((e) => e.occurredAt)}::text[],
      ${col((e) => e.summary)}::text[],
      ${col((e) => e.sourceRef ?? null)}::text[],
      ${col((e) => e.sourceHref ?? null)}::text[],
      ${col((e) => Boolean(e.excluded))}::boolean[],
      ${col((e) => JSON.stringify(e.versions ?? {}))}::text[],
      ${col((e) => e.estimatedCostUsd ?? null)}::numeric[],
      ${col((e) => e.providerCostUsd ?? null)}::numeric[]
    ) AS u(k, c, p, s, w, t, o, ob, oc, sm, r, h, x, v, ec, pc)
    ON CONFLICT (source_event_key) DO UPDATE SET excluded = EXCLUDED.excluded
    WHERE ops_activity_events.excluded IS DISTINCT FROM EXCLUDED.excluded
    RETURNING (xmax = 0) AS inserted
  `) as Array<{ inserted: boolean }>;
  return rows.filter((r) => r.inserted).length;
}

/** Observability must never block checkout, payment, inventory, or fulfillment. */
export async function recordActivityEventSafe(
  input: ActivityEventInput
): Promise<void> {
  try {
    await insertActivityEvents([input]);
  } catch (error) {
    console.error(
      "[mission-control] activity event not recorded:",
      error instanceof Error ? error.message : error
    );
  }
}

/** Newest events first (initial page). */
export async function listRecentActivityEvents(
  limit = 100
): Promise<ActivityEvent[]> {
  const sql = getSql();
  const safe = Math.min(Math.max(Math.floor(limit), 1), ACTIVITY_PAGE_MAX);
  const rows = (await sql`
    SELECT * FROM ops_activity_events
    ORDER BY id DESC
    LIMIT ${safe}
  `) as Record<string, unknown>[];
  return rows.map(mapEventRow);
}

/** Incremental read via the primary-key cursor. */
export async function listActivityEventsAfter(
  cursor: number,
  limit = ACTIVITY_PAGE_MAX
): Promise<ActivityEvent[]> {
  const sql = getSql();
  const safe = Math.min(Math.max(Math.floor(limit), 1), ACTIVITY_PAGE_MAX);
  const rows = (await sql`
    SELECT * FROM ops_activity_events
    WHERE id > ${Math.max(0, Math.floor(cursor))}
    ORDER BY id ASC
    LIMIT ${safe}
  `) as Record<string, unknown>[];
  return rows.map(mapEventRow);
}

export function parseActivityCursor(raw: string | null): number | null {
  if (raw === null || raw.trim() === "") return null;
  if (!/^\d{1,18}$/.test(raw.trim())) return null;
  const n = Number(raw.trim());
  return Number.isSafeInteger(n) ? n : null;
}
