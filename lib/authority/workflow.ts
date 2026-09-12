/**
 * Pure gate for content brief generation — no auto-approve.
 */
export function requireApprovedForBriefGeneration(status: string): {
  ok: true;
} | {
  ok: false;
  error: string;
} {
  if (status === "approved" || status === "in_progress") {
    return { ok: true };
  }
  return {
    ok: false,
    error: "Approve this opportunity before generating a brief.",
  };
}

/** Publishing is a workflow recording flag only. */
export function publishedStatusIsRecordingOnly(): true {
  return true;
}
