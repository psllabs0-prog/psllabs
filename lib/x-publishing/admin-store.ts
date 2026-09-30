import crypto from "node:crypto";

import { getSql } from "@/lib/db/sql";

import { X_ACCOUNT_HANDLE, X_ACCOUNT_ID, X_LIMITS, X_POST_ID_RE } from "./constants";
import { checkPostText, normalizeDraftText, X_CONTENT_POLICY_VERSION } from "./content";
import { recordXEvent, X_EVENT_TYPES } from "./events";
import { approvalHash, textHash } from "./hash";
import {
  emitOverdueUncertain,
  getPost,
  lockedTransaction,
  overdueDispatchStatement,
  mapAttempt,
  mapPost,
  previewHashFor,
  sqlState,
  validityMinutesFor,
  type ApprovalContext,
  type ScheduleKind,
  type XResult,
} from "./records";
import { addMinutes, isSlotAligned, parsePhoenixLocal, phoenixDay } from "./time";

export const X_DRAFT_MAX_CHARS = 2000;

function fail(status: number, error: string, extra: Record<string, unknown> = {}): XResult {
  return { status, body: { error, ...extra } };
}

/** Why a scheduled slot cannot be approved now; null when it can. */
export function scheduleProblem(scheduledFor: string | null, now: Date): string | null {
  if (!scheduledFor) return "Choose a Phoenix date and 30-minute slot, or use “Approve for next manual run”.";
  const d = new Date(scheduledFor);
  if (!isSlotAligned(d)) return "Time must be on a 30-minute slot (:00 or :30 Phoenix time).";
  if (d.getTime() <= now.getTime()) {
    return "The scheduled time has passed. Choose a future slot — nothing is rescheduled automatically.";
  }
  if (d.getTime() > now.getTime() + X_LIMITS.maxScheduleHorizonDays * 86_400_000) {
    return `Schedule at most ${X_LIMITS.maxScheduleHorizonDays} days ahead.`;
  }
  const expires = addMinutes(d, X_LIMITS.expiryMinutesAfterScheduled);
  if (phoenixDay(new Date(expires.getTime() - 1)) !== phoenixDay(d)) {
    return "The 60-minute publishing window would cross Phoenix midnight; choose 11:00 PM or earlier.";
  }
  return null;
}

export type SaveDraftInput = {
  id: string | null;
  expectedRevision: number | null;
  text: string;
  sourceRefs: string[];
  scheduledForLocal: string | null;
  isTest: boolean;
  actor: string;
  now: Date;
};

export type PreparedDraft = { text: string; refs: string[]; textHash: string };

/** Normalization and storage limits shared by every draft writer (admin UI and the draft assistant). */
export function prepareDraft(rawText: string, sourceRefs: string[]): { ok: true; value: PreparedDraft } | { ok: false; error: string } {
  const text = normalizeDraftText(rawText);
  if (text.length === 0) return { ok: false, error: "Text is required." };
  if (text.length > X_DRAFT_MAX_CHARS) return { ok: false, error: `Text exceeds ${X_DRAFT_MAX_CHARS} characters.` };
  const refs = sourceRefs.map((s) => s.normalize("NFC").trim()).filter(Boolean);
  if (refs.length > X_LIMITS.maxSourceRefs || refs.some((r) => r.length > X_LIMITS.maxSourceRefLength)) {
    return { ok: false, error: `At most ${X_LIMITS.maxSourceRefs} source references of ${X_LIMITS.maxSourceRefLength} characters.` };
  }
  return { ok: true, value: { text, refs, textHash: textHash(X_ACCOUNT_ID, text) } };
}

