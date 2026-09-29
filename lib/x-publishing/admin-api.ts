import { getSql } from "@/lib/db/sql";

import {
  approveXPost,
  cancelXPost,
  requestLookup,
  resolveNotCreated,
  saveXDraft,
  scheduleProblem,
  setReconcileCandidate,
  setXPaused,
} from "./admin-store";
import { getXPublishingConfig } from "./config";
import {
  X_ACCOUNT_HANDLE,
  X_ACCOUNT_ID,
  X_DISPLAY_LABELS,
  X_LIMITS,
  X_PROVENANCE,
  X_TIME_ZONE,
  xPostUrl,
} from "./constants";
import { checkPostText, X_CONTENT_POLICY_VERSION, type XContentCheck } from "./content";
import { readJsonObject, UUID_RE } from "./http";
import {
  displayState,
  getControl,
  mapAttempt,
  mapPost,
  previewHashFor,
  sqlState,
  type XAttemptRecord,
  type XPostRecord,
  type XResult,
} from "./records";
import { getXPublishingSchemaState } from "./schema";
import { formatPhoenix, phoenixDay, toPhoenixLocalInput } from "./time";

/** Custom header required on admin mutations; cross-site pages cannot set it without a CORS preflight. */
export const X_ADMIN_ACTION_HEADER = "x-psl-admin-action";
export const X_ADMIN_MAX_BODY_BYTES = 8192;
export const X_ADMIN_ACTOR = "admin";

export const X_MIGRATION_REQUIRED =
  "X publishing tables are missing. The owner must run the explicit migration (npm run migrate-x-publishing) against the intended database. Nothing is created automatically.";

type Env = Record<string, string | undefined>;

export type XAttemptView = Omit<XAttemptRecord, "claimTokenHash" | "lookupTokenHash" | "approvalHash" | "payloadText">;

export type XPostView = XPostRecord & {
  displayState: ReturnType<typeof displayState>;
  displayLabel: string;
  check: XContentCheck;
  scheduleProblem: string | null;
  scheduledForPhoenix: string | null;
  scheduledForLocalInput: string | null;
  expiresAtPhoenix: string | null;
  previews: { scheduled: string; next_manual_run: string } | null;
  xUrl: string | null;
  attempts: XAttemptView[];
};

function attemptView(a: XAttemptRecord): XAttemptView {
  const view: Partial<XAttemptRecord> = { ...a };
  delete view.claimTokenHash;
  delete view.lookupTokenHash;
  delete view.approvalHash;
  delete view.payloadText;
  return view as XAttemptView;
}

export function buildPostView(post: XPostRecord, attempts: XAttemptRecord[], now: Date): XPostView {
  const check = checkPostText(post.text);
  const state = displayState(post, now);
  return {
    ...post,
    displayState: state,
    displayLabel: X_DISPLAY_LABELS[state],
    check,
    scheduleProblem: post.status === "draft" ? scheduleProblem(post.scheduledFor, now) : null,
    scheduledForPhoenix: post.scheduledFor ? formatPhoenix(new Date(post.scheduledFor)) : null,
    scheduledForLocalInput: post.scheduledFor ? toPhoenixLocalInput(new Date(post.scheduledFor)) : null,
    expiresAtPhoenix: post.expiresAt ? formatPhoenix(new Date(post.expiresAt)) : null,
    previews:
      post.status === "draft"
        ? {
            scheduled: previewHashFor(post, "scheduled", check),
            next_manual_run: previewHashFor(post, "next_manual_run", check),
          }
        : null,
    xUrl: post.xPostId ? xPostUrl(post.xPostId) : null,
    attempts: attempts.filter((a) => a.postId === post.id).map(attemptView),
  };
}

