import { getSql } from "@/lib/db/sql";
import { toIsoOrNull } from "@/lib/ops/mission-control/events";

import { X_LIMITS, type XAttemptState, type XDisplayState, type XPostStatus } from "./constants";
import { checkPostText, X_CONTENT_POLICY_VERSION, type XContentCheck } from "./content";
import { recordXEvent, X_EVENT_TYPES } from "./events";
import { approvalHash, previewHash } from "./hash";
import { phoenixDay } from "./time";

export type ScheduleKind = "scheduled" | "next_manual_run";

type ApprovalBase = {
  previewHash: string;
  acknowledgedWarnings: string[];
  policyVersion: string;
  env: string;
  links: string[];
  weightedLength: number;
  validityMinutes: number | null;
};

/** The owner reviewed and approved this exact revision (rows written before autopilot have no `authorization`). */
export type OwnerApprovalContext = ApprovalBase & {
  authorization?: "owner";
  confirmPublic: true;
  confirmManualRun: boolean;
};

/**
 * Authorized by the owner's standing-policy authorization, not by an
 * individual review of this post. `acknowledgedWarnings` is always empty:
 * any accepted warning is documented against the reviewed template instead.
 */
export type StandingPolicyApprovalContext = ApprovalBase & {
  authorization: "standing_policy";
  standingPolicy: {
    policyId: string;
    policyVersion: string;
    policyHash: string;
    libraryId: string;
    libraryVersion: string;
    templateId: string;
    templateHash: string;
    sourceIds: string[];
    sourceHashes: Array<{ id: string; hash: string }>;
    acceptedWarnings: Array<{ code: string; justification: string }>;
    authorizationId: string;
    authorizationGrantedAt: string;
    authorizationGrantedBy: string;
    slotKey: string;
    slotAt: string;
    actor: string;
  };
};

export type ApprovalContext = OwnerApprovalContext | StandingPolicyApprovalContext;

export function isStandingPolicy(ctx: ApprovalContext | null | undefined): ctx is StandingPolicyApprovalContext {
  return ctx?.authorization === "standing_policy";
}

export type XPostRecord = {
  id: string;
  status: XPostStatus;
  revision: number;
  text: string;
  textHash: string;
  sourceRefs: string[];
  accountId: string;
  accountHandle: string;
  isTest: boolean;
  scheduleKind: ScheduleKind;
  scheduledFor: string | null;
  expiresAt: string | null;
  scheduledDay: string | null;
  approvalHash: string | null;
  approvedRevision: number | null;
  approvedAt: string | null;
  approvedBy: string | null;
  approvalContext: ApprovalContext | null;
  activeAttemptId: string | null;
  xPostId: string | null;
  verifiedAt: string | null;
  reviewRequired: boolean;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  /** Present only when read joined with the active attempt (see POST_WITH_ACTIVE_ATTEMPT reads). */
  activeAttempt?: ActiveAttemptReceipt | null;
};

export type ActiveAttemptReceipt = {
  state: XAttemptState;
  dispatchDeadline: string | null;
  resultReceivedAt: string | null;
};

export type XAttemptRecord = {
  id: string;
  postId: string;
  approvedRevision: number;
  approvalHash: string;
  payloadText: string;
  accountId: string;
  isTest: boolean;
  mode: "live" | "dry_run";
  trigger: "manual" | "schedule";
  executionId: string;
  claimTokenHash: string;
  state: XAttemptState;
  claimedAt: string;
  leaseExpiresAt: string;
  identityCheckedAt: string | null;
  identityHttpStatus: number | null;
  identityAccountId: string | null;
  permitIssuedAt: string | null;
  permitDay: string | null;
  dispatchDeadline: string | null;
  resultReceivedAt: string | null;
  resultHttpStatus: number | null;
  resultFingerprint: string | null;
  xPostId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  rateLimitResetAt: string | null;
  reviewRequired: boolean;
  reviewNote: string | null;
  lookupTokenHash: string | null;
  lookupLeaseExpiresAt: string | null;
  lookupAttempts: number;
  nextLookupAt: string | null;
  verifiedAt: string | null;
  verification: Record<string, unknown> | null;
  reconcileCandidateId: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  updatedAt: string;
};

export type XControl = { paused: boolean; reason: string | null; updatedAt: string | null; updatedBy: string | null };