export async function saveXDraft(input: SaveDraftInput): Promise<XResult> {
  const prepared = prepareDraft(input.text, input.sourceRefs);
  if (!prepared.ok) return fail(400, prepared.error);
  const { text, refs, textHash: th } = prepared.value;
  let scheduledFor: string | null = null;
  if (input.scheduledForLocal) {
    const d = parsePhoenixLocal(input.scheduledForLocal);
    if (!d) return fail(400, "Invalid Phoenix date/time.");
    scheduledFor = d.toISOString();
  }
  const now = input.now.toISOString();

  if (!input.id) {
    const sql = getSql();
    const rows = (await sql`
      INSERT INTO x_publishing_posts (
        id, status, revision, text, text_hash, source_refs, account_id, account_handle,
        is_test, schedule_kind, scheduled_for, created_by, created_at, updated_at
      ) VALUES (
        ${crypto.randomUUID()}::uuid, 'draft', 1, ${text}, ${th}, ${JSON.stringify(refs)}::jsonb,
        ${X_ACCOUNT_ID}, ${X_ACCOUNT_HANDLE}, ${input.isTest}, 'scheduled',
        ${scheduledFor}::timestamptz, ${input.actor}, ${now}::timestamptz, ${now}::timestamptz
      )
      RETURNING *
    `) as Record<string, unknown>[];
    return { status: 201, body: { post: mapPost(rows[0]) } };
  }

  if (input.expectedRevision === null) return fail(400, "expectedRevision is required to edit.");
  const [rows] = await lockedTransaction((sql) => [
    sql`
      WITH target AS (
        SELECT id FROM x_publishing_posts
        WHERE id = ${input.id}::uuid AND is_test = ${input.isTest}
          AND revision = ${input.expectedRevision}
          AND status IN ('draft','approved','claimed','rejected','expired','cancelled')
      ), released AS (
        UPDATE x_publishing_attempts a
        SET state = 'released', error_code = 'approval_invalidated',
            error_message = 'Draft edited before dispatch', updated_at = ${now}::timestamptz
        FROM target
        WHERE a.post_id = target.id AND a.state IN ('claimed','identity_ok') AND a.permit_issued_at IS NULL
        RETURNING a.id
      )
      UPDATE x_publishing_posts p SET
        status = 'draft', revision = p.revision + 1, text = ${text}, text_hash = ${th},
        source_refs = ${JSON.stringify(refs)}::jsonb, schedule_kind = 'scheduled',
        scheduled_for = ${scheduledFor}::timestamptz, expires_at = NULL, scheduled_day = NULL,
        approval_hash = NULL, approved_revision = NULL, approved_at = NULL, approved_by = NULL,
        approval_context = NULL, active_attempt_id = NULL, review_required = false,
        last_error_code = NULL, last_error_message = NULL, updated_at = ${now}::timestamptz
      FROM target
      WHERE p.id = target.id
      RETURNING p.*
    `,
  ]);
  if (rows[0]) return { status: 200, body: { post: mapPost(rows[0]) } };
  return explainNotEditable(input.id, input.isTest, input.expectedRevision);
}

async function explainNotEditable(id: string, isTest: boolean, revision: number | null): Promise<XResult> {
  const post = await getPost(id);
  if (!post || post.isTest !== isTest) return fail(404, "Post not found.");
  if (revision !== null && post.revision !== revision) {
    return fail(409, `This post changed since you loaded it (now revision ${post.revision}). Reload and review again.`);
  }
  return fail(
    409,
    `A post in status “${post.status}” cannot be edited or cancelled. Once dispatched, neither pause nor cancel can retract the request, and nothing is deleted automatically.`
  );
}

export type ApproveInput = {
  id: string;
  expectedRevision: number;
  previewHash: string;
  scheduleKind: ScheduleKind;
  confirmPublic: boolean;
  confirmManualRun: boolean;
  acknowledgedWarnings: string[];
  isTest: boolean;
  env: string;
  actor: string;
  now: Date;
};

