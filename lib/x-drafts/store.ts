import { getSql } from "@/lib/db/sql";
import { X_ACCOUNT_HANDLE, X_ACCOUNT_ID } from "@/lib/x-publishing/constants";
import type { PreparedDraft } from "@/lib/x-publishing/admin-store";
import { lockedTransaction } from "@/lib/x-publishing/records";
import { phoenixDay } from "@/lib/x-publishing/time";

import { X_DRAFT_ASSISTANT_ACTOR, X_DRAFT_LIMITS } from "./constants";
import type { ExistingPost } from "./validate";

type Row = Record<string, unknown>;

/**
 * The draft assistant's only database access. Reads are limited to post text
 * in one partition for de-duplication; the single write path inserts new
 * `draft` rows. Nothing here updates, approves, schedules, claims, cancels,
 * resumes, or deletes anything.
 */
export async function countAssistantDraftsToday(isTest: boolean, now: Date): Promise<number> {
  const sql = getSql();
  const rows = (await sql`
    SELECT count(*)::int AS n FROM x_publishing_posts
    WHERE created_by = ${X_DRAFT_ASSISTANT_ACTOR} AND is_test = ${isTest}
      AND (created_at AT TIME ZONE 'America/Phoenix')::date = ${phoenixDay(now)}::date
  `) as Row[];
  return Number(rows[0]?.n ?? 0);
}

export async function readRecentPosts(isTest: boolean, limit: number): Promise<ExistingPost[]> {
  const sql = getSql();
  const rows = (await sql`
    SELECT id, text, text_hash FROM x_publishing_posts
    WHERE is_test = ${isTest} AND account_id = ${X_ACCOUNT_ID}
    ORDER BY created_at DESC, id
    LIMIT ${limit}
  `) as Row[];
  return rows.map((r) => ({ id: String(r.id), text: String(r.text), textHash: String(r.text_hash) }));
}

/** Exact duplicates in the partition, any status (including published and cancelled). */
export async function readExactDuplicates(isTest: boolean, hashes: string[]): Promise<ExistingPost[]> {
  if (hashes.length === 0) return [];
  const sql = getSql();
  const rows = (await sql`
    SELECT id, text, text_hash FROM x_publishing_posts
    WHERE is_test = ${isTest} AND account_id = ${X_ACCOUNT_ID} AND text_hash = ANY(${hashes}::text[])
  `) as Row[];
  return rows.map((r) => ({ id: String(r.id), text: String(r.text), textHash: String(r.text_hash) }));
}

export type DraftInsertItem = { item: number; id: string; prepared: PreparedDraft };

export type DraftInsertOutcome =
  | { item: number; id: string; outcome: "saved" }
  | { item: number; id: string; outcome: "already_saved" }
  | { item: number; id: string; outcome: "blocked"; reason: string };

/**
 * Retry-safe: each item has a deterministic ID; `ON CONFLICT (id) DO NOTHING`
 * means replaying a batch never duplicates or modifies a row. The daily cap
 * and the any-status duplicate check run inside the same locked transaction.
 */
export async function insertAssistantDrafts(input: { isTest: boolean; now: Date; items: DraftInsertItem[] }): Promise<DraftInsertOutcome[]> {
  if (input.items.length === 0) return [];
  const now = input.now.toISOString();
  const day = phoenixDay(input.now);
  const results = await lockedTransaction((sql) =>
    input.items.map(
      (it) => sql`
        INSERT INTO x_publishing_posts (
          id, status, revision, text, text_hash, source_refs, account_id, account_handle,
          is_test, schedule_kind, scheduled_for, created_by, created_at, updated_at
        )
        SELECT
          ${it.id}::uuid, 'draft', 1, ${it.prepared.text}, ${it.prepared.textHash}, ${JSON.stringify(it.prepared.refs)}::jsonb,
          ${X_ACCOUNT_ID}, ${X_ACCOUNT_HANDLE}, ${input.isTest}, 'scheduled', NULL,
          ${X_DRAFT_ASSISTANT_ACTOR}, ${now}::timestamptz, ${now}::timestamptz
        WHERE (
          SELECT count(*) FROM x_publishing_posts
          WHERE created_by = ${X_DRAFT_ASSISTANT_ACTOR} AND is_test = ${input.isTest}
            AND (created_at AT TIME ZONE 'America/Phoenix')::date = ${day}::date
        ) < ${X_DRAFT_LIMITS.maxDraftsPerPhoenixDay}
        AND NOT EXISTS (
          SELECT 1 FROM x_publishing_posts
          WHERE is_test = ${input.isTest} AND account_id = ${X_ACCOUNT_ID} AND text_hash = ${it.prepared.textHash}
        )
        ON CONFLICT (id) DO NOTHING
        RETURNING id
      `
    )
  );

  const missing = input.items.filter((_, i) => !results[i]?.[0]);
  const existing = new Map<string, Row>();
  const dupHashes = new Set<string>();
  if (missing.length > 0) {
    const sql = getSql();
    const rows = (await sql`
      SELECT id, text_hash, is_test, created_by FROM x_publishing_posts WHERE id = ANY(${missing.map((m) => m.id)}::uuid[])
    `) as Row[];
    for (const r of rows) existing.set(String(r.id), r);
    const dups = await readExactDuplicates(input.isTest, missing.map((m) => m.prepared.textHash));
    for (const d of dups) dupHashes.add(d.textHash);
  }

  return input.items.map((it, i): DraftInsertOutcome => {
    if (results[i]?.[0]) return { item: it.item, id: it.id, outcome: "saved" };
    const row = existing.get(it.id);
    if (row) {
      const same = String(row.text_hash) === it.prepared.textHash && Boolean(row.is_test) === input.isTest && String(row.created_by) === X_DRAFT_ASSISTANT_ACTOR;
      return same
        ? { item: it.item, id: it.id, outcome: "already_saved" }
        : { item: it.item, id: it.id, outcome: "blocked", reason: "batch_item_conflict: this batch item already exists with different content; the existing row was not changed" };
    }
    if (dupHashes.has(it.prepared.textHash)) {
      return { item: it.item, id: it.id, outcome: "blocked", reason: "duplicate_existing: identical text is already in the queue" };
    }
    return { item: it.item, id: it.id, outcome: "blocked", reason: `daily_cap: at most ${X_DRAFT_LIMITS.maxDraftsPerPhoenixDay} assistant drafts per Phoenix day` };
  });
}
