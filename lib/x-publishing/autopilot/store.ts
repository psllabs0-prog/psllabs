import crypto from "node:crypto";

import { getSql } from "@/lib/db/sql";
import { toIsoOrNull } from "@/lib/ops/mission-control/events";
import { X_DRAFT_SOURCE_SNAPSHOT } from "@/lib/x-drafts/source-snapshot";
import { similarity } from "@/lib/x-drafts/validate";

import { reservationCapacityOkSql, X_DAILY_CAP } from "../capacity";
import { X_ACCOUNT_HANDLE, X_ACCOUNT_ID, X_LIMITS } from "../constants";
import { checkPostText, X_CONTENT_POLICY_VERSION } from "../content";
import { recordXEvent, X_EVENT_TYPES } from "../events";
import { approvalHash, textHash } from "../hash";
import { readOnlySnapshot } from "../reads";
import {
  lockedTransaction,
  previewHashFor,
  sqlState,
  type StandingPolicyApprovalContext,
  type XPostRecord,
  type XResult,
} from "../records";
import { formatPhoenix } from "../time";

import { currentLibraryReview, type XLibraryReview, type XTemplateReview } from "./eligibility";
import {
  currentAutopilotSlot,
  upcomingAutopilotSlots,
  X_AUTOPILOT_ACTOR,
  X_AUTOPILOT_POLICY,
  X_AUTOPILOT_POLICY_HASH,
  X_AUTOPILOT_POLICY_VERSION,
  type XAutopilotSlot,
} from "./policy";

type Sql = ReturnType<typeof getSql>;
type Row = Record<string, unknown>;

/** Pending standing-policy posts withdrawn by the system (not dispatched), so the template stays available. */
export const X_AUTOPILOT_WITHDRAW_CODES = ["autopilot_disabled", "autopilot_authorization_invalid"] as const;

export type XAutopilotAuthorization = {
  id: string;
  isTest: boolean;
  policyId: string;
  policyVersion: string;
  policyHash: string;
  libraryId: string;
  libraryVersion: string;
  templateHashes: Record<string, string>;
  sourceHashes: Record<string, string>;
  accountId: string;
  statement: string;
  authorizedAt: string;
  authorizedBy: string;
  authorizedEnv: string;
  revokedAt: string | null;
  revokedBy: string | null;
  revokeReason: string | null;
};

function json<T>(v: unknown, fallback: T): T {
  if (v === null || v === undefined) return fallback;
  return (typeof v === "string" ? JSON.parse(v) : v) as T;
}

export function mapAuthorization(r: Row): XAutopilotAuthorization {
  return {
    id: String(r.id),
    isTest: Boolean(r.is_test),
    policyId: String(r.policy_id),
    policyVersion: String(r.policy_version),
    policyHash: String(r.policy_hash),
    libraryId: String(r.library_id),
    libraryVersion: String(r.library_version),
    templateHashes: json<Record<string, string>>(r.template_hashes, {}),
    sourceHashes: json<Record<string, string>>(r.source_hashes, {}),
    accountId: String(r.account_id),
    statement: String(r.statement),
    authorizedAt: toIsoOrNull(r.authorized_at) ?? "",
    authorizedBy: String(r.authorized_by),
    authorizedEnv: String(r.authorized_env),
    revokedAt: toIsoOrNull(r.revoked_at),
    revokedBy: r.revoked_by === null || r.revoked_by === undefined ? null : String(r.revoked_by),
    revokeReason: r.revoke_reason === null || r.revoke_reason === undefined ? null : String(r.revoke_reason),
  };
}

// ---------------------------------------------------------------------------
// Read queries (fixed text, bound parameters; usable in a READ ONLY snapshot)
// ---------------------------------------------------------------------------

const UNRESOLVED_WHERE = `(u.status = 'uncertain' OR u.review_required
  OR COALESCE(ua.state = 'dispatched' AND ua.result_received_at IS NULL AND ua.dispatch_deadline <= $2::timestamptz, false))`;

export function authorizationsQuery(sql: Sql, isTest: boolean, limit: number) {
  return sql.query(
    `SELECT * FROM x_publishing_autopilot_authorizations WHERE is_test = $1
     ORDER BY (revoked_at IS NULL) DESC, authorized_at DESC, id DESC LIMIT $2`,
    [isTest, limit]
  );
}

/**
 * Templates already used by an automatic authorization. A template stays
 * available again only if its post was never permitted and either expired or
 * was withdrawn by the system (autopilot disabled / authorization changed).
 */
export function consumedTemplatesQuery(sql: Sql, isTest: boolean) {
  return sql.query(
    `SELECT DISTINCT s.template_id FROM x_publishing_autopilot_slots s
     JOIN x_publishing_posts p ON p.id = s.post_id
     WHERE s.is_test = $1 AND s.outcome = 'authorized'
       AND (
         EXISTS (SELECT 1 FROM x_publishing_attempts a WHERE a.post_id = p.id AND a.permit_issued_at IS NOT NULL)
         OR NOT (p.status = 'expired' OR (p.status = 'cancelled' AND COALESCE(p.last_error_code, '') = ANY($2::text[])))
       )`,
    [isTest, [...X_AUTOPILOT_WITHDRAW_CODES]]
  );
}

/** Text that must not be repeated: anything scheduled, in flight, uncertain, published, or ever sent. */
export function usedTextsQuery(sql: Sql, isTest: boolean) {
  return sql.query(
    `SELECT text AS t FROM x_publishing_posts
       WHERE is_test = $1 AND account_id = $2
         AND status IN ('approved','claimed','dispatched','created','published','uncertain')
     UNION
     SELECT payload_text AS t FROM x_publishing_attempts WHERE is_test = $1 AND permit_issued_at IS NOT NULL`,
    [isTest, X_ACCOUNT_ID]
  );
}