/** Read-only. Never creates schema; missing tables are reported, not fixed. */
export async function handleXAdminGet(options: { env?: Env; now?: Date } = {}): Promise<XResult> {
  const env = options.env ?? process.env;
  const now = options.now ?? new Date();
  const config = getXPublishingConfig(env);
  const base = {
    now: now.toISOString(),
    todayPhoenix: phoenixDay(now),
    timeZone: X_TIME_ZONE,
    account: { id: X_ACCOUNT_ID, handle: X_ACCOUNT_HANDLE },
    limits: X_LIMITS,
    policyVersion: X_CONTENT_POLICY_VERSION,
    provenance: X_PROVENANCE,
    config: {
      environment: config.environment,
      admin: config.admin,
      live: config.live,
      dryRun: config.dryRun,
      expectedAccount: config.expectedAccount,
    },
  };
  let schema;
  try {
    schema = await getXPublishingSchemaState();
  } catch (error) {
    console.error("[x-publishing] schema probe failed:", error instanceof Error ? error.message : error);
    return { status: 200, body: { ...base, initialized: false, missing: [], migrationRequired: "Database unavailable.", posts: [], control: null } };
  }
  if (!schema.initialized) {
    return { status: 200, body: { ...base, initialized: false, missing: schema.missing, migrationRequired: X_MIGRATION_REQUIRED, posts: [], control: null } };
  }
  const isTest = config.admin.mode === "test";
  try {
    const sql = getSql();
    const postRows = (await sql`
      SELECT * FROM x_publishing_posts
      WHERE is_test = ${isTest}
      ORDER BY CASE WHEN status IN ('draft','approved','claimed','dispatched','created','uncertain') THEN 0 ELSE 1 END,
               updated_at DESC
      LIMIT 50
    `) as Record<string, unknown>[];
    const posts = postRows.map(mapPost);
    const attemptRows = posts.length
      ? ((await sql`
          SELECT * FROM x_publishing_attempts
          WHERE post_id = ANY(${posts.map((p) => p.id)}::uuid[])
          ORDER BY claimed_at DESC
          LIMIT 300
        `) as Record<string, unknown>[])
      : [];
    const attempts = attemptRows.map(mapAttempt);
    const control = await getControl();
    return {
      status: 200,
      body: {
        ...base,
        initialized: true,
        missing: [],
        migrationRequired: null,
        isTest,
        control,
        posts: posts.map((p) => buildPostView(p, attempts, now)),
      },
    };
  } catch (error) {
    if (sqlState(error) === "42P01") {
      return { status: 200, body: { ...base, initialized: false, missing: [], migrationRequired: X_MIGRATION_REQUIRED, posts: [], control: null } };
    }
    throw error;
  }
}

/**
 * Same-origin proof for cookie-authenticated mutations: the custom header plus
 * a matching Origin (or Sec-Fetch-Site: same-origin when Origin is absent).
 */
export function checkAdminCsrf(headers: Headers): string | null {
  if (headers.get(X_ADMIN_ACTION_HEADER) !== "1") return "Missing admin action header.";
  const hosts = [headers.get("host"), headers.get("x-forwarded-host")].filter(Boolean) as string[];
  const origin = headers.get("origin");
  if (origin) {
    let host: string;
    try {
      host = new URL(origin).host;
    } catch {
      return "Invalid Origin.";
    }
    return hosts.includes(host) ? null : "Cross-origin request refused.";
  }
  return headers.get("sec-fetch-site") === "same-origin" ? null : "Origin header required.";
}

function str(v: unknown, max: number): string | null {
  return typeof v === "string" && v.length <= max ? v : null;
}

function bad(error: string, status = 400): XResult {
  return { status, body: { error } };
}

function uuidField(v: unknown): string | null {
  return typeof v === "string" && UUID_RE.test(v) ? v : null;
}

