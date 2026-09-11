import type { MessageStatus } from "./constants";

/** Neon states that mean the inbound was durably captured (safe to IMAP \Seen). */
export const DURABLE_HANDLED_STATUSES: ReadonlySet<MessageStatus> = new Set([
  "drafted",
  "escalated",
  "auto_sent",
  "human_sent",
  "resolved",
  "ignored", // spam/vendor retained for audit; IMAP \Seen after Neon capture
  "failed", // draft exists; customer send may still retry from Neon
]);

export function isDurableHandledStatus(status: MessageStatus): boolean {
  return DURABLE_HANDLED_STATUSES.has(status);
}

/** Customer SMTP send can be retried when durable draft exists and sent_at is null. */
export function isCustomerSendRetryable(input: {
  status: MessageStatus;
  sentAt: string | null;
  sendIntended: boolean;
  /** Absolute kill switch — false blocks ALL autonomous customer retries. */
  autoSendEnabled: boolean;
}): boolean {
  if (!input.autoSendEnabled) return false;
  if (!input.sendIntended) return false;
  if (input.sentAt) return false;
  return (
    input.status === "failed" ||
    input.status === "drafted" ||
    input.status === "escalated"
  );
}

/**
 * Whether an automatic (non-admin) customer send may proceed.
 * SUPPORT_AUTO_SEND_ENABLED=false is an absolute kill switch.
 */
export function mayAutoSendCustomerReply(autoSendEnabled: boolean): boolean {
  return autoSendEnabled === true;
}

/** After a successful send, never send again. */
export function canSendCustomerReply(sentAt: string | null): boolean {
  return sentAt === null;
}

/** Escalation notify retries while open and notified_at is null. */
export function isEscalationNotifyRetryable(input: {
  notifiedAt: string | null;
  resolvedAt: string | null;
}): boolean {
  return input.resolvedAt === null && input.notifiedAt === null;
}

/**
 * Pure decision: should this IMAP UID be acknowledged after a process attempt?
 * Only after durable Neon capture — not after mid-flight failure before draft.
 */
export function shouldMarkImapSeenAfterProcess(input: {
  durableCaptured: boolean;
}): boolean {
  return input.durableCaptured;
}