/** Operational gates for one Phoenix day, with the same predicates the guarded insert uses. */
export function gateQuery(sql: Sql, isTest: boolean, now: string, day: string) {
  return sql.query(
    `SELECT
       COALESCE((SELECT paused FROM x_publishing_control WHERE id = 1), true) AS paused,
       (SELECT COUNT(*)::int FROM x_publishing_posts u LEFT JOIN x_publishing_attempts ua ON ua.id = u.active_attempt_id
         WHERE u.is_test = $1 AND ${UNRESOLVED_WHERE}) AS unresolved,
       (SELECT MAX(rate_limit_reset_at) FROM x_publishing_attempts
         WHERE is_test = $1 AND rate_limit_reset_at > $2::timestamptz) AS limited_until,
       (SELECT COUNT(*)::int FROM x_publishing_posts q
         WHERE q.is_test = $1 AND q.account_id = $4 AND q.scheduled_day = $3
           AND q.status IN ('approved','claimed') AND q.expires_at > $2::timestamptz) AS reserved,
       (SELECT COUNT(*)::int FROM x_publishing_attempts d
         WHERE d.is_test = $1 AND d.permit_day = $3 AND d.permit_issued_at IS NOT NULL) AS permits`,
    [isTest, now, day, X_ACCOUNT_ID]
  );
}

export function slotRowsQuery(sql: Sql, isTest: boolean, keys: string[]) {
  return sql.query(
    `SELECT s.*, p.status AS post_status, p.x_post_id AS post_x_post_id, p.revision AS post_revision
     FROM x_publishing_autopilot_slots s LEFT JOIN x_publishing_posts p ON p.id = s.post_id
     WHERE s.is_test = $1 AND s.slot_key = ANY($2::text[])`,
    [isTest, keys]
  );
}

export function recentSlotsQuery(sql: Sql, isTest: boolean, limit: number) {
  return sql.query(
    `SELECT s.*, p.status AS post_status, p.x_post_id AS post_x_post_id, p.revision AS post_revision
     FROM x_publishing_autopilot_slots s LEFT JOIN x_publishing_posts p ON p.id = s.post_id
     WHERE s.is_test = $1 ORDER BY s.slot_at DESC LIMIT $2`,
    [isTest, limit]
  );
}

export function standingPostCountsQuery(sql: Sql, isTest: boolean, now: string) {
  return sql.query(
    `SELECT
       COUNT(*)::int AS authorized,
       COUNT(*) FILTER (WHERE u.status = 'published')::int AS verified,
       COUNT(*) FILTER (WHERE ${UNRESOLVED_WHERE})::int AS uncertain,
       COUNT(*) FILTER (WHERE u.status IN ('approved','claimed','dispatched','created'))::int AS in_progress
     FROM x_publishing_posts u LEFT JOIN x_publishing_attempts ua ON ua.id = u.active_attempt_id
     WHERE u.is_test = $1 AND u.approval_context->>'authorization' = 'standing_policy'`,
    [isTest, now]
  );
}

export function skipCountQuery(sql: Sql, isTest: boolean) {
  return sql.query(
    `SELECT COUNT(*)::int AS skipped FROM x_publishing_autopilot_slots WHERE is_test = $1 AND outcome = 'skipped'`,
    [isTest]
  );
}

// ---------------------------------------------------------------------------
// Template evaluation (pure)
// ---------------------------------------------------------------------------

export type XTemplateStatus =
  | "eligible"
  | "fails_checks"
  | "not_authorized"
  | "changed_since_authorization"
  | "consumed"
  | "duplicate"
  | "near_duplicate";

export type XTemplateState = { id: string; hash: string; status: XTemplateStatus; detail: string | null };

export function evaluateTemplates(input: {
  review: XLibraryReview;
  authorization: Pick<XAutopilotAuthorization, "templateHashes" | "policyHash"> | null;
  consumed: ReadonlySet<string>;
  usedTexts: readonly string[];
}): XTemplateState[] {
  const usedHashes = new Set(input.usedTexts.map((t) => textHash(X_ACCOUNT_ID, t)));
  const policyOk = input.authorization?.policyHash === input.review.policyHash;
  return input.review.templates.map((t): XTemplateState => {
    const base = { id: t.id, hash: t.hash };
    if (!t.eligible) return { ...base, status: "fails_checks", detail: t.problems.join("; ") };
    const authorized = policyOk ? input.authorization?.templateHashes[t.id] : undefined;
    if (authorized === undefined) return { ...base, status: "not_authorized", detail: "Not in the active authorization." };
    if (authorized !== t.hash) {
      return { ...base, status: "changed_since_authorization", detail: "Wording, citation, or cited source changed after authorization." };
    }
    if (input.consumed.has(t.id)) return { ...base, status: "consumed", detail: "Already used by an automatic authorization." };
    if (usedHashes.has(t.textHash)) return { ...base, status: "duplicate", detail: "Identical text is already scheduled, sent, or published." };
    let best = 0;
    for (const u of input.usedTexts) best = Math.max(best, similarity(t.text, u));
    if (best >= X_AUTOPILOT_POLICY.nearDuplicateThreshold) {
      return { ...base, status: "near_duplicate", detail: `Too similar to an existing post (${Math.round(best * 100)}%).` };
    }
    return { ...base, status: "eligible", detail: null };
  });
}

// ---------------------------------------------------------------------------
// One slot (called by the scheduled claim; at most one post per slot)
// ---------------------------------------------------------------------------

export type XAutopilotRun =
  | { outcome: "none"; reason: "outside_window" | "autopilot_off"; slotKey: string | null }
  | { outcome: "already_authorized"; slotKey: string; postId: string | null }
  | { outcome: "authorized"; slotKey: string; postId: string; templateId: string }
  | { outcome: "skipped"; slotKey: string; reason: string; detail: string };