export type XResult = { status: number; body: Record<string, unknown> };

type Row = Record<string, unknown>;

const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

function json<T>(v: unknown): T | null {
  if (v === null || v === undefined) return null;
  return (typeof v === "string" ? JSON.parse(v) : v) as T;
}

export function mapPost(r: Row): XPostRecord {
  return {
    id: String(r.id),
    status: String(r.status) as XPostStatus,
    revision: Number(r.revision),
    text: String(r.text),
    textHash: String(r.text_hash),
    sourceRefs: json<string[]>(r.source_refs) ?? [],
    accountId: String(r.account_id),
    accountHandle: String(r.account_handle),
    isTest: Boolean(r.is_test),
    scheduleKind: String(r.schedule_kind) as ScheduleKind,
    scheduledFor: toIsoOrNull(r.scheduled_for),
    expiresAt: toIsoOrNull(r.expires_at),
    scheduledDay: str(r.scheduled_day),
    approvalHash: str(r.approval_hash),
    approvedRevision: num(r.approved_revision),
    approvedAt: toIsoOrNull(r.approved_at),
    approvedBy: str(r.approved_by),
    approvalContext: json<ApprovalContext>(r.approval_context),
    activeAttemptId: str(r.active_attempt_id),
    xPostId: str(r.x_post_id),
    verifiedAt: toIsoOrNull(r.verified_at),
    reviewRequired: Boolean(r.review_required),
    lastErrorCode: str(r.last_error_code),
    lastErrorMessage: str(r.last_error_message),
    createdBy: String(r.created_by),
    createdAt: toIsoOrNull(r.created_at) ?? "",
    updatedAt: toIsoOrNull(r.updated_at) ?? "",
    ...("active_attempt_state" in r
      ? {
          activeAttempt:
            r.active_attempt_state === null || r.active_attempt_state === undefined
              ? null
              : {
                  state: String(r.active_attempt_state) as XAttemptState,
                  dispatchDeadline: toIsoOrNull(r.active_dispatch_deadline),
                  resultReceivedAt: toIsoOrNull(r.active_result_received_at),
                },
        }
      : {}),
  };
}

export function mapAttempt(r: Row): XAttemptRecord {
  return {
    id: String(r.id),
    postId: String(r.post_id),
    approvedRevision: Number(r.approved_revision),
    approvalHash: String(r.approval_hash),
    payloadText: String(r.payload_text),
    accountId: String(r.account_id),
    isTest: Boolean(r.is_test),
    mode: String(r.mode) as XAttemptRecord["mode"],
    trigger: String(r.trigger) as XAttemptRecord["trigger"],
    executionId: String(r.execution_id),
    claimTokenHash: String(r.claim_token_hash),
    state: String(r.state) as XAttemptState,
    claimedAt: toIsoOrNull(r.claimed_at) ?? "",
    leaseExpiresAt: toIsoOrNull(r.lease_expires_at) ?? "",
    identityCheckedAt: toIsoOrNull(r.identity_checked_at),
    identityHttpStatus: num(r.identity_http_status),
    identityAccountId: str(r.identity_account_id),
    permitIssuedAt: toIsoOrNull(r.permit_issued_at),
    permitDay: str(r.permit_day),
    dispatchDeadline: toIsoOrNull(r.dispatch_deadline),
    resultReceivedAt: toIsoOrNull(r.result_received_at),
    resultHttpStatus: num(r.result_http_status),
    resultFingerprint: str(r.result_fingerprint),
    xPostId: str(r.x_post_id),
    errorCode: str(r.error_code),
    errorMessage: str(r.error_message),
    rateLimitResetAt: toIsoOrNull(r.rate_limit_reset_at),
    reviewRequired: Boolean(r.review_required),
    reviewNote: str(r.review_note),
    lookupTokenHash: str(r.lookup_token_hash),
    lookupLeaseExpiresAt: toIsoOrNull(r.lookup_lease_expires_at),
    lookupAttempts: Number(r.lookup_attempts ?? 0),
    nextLookupAt: toIsoOrNull(r.next_lookup_at),
    verifiedAt: toIsoOrNull(r.verified_at),
    verification: json<Record<string, unknown>>(r.verification),
    reconcileCandidateId: str(r.reconcile_candidate_id),
    resolvedBy: str(r.resolved_by),
    resolvedAt: toIsoOrNull(r.resolved_at),
    updatedAt: toIsoOrNull(r.updated_at) ?? "",
  };
}

