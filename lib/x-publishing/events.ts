import { insertActivityEvents } from "@/lib/ops/mission-control/events";
import type { ActivityOutcome } from "@/lib/ops/mission-control/types";

export const X_EVENT_TYPES = {
  approved: "x_post_approved",
  cancelled: "x_post_cancelled",
  expired: "x_post_expired",
  dispatched: "x_post_dispatched",
  created: "x_post_created",
  published: "x_post_published",
  rejected: "x_post_rejected",
  uncertain: "x_post_uncertain",
  review: "x_post_review_required",
  resolved: "x_post_resolved_not_created",
  identityMismatch: "x_account_mismatch",
  paused: "x_publishing_paused",
  resumed: "x_publishing_resumed",
  draftsProposed: "x_drafts_proposed",
  autopilotAuthorized: "x_autopilot_authorized",
  autopilotDisabled: "x_autopilot_disabled",
  autopilotPostAuthorized: "x_autopilot_post_authorized",
  autopilotSlotSkipped: "x_autopilot_slot_skipped",
  autopilotPostWithdrawn: "x_autopilot_post_withdrawn",
} as const;

export type XEventType = (typeof X_EVENT_TYPES)[keyof typeof X_EVENT_TYPES];

export type XEventInput = {
  type: XEventType;
  outcome: ActivityOutcome;
  /** Never includes post text. */
  summary: string;
  queueId: string | null;
  revision: number | null;
  attemptId?: string | null;
  xPostId?: string | null;
  isTest: boolean;
  now: Date;
  /** Distinguishes repeatable events (pause/resume) on the same key. */
  discriminator?: string;
};

/**
 * Mission Control activity for the X publisher. Queue state lives only in the
 * queue tables; this is an activity view. Failures are logged and swallowed so
 * they can never change a queue transition.
 */
export async function recordXEvent(e: XEventInput): Promise<void> {
  try {
    const key = [
      "x_publishing",
      e.queueId ?? "control",
      e.revision !== null ? `r${e.revision}` : "-",
      e.attemptId ?? "-",
      e.type,
      e.discriminator ?? "",
    ].join(":");
    const versions: Record<string, string> = { integration: "x_publishing" };
    if (e.queueId) versions.queueId = e.queueId;
    if (e.revision !== null) versions.revision = String(e.revision);
    if (e.attemptId) versions.attemptId = e.attemptId;
    if (e.xPostId) versions.xPostId = e.xPostId;
    if (e.isTest) versions.classification = "TEST";
    await insertActivityEvents([
      {
        sourceEventKey: key,
        correlationId: e.queueId,
        sourceSystem: "x_publishing",
        worker: "x_publishing",
        eventType: e.type,
        outcome: e.outcome,
        observation: "live",
        occurredAt: e.now.toISOString(),
        summary: e.isTest ? `${e.summary} (TEST / EXCLUDED)` : e.summary,
        sourceRef: e.xPostId ? `X post ${e.xPostId}` : e.queueId ? `queue ${e.queueId}` : null,
        sourceHref: "/admin-social",
        excluded: e.isTest,
        versions,
      },
    ]);
  } catch (error) {
    console.error(
      "[x-publishing] activity event not recorded:",
      error instanceof Error ? error.message : error
    );
  }
}
