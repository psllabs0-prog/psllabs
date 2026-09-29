import crypto from "node:crypto";

import { getSql } from "@/lib/db/sql";

import type { XGate, XPublishingConfig } from "./config";
import { X_ACCOUNT_ID, X_LIMITS, X_LOOKUP_BACKOFF_MINUTES, X_PROVENANCE } from "./constants";
import { checkPostText, X_CONTENT_POLICY_VERSION } from "./content";
import { recordXEvent, X_EVENT_TYPES, type XEventInput } from "./events";
import { canonicalJson, randomToken, sha256Hex, tokenHash } from "./hash";
import {
  emitOverdueUncertain,
  getAttempt,
  getPost,
  lockedTransaction,
  overdueDispatchStatement,
  recomputeApprovalHash,
  sqlState,
  type XAttemptRecord,
  type XResult,
} from "./records";
import { addMinutes, phoenixDay } from "./time";
import {
  classifyCreateResult,
  verifyLookup,
  type CreateClassification,
  type CreateReport,
  type LookupReport,
} from "./verify";

type Row = Record<string, unknown>;

export type XMode = "live" | "dry_run";

function modeGate(config: XPublishingConfig, attempt: Pick<XAttemptRecord, "mode" | "isTest">): XGate {
  if (attempt.mode === "live") {
    return attempt.isTest ? { enabled: false, reason: "Live attempt on a test item" } : config.live;
  }
  return attempt.isTest ? config.dryRun : { enabled: false, reason: "Dry-run attempt on a live item" };
}

export function gateForMode(config: XPublishingConfig, mode: XMode): XGate {
  return mode === "live" ? config.live : config.dryRun;
}