type Sql = ReturnType<typeof getSql>;
type Query = ReturnType<Sql>;

const RETRYABLE_SQLSTATES = new Set(["40001", "40P01", "55P03"]);
export const X_TX_MAX_ATTEMPTS = 3;

export function sqlState(error: unknown): string | null {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : null;
}

/**
 * Every queue mutation runs in one READ COMMITTED transaction behind a single
 * transaction-scoped advisory lock, so mutations are serialized across
 * serverless instances and each statement sees everything committed before
 * the lock was granted. Contention errors are retried a bounded number of
 * times; the whole transaction rolls back on any error.
 */
export async function lockedTransaction(build: (sql: Sql) => Query[]): Promise<Row[][]> {
  const sql = getSql();
  for (let attempt = 1; ; attempt++) {
    try {
      const results = (await sql.transaction(
        [
          sql`SET LOCAL lock_timeout = '5s'`,
          sql`SELECT pg_advisory_xact_lock(hashtext('psl:x-publishing:queue'))`,
          ...build(sql),
        ],
        { isolationLevel: "ReadCommitted" }
      )) as Row[][];
      return results.slice(2);
    } catch (error) {
      const code = sqlState(error);
      if (!code || !RETRYABLE_SQLSTATES.has(code) || attempt >= X_TX_MAX_ATTEMPTS) throw error;
      await new Promise((r) => setTimeout(r, 50 * 2 ** attempt + Math.floor(Math.random() * 50)));
    }
  }
}

export async function getPost(id: string): Promise<XPostRecord | null> {
  const sql = getSql();
  const rows = (await sql`SELECT * FROM x_publishing_posts WHERE id = ${id}::uuid`) as Row[];
  return rows[0] ? mapPost(rows[0]) : null;
}

export async function getAttempt(id: string): Promise<XAttemptRecord | null> {
  const sql = getSql();
  const rows = (await sql`SELECT * FROM x_publishing_attempts WHERE id = ${id}::uuid`) as Row[];
  return rows[0] ? mapAttempt(rows[0]) : null;
}

export async function getControl(): Promise<XControl> {
  const sql = getSql();
  const rows = (await sql`
    SELECT paused, reason, updated_at, updated_by FROM x_publishing_control WHERE id = 1
  `) as Row[];
  const r = rows[0];
  if (!r) return { paused: true, reason: "Never resumed (no control row) — paused by default", updatedAt: null, updatedBy: null };
  return {
    paused: Boolean(r.paused),
    reason: str(r.reason),
    updatedAt: toIsoOrNull(r.updated_at),
    updatedBy: str(r.updated_by),
  };
}

export function validityMinutesFor(kind: ScheduleKind): number | null {
  return kind === "next_manual_run" ? X_LIMITS.nextManualRunValidityMinutes : null;
}

export function previewHashFor(
  post: Pick<XPostRecord, "id" | "accountId" | "text" | "revision" | "isTest" | "scheduledFor" | "sourceRefs">,
  kind: ScheduleKind,
  check: XContentCheck,
  policyVersion: string = X_CONTENT_POLICY_VERSION
): string {
  return previewHash({
    postId: post.id,
    accountId: post.accountId,
    text: post.text,
    revision: post.revision,
    isTest: post.isTest,
    scheduleKind: kind,
    scheduledFor: kind === "scheduled" ? post.scheduledFor : null,
    validityMinutes: validityMinutesFor(kind),
    links: check.links,
    sourceRefs: post.sourceRefs,
    policyVersion,
  });
}

/**
 * Recomputes the approval hash from the stored row. Null when the stored
 * approval no longer matches its own preview (any drift in text, revision,
 * schedule, sources, or policy version).
 */
export function recomputeApprovalHash(post: XPostRecord): string | null {
  const ctx = post.approvalContext;
  if (!ctx || !post.scheduledFor || !post.expiresAt || !post.approvedAt) return null;
  if (post.approvedRevision !== post.revision) return null;
  const check = checkPostText(post.text);
  const ph = previewHashFor(post, post.scheduleKind, check, ctx.policyVersion);
  if (ph !== ctx.previewHash) return null;
  return approvalHash({
    previewHash: ph,
    approvedAt: post.approvedAt,
    scheduledFor: post.scheduledFor,
    expiresAt: post.expiresAt,
    approvedEnv: ctx.env,
    acknowledgedWarnings: ctx.acknowledgedWarnings,
  });
}