/** Owner mutations. Caller has already verified the admin session. */
export async function handleXAdminPost(request: Request, options: { env?: Env; now?: Date } = {}): Promise<XResult> {
  const env = options.env ?? process.env;
  const now = options.now ?? new Date();
  const csrf = checkAdminCsrf(request.headers);
  if (csrf) return bad(csrf, 403);
  const config = getXPublishingConfig(env);
  if (config.admin.mode === "disabled") return bad(`X queue changes are disabled here: ${config.admin.reason}.`, 503);
  const isTest = config.admin.mode === "test";

  const schema = await getXPublishingSchemaState();
  if (!schema.initialized) return bad(X_MIGRATION_REQUIRED, 503);

  const parsed = await readJsonObject(request, X_ADMIN_MAX_BODY_BYTES);
  if (!parsed.ok) return bad(parsed.error, parsed.status);
  const b = parsed.value;
  const actor = X_ADMIN_ACTOR;

  switch (b.action) {
    case "save_draft": {
      const text = str(b.text, 5000);
      if (text === null) return bad("text is required.");
      const refs = Array.isArray(b.sourceRefs) ? b.sourceRefs : [];
      if (!refs.every((r) => typeof r === "string")) return bad("sourceRefs must be strings.");
      const local = b.scheduledForLocal === null || b.scheduledForLocal === undefined || b.scheduledForLocal === "" ? null : str(b.scheduledForLocal, 16);
      if (b.scheduledForLocal && local === null) return bad("scheduledForLocal must be YYYY-MM-DDTHH:mm.");
      const id = b.id === null || b.id === undefined ? null : uuidField(b.id);
      if (b.id && !id) return bad("Invalid id.");
      const rev = b.expectedRevision === undefined || b.expectedRevision === null ? null : Number(b.expectedRevision);
      if (rev !== null && !Number.isInteger(rev)) return bad("expectedRevision must be an integer.");
      return saveXDraft({ id, expectedRevision: rev, text, sourceRefs: refs as string[], scheduledForLocal: local, isTest, actor, now });
    }
    case "approve": {
      const id = uuidField(b.id);
      if (!id) return bad("Invalid id.");
      if (!Number.isInteger(b.expectedRevision)) return bad("expectedRevision must be an integer.");
      if (b.scheduleKind !== "scheduled" && b.scheduleKind !== "next_manual_run") return bad("Invalid scheduleKind.");
      const hash = str(b.previewHash, 64);
      if (!hash || !/^[0-9a-f]{64}$/.test(hash)) return bad("previewHash is required.");
      const acks = Array.isArray(b.acknowledgedWarnings) ? b.acknowledgedWarnings : [];
      if (!acks.every((a) => typeof a === "string" && a.length <= 200)) return bad("acknowledgedWarnings must be strings.");
      return approveXPost({
        id,
        expectedRevision: b.expectedRevision as number,
        previewHash: hash,
        scheduleKind: b.scheduleKind,
        confirmPublic: b.confirmPublic === true,
        confirmManualRun: b.confirmManualRun === true,
        acknowledgedWarnings: acks as string[],
        isTest,
        env: config.environment,
        actor,
        now,
      });
    }
    case "cancel": {
      const id = uuidField(b.id);
      if (!id) return bad("Invalid id.");
      return cancelXPost({ id, isTest, actor, now });
    }
    case "pause":
    case "resume":
      return setXPaused({ paused: b.action === "pause", reason: str(b.reason, 300) ?? "", actor, isTest, now });
    case "reconcile_candidate": {
      const attemptId = uuidField(b.attemptId);
      const candidate = str(b.candidatePostId, 25);
      if (!attemptId || !candidate) return bad("attemptId and candidatePostId are required.");
      return setReconcileCandidate({ attemptId, candidatePostId: candidate.trim(), isTest, actor, now });
    }
    case "request_lookup": {
      const attemptId = uuidField(b.attemptId);
      if (!attemptId) return bad("Invalid attemptId.");
      return requestLookup({ attemptId, isTest, now });
    }
    case "resolve_not_created": {
      const attemptId = uuidField(b.attemptId);
      if (!attemptId) return bad("Invalid attemptId.");
      return resolveNotCreated({ attemptId, confirm: b.confirmChecked === true, isTest, actor, now });
    }
    default:
      return bad("Unknown action.");
  }
}
