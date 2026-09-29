/**
 * Destination lock. X account IDs exceed Number.MAX_SAFE_INTEGER, so this is
 * a string everywhere (code, database, JSON, n8n). The handle is display-only.
 */
export const X_ACCOUNT_ID = "2094368418443280384";
export const X_ACCOUNT_HANDLE = "PSLLabspurity";

export const X_TIME_ZONE = "America/Phoenix";

/** PSL operating limits (not X policy). Shown to the owner. */
export const X_LIMITS = {
  createDispatchesPerPhoenixDay: 1,
  postsPerWorkflowRun: 1,
  slotMinutes: 30,
  expiryMinutesAfterScheduled: 60,
  nextManualRunValidityMinutes: 15,
  maxScheduleHorizonDays: 30,
  claimLeaseMinutes: 5,
  dispatchDeadlineMinutes: 5,
  maxLookupAttempts: 5,
  maxWeightedLength: 280,
  maxLinks: 2,
  maxSourceRefs: 5,
  maxSourceRefLength: 300,
} as const;

/** Minutes after a failed read-only lookup before the next one (index = attempts so far - 1). */
export const X_LOOKUP_BACKOFF_MINUTES = [2, 10, 30, 120, 360] as const;

export const X_POST_STATUSES = [
  "draft",
  "approved",
  "claimed",
  "dispatched",
  "created",
  "published",
  "rejected",
  "uncertain",
  "expired",
  "cancelled",
] as const;
export type XPostStatus = (typeof X_POST_STATUSES)[number];

/** Statuses that reserve the text (duplicate guard) and count toward daily capacity. */
export const X_ACTIVE_POST_STATUSES = [
  "approved",
  "claimed",
  "dispatched",
  "created",
  "published",
  "uncertain",
] as const satisfies readonly XPostStatus[];

export const X_ATTEMPT_STATES = [
  "claimed",
  "identity_ok",
  "released",
  "identity_failed",
  "dispatched",
  "created",
  "published",
  "rejected",
  "uncertain",
  "not_created",
] as const;
export type XAttemptState = (typeof X_ATTEMPT_STATES)[number];

export type XDisplayState =
  | "draft"
  | "scheduled"
  | "preparing"
  | "awaiting_confirmation"
  | "created_unconfirmed"
  | "published"
  | "rejected"
  | "expired"
  | "cancelled"
  | "uncertain";

export const X_DISPLAY_LABELS: Record<XDisplayState, string> = {
  draft: "Draft (not approved)",
  scheduled: "Scheduled (approved)",
  preparing: "Preparing (claimed, not yet sent)",
  awaiting_confirmation: "Dispatch permitted — awaiting X's response (within deadline)",
  created_unconfirmed: "Created on X (post ID recorded) — lookup not yet confirmed",
  published: "Published (lookup confirmed)",
  rejected: "Rejected by X (confirmed, not posted)",
  expired: "Expired (not posted)",
  cancelled: "Cancelled",
  uncertain: "Outcome unknown — owner review required",
};

export const X_PROVENANCE = "X API response observed by the configured n8n workflow";

/** Fixed X endpoints the workflow may call. */
export const X_API = {
  usersMe: "https://api.x.com/2/users/me",
  createPost: "https://api.x.com/2/tweets",
  lookupPrefix: "https://api.x.com/2/tweets/",
  lookupFields: "author_id,created_at,entities,text",
} as const;

export const X_POST_ID_RE = /^[1-9][0-9]{0,18}$/;

export function xPostUrl(postId: string): string {
  return `https://x.com/${X_ACCOUNT_HANDLE}/status/${postId}`;
}