function tokenMatches(token: string, storedHash: string | null): boolean {
  if (!storedHash) return false;
  const a = Buffer.from(tokenHash(token), "hex");
  const b = Buffer.from(storedHash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function emit(events: XEventInput[]): Promise<void> {
  for (const e of events) await recordXEvent(e);
}

/** Releases an unpermitted claim; the post returns to approved (or expired). */
function releaseStatement(
  sql: ReturnType<typeof getSql>,
  attemptId: string,
  state: "released" | "identity_failed",
  code: string,
  message: string,
  now: string
) {
  return sql`
    WITH rel AS (
      UPDATE x_publishing_attempts
      SET state = ${state}, error_code = ${code}, error_message = ${message}, updated_at = ${now}::timestamptz
      WHERE id = ${attemptId}::uuid AND state IN ('claimed','identity_ok') AND permit_issued_at IS NULL
      RETURNING id, post_id
    )
    UPDATE x_publishing_posts p
    SET status = CASE WHEN p.expires_at <= ${now}::timestamptz THEN 'expired' ELSE 'approved' END,
        active_attempt_id = NULL, updated_at = ${now}::timestamptz
    FROM rel
    WHERE p.id = rel.post_id AND p.status = 'claimed' AND p.active_attempt_id = rel.id
    RETURNING p.id, p.status
  `;
}

export type ClaimInput = {
  mode: XMode;
  trigger: "manual" | "schedule";
  executionId: string;
  now: Date;
};

/**
 * Housekeeping, then at most one unit of work: a due approved post (publish)
 * or a pending read-only lookup. Returns `work: null` when nothing is due, in
 * which case the workflow makes no X API calls.
 */
export async function claimXWork(input: ClaimInput): Promise<XResult> {
  const isTest = input.mode === "dry_run";
  const now = input.now.toISOString();
  const today = phoenixDay(input.now);
  const attemptId = crypto.randomUUID();
  const token = randomToken();
  const th = tokenHash(token);
  const lease = addMinutes(input.now, X_LIMITS.claimLeaseMinutes).toISOString();
  const cap = X_LIMITS.createDispatchesPerPhoenixDay;

  const [expired, , unknown, claimed, lookup] = await lockedTransaction((sql) => [
    sql`
      UPDATE x_publishing_posts
      SET status = 'expired', last_error_code = 'expired_before_dispatch',
          last_error_message = 'Approval window ended before dispatch', updated_at = ${now}::timestamptz
      WHERE is_test = ${isTest} AND status = 'approved' AND expires_at <= ${now}::timestamptz
      RETURNING id, revision
    `,
    sql`
      WITH rel AS (
        UPDATE x_publishing_attempts
        SET state = 'released', error_code = 'lease_expired',
            error_message = 'Claim lease expired before a dispatch permit', updated_at = ${now}::timestamptz
        WHERE is_test = ${isTest} AND state IN ('claimed','identity_ok')
          AND permit_issued_at IS NULL AND lease_expires_at <= ${now}::timestamptz
        RETURNING id, post_id
      )
      UPDATE x_publishing_posts p
      SET status = CASE WHEN p.expires_at <= ${now}::timestamptz THEN 'expired' ELSE 'approved' END,
          active_attempt_id = NULL, updated_at = ${now}::timestamptz
      FROM rel
      WHERE p.id = rel.post_id AND p.status = 'claimed' AND p.active_attempt_id = rel.id
      RETURNING p.id
    `,
    overdueDispatchStatement(sql, { isTest, now, attemptId: null }),
    sql`
      WITH cand AS (
        SELECT p.id, p.revision, p.approval_hash, p.text, p.account_id, p.is_test,
               p.scheduled_for, p.expires_at
        FROM x_publishing_posts p
        WHERE p.is_test = ${isTest} AND p.status = 'approved' AND p.account_id = ${X_ACCOUNT_ID}
          AND p.scheduled_for <= ${now}::timestamptz AND p.expires_at > ${now}::timestamptz
          AND (p.schedule_kind = 'scheduled' OR ${input.trigger}::text = 'manual')
          AND NOT COALESCE((SELECT c.paused FROM x_publishing_control c WHERE c.id = 1), true)
          AND NOT EXISTS (
            SELECT 1 FROM x_publishing_attempts r
            WHERE r.is_test = ${isTest} AND r.rate_limit_reset_at > ${now}::timestamptz
          )
          AND (
            SELECT COUNT(*) FROM x_publishing_attempts a
            WHERE a.is_test = ${isTest}
              AND ((a.permit_issued_at IS NOT NULL AND a.permit_day = ${today})
                OR a.state IN ('claimed','identity_ok'))
          ) < ${cap}
        ORDER BY p.scheduled_for ASC, p.id ASC
        LIMIT 1
      ), ins AS (
        INSERT INTO x_publishing_attempts (
          id, post_id, approved_revision, approval_hash, payload_text, account_id, is_test,
          mode, trigger, execution_id, claim_token_hash, state, claimed_at, lease_expires_at, updated_at
        )
        SELECT ${attemptId}::uuid, cand.id, cand.revision, cand.approval_hash, cand.text, cand.account_id,
               cand.is_test, ${input.mode}::text, ${input.trigger}::text, ${input.executionId}::text, ${th}::text, 'claimed',
               ${now}::timestamptz, ${lease}::timestamptz, ${now}::timestamptz
        FROM cand
        RETURNING id, post_id, approved_revision
      ), upd AS (
        UPDATE x_publishing_posts p
        SET status = 'claimed', active_attempt_id = ${attemptId}::uuid, updated_at = ${now}::timestamptz
        FROM cand WHERE p.id = cand.id
        RETURNING p.id
      )
      SELECT ins.id, ins.post_id, ins.approved_revision, cand.scheduled_for, cand.expires_at
      FROM ins JOIN cand ON cand.id = ins.post_id
    `,
    sql`
      UPDATE x_publishing_attempts
      SET lookup_token_hash = ${th}, lookup_lease_expires_at = ${lease}::timestamptz, updated_at = ${now}::timestamptz
      WHERE id = (
        SELECT a.id FROM x_publishing_attempts a
        WHERE a.is_test = ${isTest} AND a.next_lookup_at <= ${now}::timestamptz
          AND (a.lookup_lease_expires_at IS NULL OR a.lookup_lease_expires_at <= ${now}::timestamptz)
          AND a.lookup_attempts < ${X_LIMITS.maxLookupAttempts}
          AND ((a.state = 'created' AND a.x_post_id IS NOT NULL)
            OR (a.state = 'uncertain' AND a.reconcile_candidate_id IS NOT NULL))
          AND NOT EXISTS (SELECT 1 FROM x_publishing_attempts z WHERE z.id = ${attemptId}::uuid)
        ORDER BY a.next_lookup_at ASC, a.id ASC
        LIMIT 1
      )
      RETURNING id, post_id, state, x_post_id, reconcile_candidate_id
    `,
  ]);

  await emit([
    ...expired.map(
      (r): XEventInput => ({
        type: X_EVENT_TYPES.expired,
        outcome: "skipped",
        summary: "Approved X post expired before dispatch (not posted)",
        queueId: String(r.id),
        revision: Number(r.revision),
        isTest,
        now: input.now,
      })
    ),
  ]);
  await emitOverdueUncertain(unknown, isTest, input.now);

  const c = claimed[0];
  if (c) {
    return {
      status: 200,
      body: {
        work: {
          kind: "publish",
          mode: input.mode,
          attemptId: String(c.id),
          token,
          queueId: String(c.post_id),
          revision: Number(c.approved_revision),
          expectedAccountId: X_ACCOUNT_ID,
          leaseExpiresAt: lease,
        },
      },
    };
  }
  const l = lookup[0];
  if (l) {
    const verify = l.state === "created";
    return {
      status: 200,
      body: {
        work: {
          kind: "lookup",
          mode: input.mode,
          attemptId: String(l.id),
          token,
          xPostId: String(verify ? l.x_post_id : l.reconcile_candidate_id),
          purpose: verify ? "verify" : "reconcile",
          expectedAccountId: X_ACCOUNT_ID,
        },
      },
    };
  }
  return { status: 200, body: { work: null, message: "Nothing due. No X API calls are needed." } };
}

export type IdentityInput = {
  attemptId: string;
  token: string;
  httpStatus: number | null;
  accountId: string | null;
  now: Date;
  config: XPublishingConfig;
};

/** GET /2/users/me evidence. Exact string equality with the locked account ID. */
export async function reportXIdentity(input: IdentityInput): Promise<XResult> {
  const attempt = await getAttempt(input.attemptId);
  if (!attempt) return { status: 404, body: { proceed: false, error: "Unknown attempt." } };
  if (!tokenMatches(input.token, attempt.claimTokenHash)) {
    return { status: 403, body: { proceed: false, error: "Token does not match this attempt." } };
  }
  const matches =
    input.httpStatus === 200 && input.accountId === X_ACCOUNT_ID && attempt.accountId === X_ACCOUNT_ID;
  if (attempt.state === "identity_ok") {
    return { status: 200, body: { proceed: matches, replayed: true } };
  }
  if (attempt.state !== "claimed") {
    return { status: 409, body: { proceed: false, reason: `Attempt is ${attempt.state}; not proceeding.` } };
  }
  const gate = modeGate(input.config, attempt);
  const now = input.now.toISOString();
  const th = attempt.claimTokenHash;

  if (!gate.enabled) {
    await lockedTransaction((sql) => [
      releaseStatement(sql, attempt.id, "released", "publishing_disabled", gate.reason, now),
    ]);
    return { status: 503, body: { proceed: false, reason: gate.reason } };
  }
  if (Date.parse(attempt.leaseExpiresAt) <= input.now.getTime()) {
    await lockedTransaction((sql) => [
      releaseStatement(sql, attempt.id, "released", "lease_expired", "Claim lease expired", now),
    ]);
    return { status: 409, body: { proceed: false, reason: "Claim lease expired." } };
  }

  if (matches) {
    const [rows] = await lockedTransaction((sql) => [
      sql`
        UPDATE x_publishing_attempts SET
          state = 'identity_ok', identity_checked_at = ${now}::timestamptz,
          identity_http_status = ${input.httpStatus}, identity_account_id = ${input.accountId},
          updated_at = ${now}::timestamptz
        WHERE id = ${attempt.id}::uuid AND state = 'claimed' AND claim_token_hash = ${th}
          AND lease_expires_at > ${now}::timestamptz
        RETURNING id
      `,
    ]);
    return rows[0]
      ? { status: 200, body: { proceed: true } }
      : { status: 409, body: { proceed: false, reason: "Attempt changed concurrently; not proceeding." } };
  }

  const mismatch = input.httpStatus === 200;
  const code = mismatch ? "account_mismatch" : "identity_check_failed";
  const message = mismatch
    ? "Authenticated X account did not match the locked destination; queue paused"
    : `Account check returned ${input.httpStatus ?? "no response"}`;
  await lockedTransaction((sql) => [
    sql`
      UPDATE x_publishing_attempts SET
        identity_checked_at = ${now}::timestamptz, identity_http_status = ${input.httpStatus},
        identity_account_id = ${input.accountId}, updated_at = ${now}::timestamptz
      WHERE id = ${attempt.id}::uuid AND state = 'claimed' AND claim_token_hash = ${th}
    `,
    releaseStatement(sql, attempt.id, "identity_failed", code, message, now),
    ...(mismatch
      ? [
          sql`
            INSERT INTO x_publishing_control (id, paused, reason, updated_at, updated_by)
            VALUES (1, true, ${message}, ${now}::timestamptz, 'x-publisher')
            ON CONFLICT (id) DO UPDATE SET
              paused = true, reason = EXCLUDED.reason,
              updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by
          `,
        ]
      : []),
  ]);
  if (mismatch) {
    await recordXEvent({
      type: X_EVENT_TYPES.identityMismatch,
      outcome: "failed",
      summary: "Authenticated X account did not match the locked destination — publishing paused, nothing sent",
      queueId: attempt.postId,
      revision: attempt.approvedRevision,
      attemptId: attempt.id,
      isTest: attempt.isTest,
      now: input.now,
    });
  }
  return { status: 200, body: { proceed: false, reason: message } };
}

export type DispatchInput = { attemptId: string; token: string; now: Date; config: XPublishingConfig };

const ALREADY_ISSUED =
  "A dispatch permit was already issued for this attempt. A second permit is never issued; if the first response was lost, that delivery is sacrificed and the attempt goes to review.";

/**
 * One-time permit to call Create Post. Every precondition is rechecked inside
 * the serialized transaction and the attempt is durably marked dispatched
 * before the text is returned.
 */
export async function requestXDispatchPermit(input: DispatchInput): Promise<XResult> {
  const attempt = await getAttempt(input.attemptId);
  if (!attempt) return { status: 404, body: { permit: "denied", error: "Unknown attempt." } };
  if (!tokenMatches(input.token, attempt.claimTokenHash)) {
    return { status: 403, body: { permit: "denied", error: "Token does not match this attempt." } };
  }
  if (attempt.permitIssuedAt) return { status: 200, body: { permit: "already_issued", message: ALREADY_ISSUED } };

  const now = input.now.toISOString();
  const deny = async (status: number, code: string, reason: string, release: boolean): Promise<XResult> => {
    if (release) {
      await lockedTransaction((sql) => [releaseStatement(sql, attempt.id, "released", code, reason, now)]);
    }
    return { status, body: { permit: "denied", code, reason } };
  };

  const gate = modeGate(input.config, attempt);
  if (!gate.enabled) return deny(503, "publishing_disabled", gate.reason, true);
  if (attempt.state !== "identity_ok") {
    return deny(409, "identity_not_confirmed", `Attempt is ${attempt.state}; account check not confirmed.`, true);
  }

  const post = await getPost(attempt.postId);
  if (!post) return deny(409, "post_missing", "Queue item not found.", true);
  const expected = recomputeApprovalHash(post);
  const intact =
    expected !== null &&
    expected === post.approvalHash &&
    expected === attempt.approvalHash &&
    post.approvalContext?.policyVersion === X_CONTENT_POLICY_VERSION &&
    checkPostText(post.text).ok &&
    post.text === attempt.payloadText &&
    post.accountId === X_ACCOUNT_ID;
  if (!intact && post.status === "claimed" && post.activeAttemptId === attempt.id) {
    await lockedTransaction((sql) => [
      releaseStatement(sql, attempt.id, "released", "reapproval_required", "Approval no longer matches the post", now),
      sql`
        UPDATE x_publishing_posts SET
          status = 'draft', revision = revision + 1, approval_hash = NULL, approved_revision = NULL,
          approved_at = NULL, approved_by = NULL, approval_context = NULL, expires_at = NULL,
          scheduled_day = NULL, last_error_code = 'reapproval_required',
          last_error_message = 'Approval no longer matched the post or current content policy; review and approve again',
          updated_at = ${now}::timestamptz
        WHERE id = ${post.id}::uuid AND status = 'approved' AND active_attempt_id IS NULL
      `,
    ]);
    return { status: 409, body: { permit: "denied", code: "reapproval_required", reason: "Approval is no longer valid; owner must re-approve." } };
  }

  const today = phoenixDay(input.now);
  const deadline = addMinutes(input.now, X_LIMITS.dispatchDeadlineMinutes).toISOString();
  const cap = X_LIMITS.createDispatchesPerPhoenixDay;
  let issued: Row | undefined;
  try {
    const [rows] = await lockedTransaction((sql) => [
      sql`
        WITH ok AS (
          SELECT a.id FROM x_publishing_attempts a
          JOIN x_publishing_posts p ON p.id = a.post_id
          WHERE a.id = ${attempt.id}::uuid AND a.claim_token_hash = ${attempt.claimTokenHash}
            AND a.state = 'identity_ok' AND a.permit_issued_at IS NULL
            AND a.lease_expires_at > ${now}::timestamptz
            AND a.account_id = ${X_ACCOUNT_ID} AND a.identity_account_id = a.account_id
            AND p.status = 'claimed' AND p.active_attempt_id = a.id
            AND p.revision = a.approved_revision AND p.approved_revision = a.approved_revision
            AND p.approval_hash = a.approval_hash AND p.approval_hash = ${expected}
            AND p.text = a.payload_text AND p.account_id = a.account_id
            AND p.scheduled_for <= ${now}::timestamptz AND p.expires_at > ${now}::timestamptz
            AND NOT COALESCE((SELECT c.paused FROM x_publishing_control c WHERE c.id = 1), true)
            AND NOT EXISTS (
              SELECT 1 FROM x_publishing_attempts r
              WHERE r.is_test = a.is_test AND r.rate_limit_reset_at > ${now}::timestamptz
            )
            AND (
              SELECT COUNT(*) FROM x_publishing_attempts d
              WHERE d.is_test = a.is_test AND d.permit_day = ${today} AND d.permit_issued_at IS NOT NULL
            ) < ${cap}
        ), upd AS (
          UPDATE x_publishing_attempts a SET
            state = 'dispatched', permit_issued_at = ${now}::timestamptz, permit_day = ${today},
            dispatch_deadline = ${deadline}::timestamptz, updated_at = ${now}::timestamptz
          FROM ok WHERE a.id = ok.id
          RETURNING a.id, a.post_id, a.payload_text, a.mode
        )
        UPDATE x_publishing_posts p
        SET status = 'dispatched', updated_at = ${now}::timestamptz
        FROM upd WHERE p.id = upd.post_id
        RETURNING upd.id AS attempt_id, upd.payload_text, upd.mode
      `,
    ]);
    issued = rows[0];
  } catch (error) {
    if (sqlState(error) !== "23505") throw error;
  }

  if (issued) {
    await recordXEvent({
      type: X_EVENT_TYPES.dispatched,
      outcome: "started",
      summary: "Dispatch permit issued — n8n may now send the approved post once",
      queueId: post.id,
      revision: post.revision,
      attemptId: attempt.id,
      isTest: attempt.isTest,
      now: input.now,
    });
    return {
      status: 200,
      body: {
        permit: "issued",
        attemptId: String(issued.attempt_id),
        mode: String(issued.mode),
        text: String(issued.payload_text),
        dispatchDeadline: deadline,
      },
    };
  }

  const latest = await getAttempt(attempt.id);
  if (latest?.permitIssuedAt) return { status: 200, body: { permit: "already_issued", message: ALREADY_ISSUED } };
  const reason = await explainDenial(attempt, input.now);
  return deny(409, reason.code, reason.reason, true);
}

async function explainDenial(attempt: XAttemptRecord, now: Date): Promise<{ code: string; reason: string }> {
  const sql = getSql();
  const today = phoenixDay(now);
  const [r] = (await sql`
    SELECT
      COALESCE((SELECT paused FROM x_publishing_control WHERE id = 1), true) AS paused,
      (SELECT COUNT(*)::int FROM x_publishing_attempts
        WHERE is_test = ${attempt.isTest} AND permit_day = ${today} AND permit_issued_at IS NOT NULL) AS permits_today,
      (SELECT MAX(rate_limit_reset_at) FROM x_publishing_attempts
        WHERE is_test = ${attempt.isTest} AND rate_limit_reset_at > ${now.toISOString()}::timestamptz) AS limited_until
  `) as Row[];
  const post = await getPost(attempt.postId);
  if (r?.paused) return { code: "paused", reason: "Publishing is paused." };
  if (!post || post.status !== "claimed" || post.activeAttemptId !== attempt.id || post.revision !== attempt.approvedRevision) {
    return { code: "approval_changed", reason: "The post was edited, cancelled, or reclaimed; approval no longer applies." };
  }
  if (post.scheduledFor && Date.parse(post.scheduledFor) > now.getTime()) return { code: "not_due", reason: "Not due yet." };
  if (post.expiresAt && Date.parse(post.expiresAt) <= now.getTime()) return { code: "expired", reason: "Approval window has ended." };
  if (Number(r?.permits_today ?? 0) >= X_LIMITS.createDispatchesPerPhoenixDay) {
    return { code: "daily_cap", reason: "Daily dispatch capacity already used (Phoenix day)." };
  }
  if (r?.limited_until) return { code: "rate_limited", reason: "X rate limit reset time has not passed." };
  if (Date.parse(attempt.leaseExpiresAt) <= now.getTime()) return { code: "lease_expired", reason: "Claim lease expired." };
  return { code: "precondition_failed", reason: "Dispatch preconditions not met." };
}

function resultFingerprint(c: CreateClassification): string {
  return sha256Hex(
    canonicalJson(
      c.kind === "created" ? { kind: c.kind, postId: c.postId } : { kind: c.kind, code: c.code }
    )
  );
}

export type ResultInput = { attemptId: string; token: string; report: CreateReport; now: Date };

/**
 * Records the Create Post response. Accepted even if publishing was disabled
 * after dispatch. Transitions are monotonic and idempotent; conflicting
 * receipts are flagged for review, never auto-resolved.
 */
export async function reportXCreateResult(input: ResultInput): Promise<XResult> {
  const attempt = await getAttempt(input.attemptId);
  if (!attempt) return { status: 404, body: { error: "Unknown attempt." } };
  if (!tokenMatches(input.token, attempt.claimTokenHash)) {
    return { status: 403, body: { error: "Token does not match this attempt." } };
  }
  const c = classifyCreateResult(input.report);
  const fp = resultFingerprint(c);
  const now = input.now.toISOString();
  const base = { queueId: attempt.postId, revision: attempt.approvedRevision, attemptId: attempt.id, isTest: attempt.isTest, now: input.now };

  const flag = async (note: string): Promise<XResult> => {
    await lockedTransaction((sql) => [
      sql`
        UPDATE x_publishing_attempts SET review_required = true, review_note = ${note}, updated_at = ${now}::timestamptz
        WHERE id = ${attempt.id}::uuid
      `,
      sql`
        UPDATE x_publishing_posts SET review_required = true, updated_at = ${now}::timestamptz
        WHERE id = ${attempt.postId}::uuid
      `,
    ]);
    await recordXEvent({ ...base, type: X_EVENT_TYPES.review, outcome: "waiting", summary: `X publishing review required: ${note}` });
    return { status: 409, body: { state: attempt.state, review: true, error: note } };
  };

  if (!attempt.permitIssuedAt) return flag("A create result was reported for an attempt that never received a dispatch permit.");
  if (attempt.resultFingerprint === fp) {
    return { status: 200, body: { applied: false, state: attempt.state, xPostId: attempt.xPostId } };
  }

  let from: string | null = null;
  if (attempt.state === "dispatched") from = "dispatched";
  else if (attempt.state === "uncertain") {
    if (c.kind === "created" && (attempt.xPostId === null || attempt.xPostId === c.postId)) from = "uncertain";
    else if (c.kind !== "created" && attempt.resultFingerprint === null) from = "uncertain";
  } else if ((attempt.state === "created" || attempt.state === "published") && c.kind === "created" && attempt.xPostId === c.postId) {
    return { status: 200, body: { applied: false, state: attempt.state, xPostId: attempt.xPostId } };
  }
  if (!from) {
    return flag(
      `Conflicting create receipt (${c.kind}${c.kind === "created" ? ` ${c.postId}` : ` ${c.code}`}) for an attempt already ${attempt.state}${attempt.xPostId ? ` with X post ${attempt.xPostId}` : ""}.`
    );
  }

  const hs = input.report.httpStatus;
  let rows: Row[];
  try {
    if (c.kind === "created") {
      const lookupLease = addMinutes(input.now, X_LIMITS.claimLeaseMinutes).toISOString();
      [rows] = await lockedTransaction((sql) => [
        sql`
          WITH a AS (
            UPDATE x_publishing_attempts SET
              state = 'created', x_post_id = ${c.postId}, result_received_at = ${now}::timestamptz,
              result_http_status = ${hs}, result_fingerprint = ${fp},
              review_note = ${from === "uncertain" ? "Late create success resolved an uncertain attempt" : null}::text,
              lookup_token_hash = claim_token_hash, lookup_lease_expires_at = ${lookupLease}::timestamptz,
              lookup_attempts = 0, next_lookup_at = ${now}::timestamptz, updated_at = ${now}::timestamptz
            WHERE id = ${attempt.id}::uuid AND state = ${from} AND claim_token_hash = ${attempt.claimTokenHash}
              AND (x_post_id IS NULL OR x_post_id = ${c.postId})
            RETURNING id, post_id
          )
          UPDATE x_publishing_posts p
          SET status = 'created', x_post_id = ${c.postId}, updated_at = ${now}::timestamptz
          FROM a WHERE p.id = a.post_id AND p.active_attempt_id = a.id
          RETURNING p.id
        `,
      ]);
    } else if (c.kind === "rejected") {
      [rows] = await lockedTransaction((sql) => [
        sql`
          WITH a AS (
            UPDATE x_publishing_attempts SET
              state = 'rejected', result_received_at = ${now}::timestamptz, result_http_status = ${hs},
              result_fingerprint = ${fp}, error_code = ${c.code}, error_message = ${c.message},
              rate_limit_reset_at = ${c.rateLimitResetAt}::timestamptz, updated_at = ${now}::timestamptz
            WHERE id = ${attempt.id}::uuid AND state = ${from} AND claim_token_hash = ${attempt.claimTokenHash}
            RETURNING id, post_id
          )
          UPDATE x_publishing_posts p SET
            status = 'rejected', active_attempt_id = NULL, last_error_code = ${c.code},
            last_error_message = ${c.message}, updated_at = ${now}::timestamptz
          FROM a WHERE p.id = a.post_id AND p.active_attempt_id = a.id
          RETURNING p.id
        `,
      ]);
    } else {
      [rows] = await lockedTransaction((sql) => [
        sql`
          WITH a AS (
            UPDATE x_publishing_attempts SET
              state = 'uncertain', result_received_at = ${now}::timestamptz, result_http_status = ${hs},
              result_fingerprint = ${fp}, error_code = ${c.code}, error_message = ${c.message},
              updated_at = ${now}::timestamptz
            WHERE id = ${attempt.id}::uuid AND state = ${from} AND claim_token_hash = ${attempt.claimTokenHash}
            RETURNING id, post_id
          )
          UPDATE x_publishing_posts p SET
            status = 'uncertain', last_error_code = ${c.code}, last_error_message = ${c.message},
            updated_at = ${now}::timestamptz
          FROM a WHERE p.id = a.post_id AND p.active_attempt_id = a.id
          RETURNING p.id
        `,
      ]);
    }
  } catch (error) {
    if (sqlState(error) === "23505") return flag("The reported X post ID is already linked to another attempt.");
    throw error;
  }
  if (!rows[0]) return flag("Attempt changed concurrently while recording the create result.");

  if (c.kind === "created") {
    await recordXEvent({ ...base, xPostId: c.postId, type: X_EVENT_TYPES.created, outcome: "submitted", summary: `X returned a post ID (${X_PROVENANCE}); read-only verification pending` });
    return { status: 200, body: { applied: true, state: "created", next: "lookup", attemptId: attempt.id, xPostId: c.postId } };
  }
  if (c.kind === "rejected") {
    await recordXEvent({ ...base, type: X_EVENT_TYPES.rejected, outcome: "failed", summary: `X rejected the post (${c.code}); not posted, no automatic retry` });
    return { status: 200, body: { applied: true, state: "rejected", code: c.code, message: c.message, rateLimitResetAt: c.rateLimitResetAt, retry: false } };
  }
  await recordXEvent({ ...base, type: X_EVENT_TYPES.uncertain, outcome: "outcome_unknown", summary: `X create outcome uncertain (${c.code}) — owner review required, no retry` });
  return {
    status: 200,
    body: { applied: true, state: "uncertain", code: c.code, message: "Do not retry. The post may exist; owner review is required in /admin-social." },
  };
}

export type LookupInput = { attemptId: string; token: string; report: LookupReport; now: Date };

/** Read-only lookup evidence (GET /2/tweets/{id}). Never authorizes another create. */
export async function reportXLookup(input: LookupInput): Promise<XResult> {
  const attempt = await getAttempt(input.attemptId);
  if (!attempt) return { status: 404, body: { error: "Unknown attempt." } };
  if (!tokenMatches(input.token, attempt.lookupTokenHash)) {
    return { status: 403, body: { error: "Token does not match the current lookup for this attempt." } };
  }
  const reconcile = attempt.state === "uncertain" && attempt.reconcileCandidateId !== null;
  const target = reconcile ? attempt.reconcileCandidateId! : attempt.xPostId;
  if (!target || !(attempt.state === "created" || attempt.state === "published" || reconcile)) {
    return { status: 409, body: { error: `Attempt is ${attempt.state}; no lookup pending.` } };
  }
  const verdict = verifyLookup({
    expectedPostId: target,
    expectedAuthorId: X_ACCOUNT_ID,
    approvedText: attempt.payloadText,
    report: input.report,
  });
  if (attempt.state === "published") {
    return { status: 200, body: { applied: false, state: "published", verdict: verdict.kind } };
  }

  const now = input.now.toISOString();
  const lth = attempt.lookupTokenHash!;
  const base = { queueId: attempt.postId, revision: attempt.approvedRevision, attemptId: attempt.id, isTest: attempt.isTest, now: input.now, xPostId: target };

  if (verdict.kind === "confirmed") {
    const verification = JSON.stringify({
      provenance: X_PROVENANCE,
      source: reconcile ? "owner_supplied_candidate" : "create_response",
      observedAt: now,
      postId: target,
      authorId: X_ACCOUNT_ID,
      createdAt: verdict.createdAt,
      textMatched: true,
    });
    let rows: Row[];
    try {
      [rows] = await lockedTransaction((sql) => [
        sql`
          WITH a AS (
            UPDATE x_publishing_attempts SET
              state = 'published', x_post_id = ${target}, verified_at = ${now}::timestamptz,
              verification = ${verification}::jsonb, next_lookup_at = NULL, lookup_lease_expires_at = NULL,
              reconcile_candidate_id = NULL, review_required = false, updated_at = ${now}::timestamptz
            WHERE id = ${attempt.id}::uuid AND state = ${attempt.state} AND lookup_token_hash = ${lth}
              AND ((${reconcile}::boolean AND reconcile_candidate_id = ${target})
                OR (NOT ${reconcile}::boolean AND x_post_id = ${target}))
            RETURNING id, post_id
          )
          UPDATE x_publishing_posts p SET
            status = 'published', x_post_id = ${target}, verified_at = ${now}::timestamptz,
            review_required = false, updated_at = ${now}::timestamptz
          FROM a WHERE p.id = a.post_id AND p.active_attempt_id = a.id
          RETURNING p.id
        `,
      ]);
    } catch (error) {
      if (sqlState(error) !== "23505") throw error;
      rows = [];
    }
    if (!rows[0]) return { status: 409, body: { error: "Attempt changed concurrently or post ID already linked; not applied." } };
    await recordXEvent({
      ...base,
      type: X_EVENT_TYPES.published,
      outcome: "completed",
      summary: `X post published and lookup-confirmed (${X_PROVENANCE})${reconcile ? " via owner reconciliation" : ""}`,
    });
    return { status: 200, body: { applied: true, state: "published", verified: true } };
  }

  if (verdict.kind === "mismatch") {
    if (reconcile) {
      await lockedTransaction((sql) => [
        sql`
          UPDATE x_publishing_attempts SET
            reconcile_candidate_id = NULL, next_lookup_at = NULL, lookup_lease_expires_at = NULL,
            review_required = true, review_note = ${`Candidate X post ${target} did not match: ${verdict.message}`},
            updated_at = ${now}::timestamptz
          WHERE id = ${attempt.id}::uuid AND state = 'uncertain' AND lookup_token_hash = ${lth}
        `,
      ]);
      return { status: 200, body: { applied: true, state: "uncertain", verified: false, code: verdict.code } };
    }
    await lockedTransaction((sql) => [
      sql`
        WITH a AS (
          UPDATE x_publishing_attempts SET
            state = 'uncertain', error_code = ${`lookup_${verdict.code}`}, error_message = ${verdict.message},
            review_required = true, review_note = 'Lookup evidence did not match the approved post',
            next_lookup_at = NULL, lookup_lease_expires_at = NULL, updated_at = ${now}::timestamptz
          WHERE id = ${attempt.id}::uuid AND state = 'created' AND lookup_token_hash = ${lth}
          RETURNING id, post_id
        )
        UPDATE x_publishing_posts p SET
          status = 'uncertain', review_required = true, last_error_code = ${`lookup_${verdict.code}`},
          last_error_message = ${verdict.message}, updated_at = ${now}::timestamptz
        FROM a WHERE p.id = a.post_id AND p.active_attempt_id = a.id
      `,
    ]);
    await recordXEvent({ ...base, type: X_EVENT_TYPES.uncertain, outcome: "outcome_unknown", summary: `X lookup did not match the approved post (${verdict.code}) — owner review required` });
    return { status: 200, body: { applied: true, state: "uncertain", verified: false, code: verdict.code } };
  }

  const attempts = attempt.lookupAttempts + 1;
  const exhausted = attempts >= X_LIMITS.maxLookupAttempts;
  const next = exhausted
    ? null
    : addMinutes(input.now, X_LOOKUP_BACKOFF_MINUTES[Math.min(attempts - 1, X_LOOKUP_BACKOFF_MINUTES.length - 1)]).toISOString();
  const note = exhausted ? `Read-only verification failed ${attempts} times (${verdict.code}); post ID retained` : null;
  await lockedTransaction((sql) => [
    sql`
      UPDATE x_publishing_attempts SET
        lookup_attempts = ${attempts}, next_lookup_at = ${next}::timestamptz, lookup_lease_expires_at = NULL,
        error_code = ${`lookup_${verdict.code}`},
        review_required = review_required OR ${exhausted}::boolean,
        review_note = COALESCE(${note}::text, review_note),
        reconcile_candidate_id = CASE WHEN ${exhausted}::boolean AND state = 'uncertain' THEN NULL ELSE reconcile_candidate_id END,
        updated_at = ${now}::timestamptz
      WHERE id = ${attempt.id}::uuid AND state = ${attempt.state} AND lookup_token_hash = ${lth}
    `,
    ...(exhausted
      ? [sql`UPDATE x_publishing_posts SET review_required = true, updated_at = ${now}::timestamptz WHERE id = ${attempt.postId}::uuid`]
      : []),
  ]);
  if (exhausted) {
    await recordXEvent({ ...base, type: X_EVENT_TYPES.review, outcome: "waiting", summary: "X read-only verification exhausted its retries — owner review required" });
  }
  return { status: 200, body: { applied: true, state: attempt.state, verified: false, code: verdict.code, nextLookupAt: next } };
}