function clip(value: string): string {
  const max = X_LIMITS.maxSourceRefLength;
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/** Stored as source_refs (internal, never posted). */
export function standingPolicyRefs(t: XTemplateReview, libraryVersion: string, authorizationId: string): string[] {
  const byId = new Map(X_DRAFT_SOURCE_SNAPSHOT.map((s) => [s.id, s]));
  return [
    clip(`Standing-policy autopilot ${X_AUTOPILOT_POLICY_VERSION}; library ${libraryVersion.slice(0, 12)}; template ${t.id} (${t.hash.slice(0, 12)}).`),
    clip(`Purpose: ${t.template.purpose}`),
    clip(`Sources: ${t.template.sourceIds.map((id) => `${id} (${byId.get(id)?.url ?? byId.get(id)?.origin ?? "unknown"})`).join("; ")}`),
    clip(`Excerpt [${t.template.excerpt.sourceId}]: "${t.template.excerpt.quote}"`),
    clip(`Context: ${t.template.context} Authorized by standing policy (authorization ${authorizationId}), not by individual owner review.`),
  ];
}

type Gate = { paused: boolean; unresolved: number; limitedUntil: string | null; reserved: number; permits: number };

function mapGate(r: Row | undefined): Gate {
  return {
    paused: r ? Boolean(r.paused) : true,
    unresolved: Number(r?.unresolved ?? 0),
    limitedUntil: toIsoOrNull(r?.limited_until),
    reserved: Number(r?.reserved ?? 0),
    permits: Number(r?.permits ?? 0),
  };
}

function gateSkip(g: Gate, day: string): { reason: string; detail: string } | null {
  if (g.paused) return { reason: "paused", detail: "Publishing is paused; no automatic authorization while paused." };
  if (g.unresolved > 0) {
    return { reason: "unresolved_review", detail: `${g.unresolved} item(s) need owner review; autopilot waits until they are resolved.` };
  }
  if (g.limitedUntil) return { reason: "rate_limited", detail: `X rate limit in effect until ${g.limitedUntil}.` };
  if (g.reserved + g.permits >= X_DAILY_CAP) {
    return {
      reason: "daily_cap",
      detail: `Phoenix date ${day}: ${g.reserved + g.permits} of ${X_DAILY_CAP} used (${g.reserved} reserved, ${g.permits} dispatch permit(s) issued).`,
    };
  }
  return null;
}

async function recordSkip(input: {
  isTest: boolean;
  slot: XAutopilotSlot;
  reason: string;
  detail: string;
  checks: Record<string, unknown>;
  now: Date;
}): Promise<XAutopilotRun> {
  const now = input.now.toISOString();
  await lockedTransaction((sql) => [
    sql`
      INSERT INTO x_publishing_autopilot_slots (
        is_test, slot_key, policy_id, slot_at, phoenix_day, outcome, reason, detail, checks, first_checked_at, updated_at
      ) VALUES (
        ${input.isTest}, ${input.slot.key}, ${X_AUTOPILOT_POLICY.id}, ${input.slot.slotAt.toISOString()}::timestamptz,
        ${input.slot.day}, 'skipped', ${input.reason}, ${input.detail}, ${JSON.stringify(input.checks)}::jsonb,
        ${now}::timestamptz, ${now}::timestamptz
      )
      ON CONFLICT (is_test, slot_key) DO UPDATE SET
        reason = EXCLUDED.reason, detail = EXCLUDED.detail, checks = EXCLUDED.checks, updated_at = EXCLUDED.updated_at
      WHERE x_publishing_autopilot_slots.outcome = 'skipped'
    `,
  ]);
  await recordXEvent({
    type: X_EVENT_TYPES.autopilotSlotSkipped,
    outcome: "skipped",
    summary: `X autopilot slot ${input.slot.day} ${input.slot.window} skipped (${input.reason}): ${input.detail}`,
    queueId: null,
    revision: null,
    isTest: input.isTest,
    now: input.now,
    discriminator: `${input.slot.key}:${input.reason}`,
  });
  return { outcome: "skipped", slotKey: input.slot.key, reason: input.reason, detail: input.detail };
}

/**
 * Decides the current slot once: authorizes at most one reviewed template as
 * an approved post for the slot's window, or records why it was skipped.
 * Every gate is rechecked inside the serialized transaction; repeated checks
 * of the same slot never create a second post.
 */
export async function runAutopilotSlot(input: { isTest: boolean; environment: string; now: Date }): Promise<XAutopilotRun> {
  const slot = currentAutopilotSlot(input.now);
  if (!slot) return { outcome: "none", reason: "outside_window", slotKey: null };
  const sql = getSql();
  const at = input.now.toISOString();
  const [authRows, slotRows, consumedRows, usedRows, gateRows] = await readOnlySnapshot(sql, [
    authorizationsQuery(sql, input.isTest, 1),
    slotRowsQuery(sql, input.isTest, [slot.key]),
    consumedTemplatesQuery(sql, input.isTest),
    usedTextsQuery(sql, input.isTest),
    gateQuery(sql, input.isTest, at, slot.day),
  ]);
  const auth = authRows[0] && authRows[0].revoked_at === null ? mapAuthorization(authRows[0]) : null;
  if (!auth) return { outcome: "none", reason: "autopilot_off", slotKey: slot.key };
  if (slotRows[0]?.outcome === "authorized") {
    return { outcome: "already_authorized", slotKey: slot.key, postId: slotRows[0].post_id ? String(slotRows[0].post_id) : null };
  }

  const review = currentLibraryReview();
  const states = evaluateTemplates({
    review,
    authorization: auth,
    consumed: new Set(consumedRows.map((r) => String(r.template_id))),
    usedTexts: usedRows.map((r) => String(r.t)),
  });
  const tally: Record<string, number> = {};
  for (const s of states) tally[s.status] = (tally[s.status] ?? 0) + 1;
  const checks = { authorizationId: auth.id, libraryVersion: review.version, policyHash: X_AUTOPILOT_POLICY_HASH, templates: tally };

  if (auth.policyHash !== X_AUTOPILOT_POLICY_HASH || auth.policyId !== X_AUTOPILOT_POLICY.id) {
    return recordSkip({
      ...input,
      slot,
      reason: "authorization_outdated",
      detail: "The standing policy changed since it was authorized; the owner must review and authorize the new version.",
      checks,
    });
  }
  const blocked = gateSkip(mapGate(gateRows[0]), slot.day);
  if (blocked) return recordSkip({ ...input, slot, ...blocked, checks });

  const chosen = states.find((s) => s.status === "eligible");
  if (!chosen) {
    const authorized = states.filter((s) => !["fails_checks", "not_authorized", "changed_since_authorization"].includes(s.status)).length;
    return recordSkip({
      ...input,
      slot,
      reason: authorized === 0 ? "no_authorized_templates" : "library_exhausted",
      detail:
        authorized === 0
          ? "No template in the current library matches the active authorization; the owner must review the changed library."
          : `All ${authorized} authorized template(s) are used or would duplicate existing posts. Nothing is generated to fill the slot.`,
      checks,
    });
  }

  const t = review.templates.find((r) => r.id === chosen.id)!;
  const postId = crypto.randomUUID();
  const refs = standingPolicyRefs(t, review.version, auth.id);
  const check = checkPostText(t.text);
  const scheduledFor = slot.slotAt.toISOString();
  const expiresAt = slot.closesAt.toISOString();
  const preview = previewHashFor(
    { id: postId, accountId: X_ACCOUNT_ID, text: t.text, revision: 1, isTest: input.isTest, scheduledFor, sourceRefs: refs },
    "scheduled",
    check
  );
  const context: StandingPolicyApprovalContext = {
    authorization: "standing_policy",
    previewHash: preview,
    acknowledgedWarnings: [],
    policyVersion: X_CONTENT_POLICY_VERSION,
    env: input.environment,
    links: check.links,
    weightedLength: check.weightedLength,
    validityMinutes: null,
    standingPolicy: {
      policyId: X_AUTOPILOT_POLICY.id,
      policyVersion: X_AUTOPILOT_POLICY_VERSION,
      policyHash: X_AUTOPILOT_POLICY_HASH,
      libraryId: review.libraryId,
      libraryVersion: review.version,
      templateId: t.id,
      templateHash: t.hash,
      sourceIds: [...t.template.sourceIds],
      sourceHashes: t.sources,
      acceptedWarnings: t.template.acceptedWarnings.map((w) => ({ ...w })),
      authorizationId: auth.id,
      authorizationGrantedAt: auth.authorizedAt,
      authorizationGrantedBy: auth.authorizedBy,
      slotKey: slot.key,
      slotAt: scheduledFor,
      actor: X_AUTOPILOT_ACTOR,
    },
  };
  const hash = approvalHash({
    previewHash: preview,
    approvedAt: at,
    scheduledFor,
    expiresAt,
    approvedEnv: input.environment,
    acknowledgedWarnings: [],
  });

  let inserted: Row | undefined;
  try {
    const [rows] = await lockedTransaction((q) => [
      q`
        WITH ok AS (
          SELECT 1 AS ok
          WHERE EXISTS (
              SELECT 1 FROM x_publishing_autopilot_authorizations z
              WHERE z.id = ${auth.id}::uuid AND z.is_test = ${input.isTest} AND z.revoked_at IS NULL
                AND z.policy_hash = ${X_AUTOPILOT_POLICY_HASH} AND z.template_hashes ->> ${t.id} = ${t.hash}
            )
            AND NOT COALESCE((SELECT c.paused FROM x_publishing_control c WHERE c.id = 1), true)
            AND NOT EXISTS (
              SELECT 1 FROM x_publishing_posts u LEFT JOIN x_publishing_attempts ua ON ua.id = u.active_attempt_id
              WHERE u.is_test = ${input.isTest} AND (u.status = 'uncertain' OR u.review_required
                OR COALESCE(ua.state = 'dispatched' AND ua.result_received_at IS NULL AND ua.dispatch_deadline <= ${at}::timestamptz, false))
            )
            AND NOT EXISTS (
              SELECT 1 FROM x_publishing_attempts r WHERE r.is_test = ${input.isTest} AND r.rate_limit_reset_at > ${at}::timestamptz
            )
            AND ${reservationCapacityOkSql(q, { isTest: input.isTest, day: slot.day, now: at, excludePostId: null })}
            AND NOT EXISTS (
              SELECT 1 FROM x_publishing_autopilot_slots s
              WHERE s.is_test = ${input.isTest} AND s.slot_key = ${slot.key} AND s.outcome = 'authorized'
            )
            AND NOT EXISTS (
              SELECT 1 FROM x_publishing_autopilot_slots s JOIN x_publishing_posts p ON p.id = s.post_id
              WHERE s.is_test = ${input.isTest} AND s.outcome = 'authorized' AND s.template_id = ${t.id}
                AND (
                  EXISTS (SELECT 1 FROM x_publishing_attempts a WHERE a.post_id = p.id AND a.permit_issued_at IS NOT NULL)
                  OR NOT (p.status = 'expired' OR (p.status = 'cancelled' AND COALESCE(p.last_error_code, '') = ANY(${[...X_AUTOPILOT_WITHDRAW_CODES]}::text[])))
                )
            )
            AND NOT EXISTS (
              SELECT 1 FROM x_publishing_posts q2
              WHERE q2.is_test = ${input.isTest} AND q2.account_id = ${X_ACCOUNT_ID} AND q2.text_hash = ${t.textHash}
                AND q2.status IN ('approved','claimed','dispatched','created','published','uncertain')
            )
            AND NOT EXISTS (
              SELECT 1 FROM x_publishing_attempts d
              WHERE d.is_test = ${input.isTest} AND d.permit_issued_at IS NOT NULL AND d.payload_text = ${t.text}
            )
        ), ins AS (
          INSERT INTO x_publishing_posts (
            id, status, revision, text, text_hash, source_refs, account_id, account_handle, is_test,
            schedule_kind, scheduled_for, expires_at, scheduled_day, approval_hash, approved_revision,
            approved_at, approved_by, approval_context, created_by, created_at, updated_at
          )
          SELECT ${postId}::uuid, 'approved', 1, ${t.text}, ${t.textHash}, ${JSON.stringify(refs)}::jsonb,
                 ${X_ACCOUNT_ID}, ${X_ACCOUNT_HANDLE}, ${input.isTest}, 'scheduled', ${scheduledFor}::timestamptz,
                 ${expiresAt}::timestamptz, ${slot.day}, ${hash}, 1, ${at}::timestamptz, ${X_AUTOPILOT_ACTOR},
                 ${JSON.stringify(context)}::jsonb, ${X_AUTOPILOT_ACTOR}, ${at}::timestamptz, ${at}::timestamptz
          FROM ok
          RETURNING id
        )
        INSERT INTO x_publishing_autopilot_slots (
          is_test, slot_key, policy_id, slot_at, phoenix_day, outcome, reason, detail, authorization_id,
          template_id, template_hash, post_id, checks, first_checked_at, updated_at
        )
        SELECT ${input.isTest}, ${slot.key}, ${X_AUTOPILOT_POLICY.id}, ${scheduledFor}::timestamptz, ${slot.day},
               'authorized', 'authorized', NULL, ${auth.id}::uuid, ${t.id}, ${t.hash}, ins.id,
               ${JSON.stringify(checks)}::jsonb, ${at}::timestamptz, ${at}::timestamptz
        FROM ins
        ON CONFLICT (is_test, slot_key) DO UPDATE SET
          outcome = 'authorized', reason = 'authorized', detail = NULL, authorization_id = EXCLUDED.authorization_id,
          template_id = EXCLUDED.template_id, template_hash = EXCLUDED.template_hash, post_id = EXCLUDED.post_id,
          checks = EXCLUDED.checks, updated_at = EXCLUDED.updated_at
        WHERE x_publishing_autopilot_slots.outcome = 'skipped'
        RETURNING post_id
      `,
    ]);
    inserted = rows[0];
  } catch (error) {
    if (sqlState(error) !== "23505") throw error;
  }

  if (!inserted) {
    const [again, decided] = await readOnlySnapshot(sql, [gateQuery(sql, input.isTest, at, slot.day), slotRowsQuery(sql, input.isTest, [slot.key])]);
    if (decided[0]?.outcome === "authorized") {
      return { outcome: "already_authorized", slotKey: slot.key, postId: decided[0].post_id ? String(decided[0].post_id) : null };
    }
    const why = gateSkip(mapGate(again[0]), slot.day) ?? {
      reason: "changed_concurrently",
      detail: "The authorization, template availability, or queue changed while authorizing; nothing was scheduled.",
    };
    return recordSkip({ ...input, slot, ...why, checks });
  }

  await recordXEvent({
    type: X_EVENT_TYPES.autopilotPostAuthorized,
    outcome: "accepted",
    summary: `X post authorized by standing policy ${X_AUTOPILOT_POLICY_VERSION} (template ${t.id}) for slot ${slot.day} ${slot.window} — not individually reviewed`,
    queueId: postId,
    revision: 1,
    isTest: input.isTest,
    now: input.now,
  });
  return { outcome: "authorized", slotKey: slot.key, postId, templateId: t.id };
}

// ---------------------------------------------------------------------------
// Dispatch-time verification of a standing-policy post
// ---------------------------------------------------------------------------

/**
 * Null when the post still matches a currently reviewed template and its
 * recorded policy; otherwise the reason it may not be sent automatically.
 * The active-authorization check itself runs inside the permit transaction.
 */
export function standingPolicyProblem(post: XPostRecord): string | null {
  const ctx = post.approvalContext;
  if (!ctx || ctx.authorization !== "standing_policy") return "not a standing-policy post";
  const sp = ctx.standingPolicy;
  if (post.approvedBy !== X_AUTOPILOT_ACTOR || sp.actor !== X_AUTOPILOT_ACTOR) return "unexpected approving actor";
  if (ctx.acknowledgedWarnings.length !== 0) return "standing-policy posts carry no warning acknowledgements";
  if (sp.policyId !== X_AUTOPILOT_POLICY.id || sp.policyHash !== X_AUTOPILOT_POLICY_HASH) return "policy changed since authorization";
  const t = currentLibraryReview().templates.find((r) => r.id === sp.templateId);
  if (!t) return "template no longer in the library";
  if (!t.eligible) return "template no longer passes the content checks";
  if (t.hash !== sp.templateHash) return "template or cited source changed since authorization";
  if (t.text !== post.text) return "post text differs from the reviewed template";
  if (post.scheduleKind !== "scheduled") return "standing-policy posts use their slot only";
  return null;
}

export function activeAuthorizationGuardSql(sql: Sql, post: XPostRecord) {
  const ctx = post.approvalContext as StandingPolicyApprovalContext;
  return sql`EXISTS (
    SELECT 1 FROM x_publishing_autopilot_authorizations z
    WHERE z.id = ${ctx.standingPolicy.authorizationId}::uuid AND z.is_test = ${post.isTest} AND z.revoked_at IS NULL
      AND z.policy_hash = ${X_AUTOPILOT_POLICY_HASH}
      AND z.template_hashes ->> ${ctx.standingPolicy.templateId} = ${ctx.standingPolicy.templateHash}
  )`;
}

/** Releases any unpermitted claim and cancels pending standing-policy posts matching `scope`. */
export function withdrawStandingPostsStatement(
  sql: Sql,
  input: { isTest: boolean; postId: string | null; code: (typeof X_AUTOPILOT_WITHDRAW_CODES)[number]; message: string; now: string }
) {
  return sql`
    WITH target AS (
      SELECT p.id FROM x_publishing_posts p
      WHERE p.is_test = ${input.isTest} AND p.status IN ('approved','claimed')
        AND p.approval_context->>'authorization' = 'standing_policy'
        AND (${input.postId}::uuid IS NULL OR p.id = ${input.postId}::uuid)
    ), rel AS (
      UPDATE x_publishing_attempts a
      SET state = 'released', error_code = ${input.code}, error_message = ${input.message}, updated_at = ${input.now}::timestamptz
      FROM target
      WHERE a.post_id = target.id AND a.state IN ('claimed','identity_ok') AND a.permit_issued_at IS NULL
      RETURNING a.id
    )
    UPDATE x_publishing_posts p
    SET status = 'cancelled', active_attempt_id = NULL, last_error_code = ${input.code},
        last_error_message = ${input.message}, updated_at = ${input.now}::timestamptz
    FROM target WHERE p.id = target.id
    RETURNING p.id, p.revision
  `;
}

async function emitWithdrawn(rows: Row[], isTest: boolean, reason: string, now: Date): Promise<void> {
  for (const r of rows) {
    await recordXEvent({
      type: X_EVENT_TYPES.autopilotPostWithdrawn,
      outcome: "skipped",
      summary: `Pending standing-policy X post withdrawn before dispatch (${reason}); not posted`,
      queueId: String(r.id),
      revision: Number(r.revision),
      isTest,
      now,
    });
  }
}

export async function withdrawStandingPost(input: { post: XPostRecord; reason: string; now: Date }): Promise<void> {
  const [rows] = await lockedTransaction((sql) => [
    withdrawStandingPostsStatement(sql, {
      isTest: input.post.isTest,
      postId: input.post.id,
      code: "autopilot_authorization_invalid",
      message: `Standing-policy authorization no longer valid: ${input.reason}. Not sent.`,
      now: input.now.toISOString(),
    }),
  ]);
  await emitWithdrawn(rows, input.post.isTest, input.reason, input.now);
}

// ---------------------------------------------------------------------------
// Owner actions
// ---------------------------------------------------------------------------

function fail(status: number, error: string, extra: Record<string, unknown> = {}): XResult {
  return { status, body: { error, ...extra } };
}

export const X_AUTOPILOT_CONFIRMATIONS = ["reviewedLibrary", "noIndividualReview", "sharedDailyCap"] as const;

export async function authorizeAutopilot(input: {
  isTest: boolean;
  environment: string;
  actor: string;
  now: Date;
  policyVersion: string;
  libraryVersion: string;
  confirmations: Record<string, unknown>;
}): Promise<XResult> {
  const missing = X_AUTOPILOT_CONFIRMATIONS.filter((c) => input.confirmations[c] !== true);
  if (missing.length > 0) return fail(400, "Confirm each statement before enabling the standing policy.", { missing });
  const review = currentLibraryReview();
  if (input.policyVersion !== X_AUTOPILOT_POLICY_VERSION || input.libraryVersion !== review.version) {
    return fail(409, "The policy or library you reviewed no longer matches the deployed version. Reload and review again.", {
      policyVersion: X_AUTOPILOT_POLICY_VERSION,
      libraryVersion: review.version,
    });
  }
  const eligible = review.templates.filter((t) => t.eligible);
  if (eligible.length === 0) return fail(422, "No template in the library passes the content checks; nothing can be authorized.");

  const templateHashes: Record<string, string> = {};
  const sourceHashes: Record<string, string> = {};
  for (const t of eligible) {
    templateHashes[t.id] = t.hash;
    for (const s of t.sources) sourceHashes[s.id] = s.hash;
  }
  const id = crypto.randomUUID();
  const now = input.now.toISOString();
  const statement =
    `Owner (${input.actor} session) authorized standing policy ${X_AUTOPILOT_POLICY_VERSION} for @${X_ACCOUNT_HANDLE} ` +
    `(account ${X_ACCOUNT_ID}) with documentation library ${review.libraryId} version ${review.version.slice(0, 12)}, ` +
    `covering ${eligible.length} reviewed template(s). Windows ${X_AUTOPILOT_POLICY.windows.join(" and ")} ${X_AUTOPILOT_POLICY.timeZone}; ` +
    `at most ${X_DAILY_CAP} Create Post dispatches per Phoenix day shared with manual approvals. ` +
    "Posts published under this authorization are not individually reviewed by the owner.";

  const [superseded, withdrawn] = await lockedTransaction((sql) => [
    sql`
      UPDATE x_publishing_autopilot_authorizations
      SET revoked_at = ${now}::timestamptz, revoked_by = ${input.actor}, revoke_reason = 'superseded by a new authorization'
      WHERE is_test = ${input.isTest} AND revoked_at IS NULL
      RETURNING id
    `,
    withdrawStandingPostsStatement(sql, {
      isTest: input.isTest,
      postId: null,
      code: "autopilot_authorization_invalid",
      message: "Standing-policy authorization superseded before dispatch. Not sent.",
      now,
    }),
    sql`
      INSERT INTO x_publishing_autopilot_authorizations (
        id, is_test, policy_id, policy_version, policy_hash, library_id, library_version, template_hashes,
        source_hashes, account_id, statement, authorized_at, authorized_by, authorized_env
      ) VALUES (
        ${id}::uuid, ${input.isTest}, ${X_AUTOPILOT_POLICY.id}, ${X_AUTOPILOT_POLICY_VERSION}, ${X_AUTOPILOT_POLICY_HASH},
        ${review.libraryId}, ${review.version}, ${JSON.stringify(templateHashes)}::jsonb, ${JSON.stringify(sourceHashes)}::jsonb,
        ${X_ACCOUNT_ID}, ${statement}, ${now}::timestamptz, ${input.actor}, ${input.environment}
      )
      RETURNING *
    `,
  ]);
  await emitWithdrawn(withdrawn, input.isTest, "authorization superseded", input.now);
  await recordXEvent({
    type: X_EVENT_TYPES.autopilotAuthorized,
    outcome: "accepted",
    summary: `X documentation autopilot authorized by owner: ${X_AUTOPILOT_POLICY_VERSION}, library ${review.version.slice(0, 12)}, ${eligible.length} template(s)${superseded.length ? " (replaces the previous authorization)" : ""}`,
    queueId: null,
    revision: null,
    isTest: input.isTest,
    now: input.now,
    discriminator: id,
  });
  return { status: 200, body: { authorizationId: id, templates: eligible.length } };
}

export async function disableAutopilot(input: { isTest: boolean; actor: string; reason: string; now: Date }): Promise<XResult> {
  const now = input.now.toISOString();
  const reason = input.reason.trim().slice(0, 300) || "Disabled by owner";
  const [revoked, withdrawn] = await lockedTransaction((sql) => [
    sql`
      UPDATE x_publishing_autopilot_authorizations
      SET revoked_at = ${now}::timestamptz, revoked_by = ${input.actor}, revoke_reason = ${reason}
      WHERE is_test = ${input.isTest} AND revoked_at IS NULL
      RETURNING id
    `,
    withdrawStandingPostsStatement(sql, {
      isTest: input.isTest,
      postId: null,
      code: "autopilot_disabled",
      message: "Autopilot turned off before dispatch. Not sent.",
      now,
    }),
  ]);
  await emitWithdrawn(withdrawn, input.isTest, "autopilot turned off", input.now);
  if (revoked.length === 0 && withdrawn.length === 0) return fail(409, "Autopilot is already off.");
  await recordXEvent({
    type: X_EVENT_TYPES.autopilotDisabled,
    outcome: "waiting",
    summary: `X documentation autopilot turned off by owner${withdrawn.length ? `; ${withdrawn.length} pending automatic post(s) withdrawn` : ""}`,
    queueId: null,
    revision: null,
    isTest: input.isTest,
    now: input.now,
    discriminator: now,
  });
  return { status: 200, body: { disabled: true, withdrawn: withdrawn.length } };
}

// ---------------------------------------------------------------------------
// Read model for /admin-social and Mission Control (read-only)
// ---------------------------------------------------------------------------

export type XAutopilotSlotView = {
  key: string;
  day: string;
  window: string;
  slotAtPhoenix: string;
  open: boolean;
  outcome: "authorized" | "skipped" | null;
  reason: string | null;
  detail: string | null;
  templateId: string | null;
  postId: string | null;
  postStatus: string | null;
  xPostId: string | null;
  /** Deterministic expectation if nothing else changes (not a promise). */
  expectedTemplateId: string | null;
  dayCapacity: { used: number; cap: number };
};

export type XAutopilotView = {
  available: boolean;
  missing: string[];
  mode: "off" | "on" | "needs_reauthorization";
  /** Changed templates are ineligible until re-authorized; unchanged ones keep their authorization. */
  libraryChangedSinceAuthorization: boolean;
  /** `label` is what the owner authorizes (id@version#hash). */
  policy: typeof X_AUTOPILOT_POLICY & { hash: string; label: string };
  library: {
    id: string;
    version: string;
    eligibleCount: number;
    templates: Array<{
      id: string;
      text: string;
      sourceIds: string[];
      excerpt: { sourceId: string; quote: string };
      purpose: string;
      context: string;
      acceptedWarnings: Array<{ code: string; justification: string }>;
      hash: string;
      problems: string[];
      status: XTemplateStatus;
      detail: string | null;
    }>;
  };
  authorization: XAutopilotAuthorization | null;
  history: XAutopilotAuthorization[];
  remaining: number;
  nextSlots: XAutopilotSlotView[];
  recentSlots: Array<{
    key: string;
    slotAtPhoenix: string;
    outcome: string;
    reason: string;
    detail: string | null;
    templateId: string | null;
    postId: string | null;
    postStatus: string | null;
    xPostId: string | null;
  }>;
  counts: { authorized: number; verified: number; uncertain: number; inProgress: number; skipped: number };
};

function slotLabel(s: XAutopilotSlot): string {
  return formatPhoenix(s.slotAt);
}

export function emptyAutopilotView(missing: string[]): XAutopilotView {
  const review = currentLibraryReview();
  const states = evaluateTemplates({ review, authorization: null, consumed: new Set(), usedTexts: [] });
  return buildView({ review, states, auth: null, history: [], missing, nextSlots: [], recentSlots: [], counts: null });
}

function buildView(input: {
  review: XLibraryReview;
  states: XTemplateState[];
  auth: XAutopilotAuthorization | null;
  history: XAutopilotAuthorization[];
  missing: string[];
  nextSlots: XAutopilotSlotView[];
  recentSlots: XAutopilotView["recentSlots"];
  counts: XAutopilotView["counts"] | null;
}): XAutopilotView {
  const byId = new Map(input.states.map((s) => [s.id, s]));
  const outdated = !!input.auth && input.auth.policyHash !== X_AUTOPILOT_POLICY_HASH;
  return {
    available: input.missing.length === 0,
    missing: input.missing,
    mode: !input.auth ? "off" : outdated ? "needs_reauthorization" : "on",
    libraryChangedSinceAuthorization: !!input.auth && input.auth.libraryVersion !== input.review.version,
    policy: { ...X_AUTOPILOT_POLICY, hash: X_AUTOPILOT_POLICY_HASH, label: X_AUTOPILOT_POLICY_VERSION },
    library: {
      id: input.review.libraryId,
      version: input.review.version,
      eligibleCount: input.review.eligibleCount,
      templates: input.review.templates.map((t) => ({
        id: t.id,
        text: t.text,
        sourceIds: [...t.template.sourceIds],
        excerpt: t.template.excerpt,
        purpose: t.template.purpose,
        context: t.template.context,
        acceptedWarnings: t.template.acceptedWarnings.map((w) => ({ ...w })),
        hash: t.hash,
        problems: t.problems,
        status: byId.get(t.id)?.status ?? "not_authorized",
        detail: byId.get(t.id)?.detail ?? null,
      })),
    },
    authorization: input.auth,
    history: input.history,
    remaining: input.states.filter((s) => s.status === "eligible").length,
    nextSlots: input.nextSlots,
    recentSlots: input.recentSlots,
    counts: input.counts ?? { authorized: 0, verified: 0, uncertain: 0, inProgress: 0, skipped: 0 },
  };
}

/**
 * Read-only queries for the autopilot view, meant to run inside the caller's
 * READ ONLY snapshot together with the queue reads; `build` turns their
 * results (in order) into the view.
 */
export function autopilotViewReads(sql: Sql, input: { isTest: boolean; now: Date; slotCount?: number }) {
  const at = input.now.toISOString();
  const slots = upcomingAutopilotSlots(input.now, input.slotCount ?? 4);
  const days = [...new Set(slots.map((s) => s.day))];
  const queries = [
    authorizationsQuery(sql, input.isTest, 5),
    consumedTemplatesQuery(sql, input.isTest),
    usedTextsQuery(sql, input.isTest),
    slotRowsQuery(sql, input.isTest, slots.map((s) => s.key)),
    recentSlotsQuery(sql, input.isTest, 20),
    standingPostCountsQuery(sql, input.isTest, at),
    skipCountQuery(sql, input.isTest),
    ...days.map((d) => gateQuery(sql, input.isTest, at, d)),
  ];
  return { queries, build: (results: Row[][]) => buildAutopilotView(results, slots, days, input.now) };
}

export async function readAutopilotView(input: { isTest: boolean; now: Date; slotCount?: number }): Promise<XAutopilotView> {
  const sql = getSql();
  const reads = autopilotViewReads(sql, input);
  return reads.build(await readOnlySnapshot(sql, reads.queries));
}

function buildAutopilotView(results: Row[][], slots: XAutopilotSlot[], days: string[], now: Date): XAutopilotView {
  const input = { now };
  const [authRows, consumedRows, usedRows, slotRows, recentRows, countRows, skipRows, ...gateRows] = results;
  const history = authRows.map(mapAuthorization);
  const auth = history.find((a) => a.revokedAt === null) ?? null;
  const review = currentLibraryReview();
  const states = evaluateTemplates({
    review,
    authorization: auth,
    consumed: new Set(consumedRows.map((r) => String(r.template_id))),
    usedTexts: usedRows.map((r) => String(r.t)),
  });
  const gates = new Map(days.map((d, i) => [d, mapGate(gateRows[i]?.[0])]));
  const decided = new Map(slotRows.map((r) => [String(r.slot_key), r]));
  const queue = auth ? states.filter((s) => s.status === "eligible").map((s) => s.id) : [];
  const nextSlots = slots.map((s): XAutopilotSlotView => {
    const row = decided.get(s.key);
    const g = gates.get(s.day);
    const expected = !row && auth ? (queue.shift() ?? null) : null;
    return {
      key: s.key,
      day: s.day,
      window: s.window,
      slotAtPhoenix: slotLabel(s),
      open: s.slotAt.getTime() <= input.now.getTime(),
      outcome: row ? (String(row.outcome) as "authorized" | "skipped") : null,
      reason: row ? String(row.reason) : null,
      detail: row?.detail ? String(row.detail) : null,
      templateId: row?.template_id ? String(row.template_id) : null,
      postId: row?.post_id ? String(row.post_id) : null,
      postStatus: row?.post_status ? String(row.post_status) : null,
      xPostId: row?.post_x_post_id ? String(row.post_x_post_id) : null,
      expectedTemplateId: expected,
      dayCapacity: { used: g ? g.reserved + g.permits : 0, cap: X_DAILY_CAP },
    };
  });
  const recentSlots = recentRows.map((r) => ({
    key: String(r.slot_key),
    slotAtPhoenix: formatPhoenix(new Date(String(toIsoOrNull(r.slot_at)))),
    outcome: String(r.outcome),
    reason: String(r.reason),
    detail: r.detail ? String(r.detail) : null,
    templateId: r.template_id ? String(r.template_id) : null,
    postId: r.post_id ? String(r.post_id) : null,
    postStatus: r.post_status ? String(r.post_status) : null,
    xPostId: r.post_x_post_id ? String(r.post_x_post_id) : null,
  }));
  const c = countRows[0] ?? {};
  return buildView({
    review,
    states,
    auth,
    history,
    missing: [],
    nextSlots,
    recentSlots,
    counts: {
      authorized: Number(c.authorized ?? 0),
      verified: Number(c.verified ?? 0),
      uncertain: Number(c.uncertain ?? 0),
      inProgress: Number(c.in_progress ?? 0),
      skipped: Number(skipRows[0]?.skipped ?? 0),
    },
  });
}