/**
 * A permit was issued, the dispatch deadline has passed, and no create
 * receipt was recorded: the post may exist. Derived from the attempt's own
 * deadline and receipts so it is visible without any write; attempts with a
 * recorded result are never affected, however old.
 */
export function isDispatchOverdue(a: ActiveAttemptReceipt | null | undefined, now: Date): boolean {
  return (
    !!a &&
    a.state === "dispatched" &&
    a.resultReceivedAt === null &&
    a.dispatchDeadline !== null &&
    Date.parse(a.dispatchDeadline) <= now.getTime()
  );
}

/**
 * Single mapping used both per row and for SQL-grouped counts, which compute
 * approvalExpired / dispatchOverdue with the same predicates in SQL.
 */
export function displayStateOf(input: { status: XPostStatus; approvalExpired: boolean; dispatchOverdue: boolean }): XDisplayState {
  switch (input.status) {
    case "draft":
      return "draft";
    case "approved":
      return input.approvalExpired ? "expired" : "scheduled";
    case "claimed":
      return "preparing";
    case "dispatched":
      return input.dispatchOverdue ? "uncertain" : "awaiting_confirmation";
    case "created":
      return "created_unconfirmed";
    default:
      return input.status;
  }
}

export function displayState(post: XPostRecord, now: Date): XDisplayState {
  return displayStateOf({
    status: post.status,
    approvalExpired: post.status === "approved" && !!post.expiresAt && Date.parse(post.expiresAt) <= now.getTime(),
    dispatchOverdue: isDispatchOverdue(post.activeAttempt, now),
  });
}

/** Unresolved = needs the owner: uncertain, flagged for review, or dispatched past its deadline without a receipt. */
export function isUnresolved(post: XPostRecord, now: Date): boolean {
  return post.status === "uncertain" || post.reviewRequired || displayState(post, now) === "uncertain";
}

export const OVERDUE_DISPATCH_MESSAGE =
  "No create result was reported before the dispatch deadline; the post may exist. Owner review required — nothing is retried.";

/**
 * The stored transition matching isDispatchOverdue: dispatched attempts past
 * their deadline with no receipt become uncertain (never re-permitted). Used
 * by the claim sweep and, scoped to one attempt, by guarded owner
 * reconciliation actions so they need no new workflow run.
 */
export function overdueDispatchStatement(sql: Sql, input: { isTest: boolean; now: string; attemptId: string | null }) {
  return sql`
    WITH unk AS (
      UPDATE x_publishing_attempts
      SET state = 'uncertain', error_code = 'dispatch_deadline_passed',
          error_message = ${OVERDUE_DISPATCH_MESSAGE}, updated_at = ${input.now}::timestamptz
      WHERE is_test = ${input.isTest} AND state = 'dispatched' AND result_received_at IS NULL
        AND dispatch_deadline <= ${input.now}::timestamptz
        AND (${input.attemptId}::uuid IS NULL OR id = ${input.attemptId}::uuid)
      RETURNING id, post_id
    )
    UPDATE x_publishing_posts p
    SET status = 'uncertain', last_error_code = 'dispatch_deadline_passed',
        last_error_message = ${OVERDUE_DISPATCH_MESSAGE}, updated_at = ${input.now}::timestamptz
    FROM unk
    WHERE p.id = unk.post_id AND p.status = 'dispatched'
    RETURNING p.id, p.revision, unk.id AS attempt_id
  `;
}

export async function emitOverdueUncertain(rows: Row[], isTest: boolean, now: Date): Promise<void> {
  for (const r of rows) {
    await recordXEvent({
      type: X_EVENT_TYPES.uncertain,
      outcome: "outcome_unknown",
      summary: "X create result not reported before the dispatch deadline — owner review required, no retry",
      queueId: String(r.id),
      revision: Number(r.revision),
      attemptId: String(r.attempt_id),
      isTest,
      now,
    });
  }
}

export function todayPhoenix(now: Date): string {
  return phoenixDay(now);
}