export async function approveXPost(input: ApproveInput): Promise<XResult> {
  const post = await getPost(input.id);
  if (!post || post.isTest !== input.isTest) return fail(404, "Post not found.");
  if (post.status !== "draft") return fail(409, `Only drafts can be approved (status is “${post.status}”).`);
  if (post.revision !== input.expectedRevision) {
    return fail(409, `This draft changed since you reviewed it (now revision ${post.revision}). Review again.`);
  }
  if (post.accountId !== X_ACCOUNT_ID) return fail(409, "Post is not bound to the locked destination account.");
  if (input.confirmPublic !== true) {
    return fail(400, "Approval requires explicit confirmation that this authorizes a public X post.");
  }
  if (input.scheduleKind === "next_manual_run" && input.confirmManualRun !== true) {
    return fail(400, "“Approve for next manual run” requires its own confirmation.");
  }
  const check = checkPostText(post.text);
  if (!check.ok) return fail(422, "The text does not pass validation.", { errors: check.errors });
  const required = check.warnings.map((w) => w.code).sort();
  const acknowledged = [...new Set(input.acknowledgedWarnings)].sort();
  if (required.join("\n") !== acknowledged.join("\n")) {
    return fail(400, "Acknowledge each warning shown for this exact text.", { warnings: check.warnings });
  }
  if (previewHashFor(post, input.scheduleKind, check) !== input.previewHash) {
    return fail(409, "The preview you reviewed no longer matches this draft. Reload and review again.");
  }

  let scheduledFor: string;
  let expiresAt: string;
  if (input.scheduleKind === "scheduled") {
    const problem = scheduleProblem(post.scheduledFor, input.now);
    if (problem) return fail(422, problem);
    scheduledFor = new Date(post.scheduledFor!).toISOString();
    expiresAt = addMinutes(new Date(scheduledFor), X_LIMITS.expiryMinutesAfterScheduled).toISOString();
  } else {
    scheduledFor = input.now.toISOString();
    expiresAt = addMinutes(input.now, X_LIMITS.nextManualRunValidityMinutes).toISOString();
  }
  const approvedAt = input.now.toISOString();
  const day = phoenixDay(new Date(scheduledFor));
  const context: ApprovalContext = {
    previewHash: input.previewHash,
    confirmPublic: true,
    confirmManualRun: input.scheduleKind === "next_manual_run",
    acknowledgedWarnings: acknowledged,
    policyVersion: X_CONTENT_POLICY_VERSION,
    env: input.env,
    links: check.links,
    weightedLength: check.weightedLength,
    validityMinutes: validityMinutesFor(input.scheduleKind),
  };
  const hash = approvalHash({
    previewHash: input.previewHash,
    approvedAt,
    scheduledFor,
    expiresAt,
    approvedEnv: input.env,
    acknowledgedWarnings: acknowledged,
  });
  const cap = X_LIMITS.createDispatchesPerPhoenixDay;

  let results: Record<string, unknown>[][];
  try {
    results = await lockedTransaction((sql) => [
      sql`
        UPDATE x_publishing_posts
        SET status = 'expired', last_error_code = 'expired_before_dispatch',
            last_error_message = 'Approval window ended before dispatch', updated_at = ${approvedAt}::timestamptz
        WHERE is_test = ${input.isTest} AND status = 'approved' AND expires_at <= ${approvedAt}::timestamptz
        RETURNING id, revision
      `,
      sql`
        UPDATE x_publishing_posts SET
          status = 'approved', schedule_kind = ${input.scheduleKind},
          scheduled_for = ${scheduledFor}::timestamptz, expires_at = ${expiresAt}::timestamptz,
          scheduled_day = ${day}, approval_hash = ${hash}, approved_revision = revision,
          approved_at = ${approvedAt}::timestamptz, approved_by = ${input.actor},
          approval_context = ${JSON.stringify(context)}::jsonb, review_required = false,
          last_error_code = NULL, last_error_message = NULL, updated_at = ${approvedAt}::timestamptz
        WHERE id = ${input.id}::uuid AND is_test = ${input.isTest} AND status = 'draft'
          AND revision = ${input.expectedRevision} AND text = ${post.text} AND account_id = ${X_ACCOUNT_ID}
          AND (
            SELECT COUNT(*) FROM x_publishing_posts q
            WHERE q.is_test = ${input.isTest} AND q.account_id = ${X_ACCOUNT_ID}
              AND q.id <> ${input.id}::uuid AND q.scheduled_day = ${day}
              AND q.status IN ('approved','claimed','dispatched','created','published','uncertain')
          ) < ${cap}
          AND (
            SELECT COUNT(*) FROM x_publishing_attempts a
            WHERE a.is_test = ${input.isTest} AND a.permit_day = ${day} AND a.permit_issued_at IS NOT NULL
          ) < ${cap}
        RETURNING *
      `,
    ]);
  } catch (error) {
    if (sqlState(error) === "23505") {
      return fail(409, "Identical text for this account is already scheduled, in progress, uncertain, or published.");
    }
    throw error;
  }
  for (const r of results[0]) {
    await recordXEvent({
      type: X_EVENT_TYPES.expired,
      outcome: "skipped",
      summary: "Approved X post expired before dispatch (not posted)",
      queueId: String(r.id),
      revision: Number(r.revision),
      isTest: input.isTest,
      now: input.now,
    });
  }
  const row = results[1][0];
  if (!row) {
    const latest = await getPost(input.id);
    if (!latest || latest.status !== "draft" || latest.revision !== input.expectedRevision) {
      return fail(409, "This draft changed while approving. Reload and review again.");
    }
    return fail(
      409,
      `Daily capacity reached: at most ${cap} X post per Phoenix calendar day (${day}). Choose another day — nothing was rescheduled.`
    );
  }
  const approved = mapPost(row);
  await recordXEvent({
    type: X_EVENT_TYPES.approved,
    outcome: "accepted",
    summary:
      input.scheduleKind === "next_manual_run"
        ? `X post approved by owner for the next manual run (valid ${X_LIMITS.nextManualRunValidityMinutes} min)`
        : "X post approved by owner for its scheduled slot",
    queueId: approved.id,
    revision: approved.revision,
    isTest: approved.isTest,
    now: input.now,
  });
  return { status: 200, body: { post: approved } };
}

