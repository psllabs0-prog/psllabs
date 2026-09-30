/** `created_by` on every assistant draft; the dashboard labels these rows. */
export const X_DRAFT_ASSISTANT_ACTOR = "x-draft-assistant";

export const X_DRAFT_LIMITS = {
  maxCandidates: 5,
  /** Assistant drafts per Phoenix day per partition (TEST vs live), counted under the queue lock. */
  maxDraftsPerPhoenixDay: 10,
  batchTtlMinutes: 180,
  maxModelOutputChars: 20_000,
  maxSourceIdsPerCandidate: 3,
  minExcerptChars: 20,
  maxExcerptChars: 240,
  minPurposeChars: 10,
  maxPurposeChars: 200,
  maxModelWarnings: 5,
  maxModelWarningChars: 200,
  recentPostsInPacket: 15,
  nearDuplicateCompareLimit: 200,
  nearDuplicateThreshold: 0.6,
  packetRequestsPerMinute: 6,
  batchRequestsPerMinute: 6,
  packetMaxBodyBytes: 1024,
  batchMaxBodyBytes: 48 * 1024,
} as const;

export const X_DRAFT_AI_LABEL = "AI-assisted draft (x-draft-assistant) — owner review required before approval.";

export const X_DRAFT_CHECKS_DISCLAIMER =
  "Automated checks are keyword and source-matching heuristics. They do not establish factual accuracy or legal/regulatory compliance; every draft still requires owner review.";