export async function cancelXPost(input: { id: string; isTest: boolean; actor: string; now: Date }): Promise<XResult> {
  const now = input.now.toISOString();
  const [rows] = await lockedTransaction((sql) => [
    sql`
      WITH target AS (
        SELECT id FROM x_publishing_posts
        WHERE id = ${input.id}::uuid AND is_test = ${input.isTest} AND status IN ('draft','approved','claimed')
      ), released AS (
        UPDATE x_publishing_attempts a
        SET state = 'released', error_code = 'cancelled_by_owner',
            error_message = 'Cancelled before dispatch', updated_at = ${now}::timestamptz
        FROM target
        WHERE a.post_id = target.id AND a.state IN ('claimed','identity_ok') AND a.permit_issued_at IS NULL
        RETURNING a.id
      )
      UPDATE x_publishing_posts p
      SET status = 'cancelled', active_attempt_id = NULL, last_error_code = 'cancelled_by_owner',
          last_error_message = ${`Cancelled by ${input.actor}`}, updated_at = ${now}::timestamptz
      FROM target WHERE p.id = target.id
      RETURNING p.*
    `,
  ]);
  if (!rows[0]) return explainNotEditable(input.id, input.isTest, null);
  const post = mapPost(rows[0]);
  await recordXEvent({
    type: X_EVENT_TYPES.cancelled,
    outcome: "skipped",
    summary: "X post cancelled by owner before dispatch",
    queueId: post.id,
    revision: post.revision,
    isTest: post.isTest,
    now: input.now,
  });
  return { status: 200, body: { post } };
}

/** Serialized with permit issuance: once committed, no new permit is issued. Cannot recall one already issued. */
export async function setXPaused(input: {
  paused: boolean;
  reason: string;
  actor: string;
  isTest: boolean;
  now: Date;
}): Promise<XResult> {
  const now = input.now.toISOString();
  const reason = input.reason.trim().slice(0, 300) || (input.paused ? "Paused by owner" : "Resumed by owner");
  const [rows] = await lockedTransaction((sql) => [
    sql`
      INSERT INTO x_publishing_control (id, paused, reason, updated_at, updated_by)
      VALUES (1, ${input.paused}, ${reason}, ${now}::timestamptz, ${input.actor})
      ON CONFLICT (id) DO UPDATE SET
        paused = EXCLUDED.paused, reason = EXCLUDED.reason,
        updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by
      RETURNING paused, reason, updated_at, updated_by
    `,
  ]);
  await recordXEvent({
    type: input.paused ? X_EVENT_TYPES.paused : X_EVENT_TYPES.resumed,
    outcome: input.paused ? "waiting" : "accepted",
    summary: input.paused ? "X publishing paused by owner (no new dispatch permits)" : "X publishing resumed by owner",
    queueId: null,
    revision: null,
    isTest: input.isTest,
    now: input.now,
    discriminator: now,
  });
  return { status: 200, body: { control: { paused: Boolean(rows[0]?.paused), reason } } };
}

/** Queues a read-only lookup of an owner-supplied post ID. Never creates anything. */
export async function setReconcileCandidate(input: {
  attemptId: string;
  candidatePostId: string;
  isTest: boolean;
  actor: string;
  now: Date;
}): Promise<XResult> {
  if (!X_POST_ID_RE.test(input.candidatePostId)) return fail(400, "Post ID must be digits only.");
  const now = input.now.toISOString();
  const [overdue, rows] = await lockedTransaction((sql) => [
    overdueDispatchStatement(sql, { isTest: input.isTest, now, attemptId: input.attemptId }),
    sql`
      UPDATE x_publishing_attempts SET
        reconcile_candidate_id = ${input.candidatePostId}, next_lookup_at = ${now}::timestamptz,
        lookup_attempts = 0, lookup_token_hash = NULL, lookup_lease_expires_at = NULL,
        review_note = ${`Read-only reconciliation requested by ${input.actor}`}, updated_at = ${now}::timestamptz
      WHERE id = ${input.attemptId}::uuid AND is_test = ${input.isTest} AND state = 'uncertain'
        AND NOT EXISTS (
          SELECT 1 FROM x_publishing_attempts o
          WHERE o.is_test = ${input.isTest} AND o.x_post_id = ${input.candidatePostId}
            AND o.id <> ${input.attemptId}::uuid
        )
      RETURNING *
    `,
  ]);
  await emitOverdueUncertain(overdue, input.isTest, input.now);
  if (!rows[0]) {
    return fail(
      409,
      "Only an uncertain attempt (including one dispatched past its deadline without a result) can be reconciled, with a post ID not already linked to another attempt."
    );
  }
  return { status: 200, body: { attempt: mapAttempt(rows[0]) } };
}

/** Re-queues read-only verification for a created post (e.g. after repeated lookup failures). */
export async function requestLookup(input: { attemptId: string; isTest: boolean; now: Date }): Promise<XResult> {
  const now = input.now.toISOString();
  const [rows] = await lockedTransaction((sql) => [
    sql`
      UPDATE x_publishing_attempts SET
        next_lookup_at = ${now}::timestamptz, lookup_attempts = 0, lookup_lease_expires_at = NULL,
        updated_at = ${now}::timestamptz
      WHERE id = ${input.attemptId}::uuid AND is_test = ${input.isTest}
        AND ((state = 'created' AND x_post_id IS NOT NULL)
          OR (state = 'uncertain' AND reconcile_candidate_id IS NOT NULL))
      RETURNING *
    `,
  ]);
  if (!rows[0]) return fail(409, "Lookup can be requested only for a created post or a pending reconciliation.");
  return { status: 200, body: { attempt: mapAttempt(rows[0]) } };
}

/**
 * Owner attestation after checking the X profile. Only for uncertain attempts
 * that never received a post ID. The post becomes cancelled; a new approval
 * (new revision) is required before anything else is sent.
 */
export async function resolveNotCreated(input: {
  attemptId: string;
  confirm: boolean;
  isTest: boolean;
  actor: string;
  now: Date;
}): Promise<XResult> {
  if (input.confirm !== true) {
    return fail(400, `Confirm that you checked @${X_ACCOUNT_HANDLE} on X and this post does not exist.`);
  }
  const now = input.now.toISOString();
  const [overdue, rows] = await lockedTransaction((sql) => [
    overdueDispatchStatement(sql, { isTest: input.isTest, now, attemptId: input.attemptId }),
    sql`
      WITH a AS (
        UPDATE x_publishing_attempts x SET
          state = 'not_created', resolved_by = ${input.actor}, resolved_at = ${now}::timestamptz,
          review_required = false, reconcile_candidate_id = NULL, next_lookup_at = NULL,
          review_note = 'Owner confirmed the post does not exist on X', updated_at = ${now}::timestamptz
        WHERE x.id = ${input.attemptId}::uuid AND x.is_test = ${input.isTest}
          AND x.state = 'uncertain' AND x.x_post_id IS NULL
          AND EXISTS (
            SELECT 1 FROM x_publishing_posts p
            WHERE p.id = x.post_id AND p.status = 'uncertain' AND p.active_attempt_id = x.id
          )
        RETURNING x.id, x.post_id
      )
      UPDATE x_publishing_posts p SET
        status = 'cancelled', active_attempt_id = NULL, review_required = false,
        last_error_code = 'owner_confirmed_not_created',
        last_error_message = 'Owner confirmed on X that the uncertain attempt did not create a post',
        updated_at = ${now}::timestamptz
      FROM a WHERE p.id = a.post_id
      RETURNING p.*
    `,
  ]);
  await emitOverdueUncertain(overdue, input.isTest, input.now);
  if (!rows[0]) {
    return fail(
      409,
      "Only an uncertain attempt (including one dispatched past its deadline without a result) without any X post ID can be resolved as not created."
    );
  }
  const post = mapPost(rows[0]);
  await recordXEvent({
    type: X_EVENT_TYPES.resolved,
    outcome: "completed",
    summary: "Owner resolved an uncertain X attempt as not created",
    queueId: post.id,
    revision: post.revision,
    attemptId: input.attemptId,
    isTest: post.isTest,
    now: input.now,
  });
  return { status: 200, body: { post } };
}