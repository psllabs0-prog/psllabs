import { SITE_URL } from "@/lib/seo";

import { classifySupportMessage } from "./classify";
import { isSupportAutoSendEnabled } from "./constants";
import { decideOutboundAction, draftSupportResponse } from "./draft";
import { isSolicitationCategory } from "./solicitation";
import {
  fetchUnreadSupportEmails,
  markSupportEmailsSeen,
} from "./imap";
import {
  canSendCustomerReply,
  isCustomerSendRetryable,
  isDurableHandledStatus,
  isEscalationNotifyRetryable,
  mayAutoSendCustomerReply,
  shouldMarkImapSeenAfterProcess,
} from "./lifecycle";
import { ensureSupportSchema } from "./schema";
import { sendSupportCustomerEmail, sendSupportEscalationEmail } from "./smtp";
import {
  claimSupportInboxLease,
  createEscalation,
  findMessageByProviderId,
  getClassificationForMessage,
  getLatestDraft,
  getMessageWithThread,
  getOpenEscalation,
  insertInboundMessage,
  listRetryableCustomerSendMessages,
  listUnnotifiedEscalations,
  markEscalationNotified,
  markResponseSent,
  recordJobRun,
  releaseSupportInboxLease,
  saveClassification,
  saveDraftResponse,
  setMessageStatus,
  upsertThread,
} from "./store";
import type {
  ClassificationResult,
  DraftResult,
  InboundEmailNormalized,
  ProcessMessageResult,
  SupportJobSummary,
} from "./types";

async function tryCustomerSend(input: {
  messageId: number;
  responseId: number;
  to: string;
  subject: string;
  text: string;
  providerMessageId: string;
}): Promise<{ sent: boolean; error?: string }> {
  const latest = await getLatestDraft(input.messageId);
  if (!latest || !canSendCustomerReply(latest.sentAt)) {
    return { sent: false };
  }
  try {
    const result = await sendSupportCustomerEmail({
      to: input.to,
      subject: input.subject,
      text: input.text,
      inReplyTo: input.providerMessageId,
      references: input.providerMessageId,
    });
    if (result.sent) {
      const marked = await markResponseSent({
        responseId: input.responseId,
        messageId: input.messageId,
        sentBody: input.text,
        humanApproved: false,
        status: "auto_sent",
      });
      return { sent: marked.updated };
    }
    return { sent: false };
  } catch (error) {
    await setMessageStatus(input.messageId, "failed");
    return {
      sent: false,
      error: error instanceof Error ? error.message : "SMTP send failed",
    };
  }
}

async function tryEscalationNotify(input: {
  escalationId: number;
  fromEmail: string;
  subject: string;
  category: string;
  risk: string;
  confidence: number;
  why: string;
  suggestedResponse: string;
}): Promise<{ notified: boolean; error?: string }> {
  try {
    await sendSupportEscalationEmail({
      customer: input.fromEmail,
      subject: input.subject,
      category: input.category,
      risk: input.risk,
      confidence: input.confidence,
      why: input.why,
      suggestedResponse: input.suggestedResponse,
      adminUrl: `${SITE_URL}/admin-support`,
    });
    const marked = await markEscalationNotified(input.escalationId);
    return { notified: marked };
  } catch (error) {
    console.error(
      "[support] escalation notify failed:",
      error instanceof Error ? error.message : error
    );
    return {
      notified: false,
      error: error instanceof Error ? error.message : "Escalation notify failed",
    };
  }
}

function classificationFromStored(c: {
  category: ClassificationResult["category"];
  riskLevel: ClassificationResult["riskLevel"];
  confidence: number;
  autoResponseAllowed: boolean;
}): ClassificationResult {
  return {
    category: c.category,
    riskLevel: c.riskLevel,
    confidence: c.confidence,
    reasons: [],
    autoResponseAllowed: c.autoResponseAllowed,
    extractedOrderId: null,
    extractedTracking: null,
  };
}

/**
 * Retry customer send / Luke notification for an already-durable message.
 * Does not re-classify or create duplicate drafts/escalations.
 *
 * SUPPORT_AUTO_SEND_ENABLED=false is an absolute kill switch for ALL
 * autonomous customer sends (including failed-send retries).
 * Internal Luke escalation notifications still retry.
 */
export async function retryDurableSideEffects(
  messageId: number,
  options?: { forceCustomerSendRetry?: boolean }
): Promise<{
  autoSent: boolean;
  escalationNotified: boolean;
  error?: string;
}> {
  const bundled = await getMessageWithThread(messageId);
  if (!bundled) return { autoSent: false, escalationNotified: false };

  const { message, thread } = bundled;
  const draft = await getLatestDraft(messageId);
  const classification = await getClassificationForMessage(messageId);
  let autoSent = false;
  let escalationNotified = false;
  let error: string | undefined;

  const autoSendEnabled = isSupportAutoSendEnabled();
  let sendIntended = false;

  const isSolicitation =
    classification != null && isSolicitationCategory(classification.category);

  // Kill switch / solicitation: never intend autonomous customer send.
  if (!isSolicitation && mayAutoSendCustomerReply(autoSendEnabled)) {
    sendIntended = options?.forceCustomerSendRetry === true;
    if (!sendIntended && classification && draft) {
      const stubDraft: DraftResult = {
        bodyText: draft.draftBody,
        bodyHtml: "",
        knowledgeSources: [],
        aiDrafted: false,
        requiresEscalation: Boolean(await getOpenEscalation(messageId)),
        escalationReason: null,
        policyDecision: "retry",
      };
      const action = decideOutboundAction({
        classification: classificationFromStored(classification),
        draft: stubDraft,
        threadAutoSendDisabled: thread.autoSendDisabled,
      });
      sendIntended = action.sendCustomerReply || message.status === "failed";
    } else if (!sendIntended && message.status === "failed") {
      sendIntended = true;
    }
  }

  if (
    draft &&
    isCustomerSendRetryable({
      status: message.status,
      sentAt: draft.sentAt,
      sendIntended,
      autoSendEnabled,
    })
  ) {
    const send = await tryCustomerSend({
      messageId,
      responseId: draft.id,
      to: message.fromEmail,
      subject: message.subject,
      text: draft.draftBody,
      providerMessageId: message.providerMessageId,
    });
    autoSent = send.sent;
    if (send.error) error = send.error;
  }

  const escalation = await getOpenEscalation(messageId);
  if (
    escalation &&
    isEscalationNotifyRetryable({
      notifiedAt: escalation.notifiedAt,
      resolvedAt: escalation.resolvedAt,
    })
  ) {
    const notify = await tryEscalationNotify({
      escalationId: escalation.id,
      fromEmail: message.fromEmail,
      subject: message.subject,
      category: classification?.category ?? "other",
      risk: escalation.riskLevel,
      confidence: classification?.confidence ?? 0,
      why: escalation.reason,
      suggestedResponse: draft?.draftBody ?? "",
    });
    escalationNotified = notify.notified;
    if (notify.error) error = error ?? notify.error;
  }

  return { autoSent, escalationNotified, error };
}

export async function processInboundEmail(
  inbound: InboundEmailNormalized
): Promise<ProcessMessageResult> {
  const existing = await findMessageByProviderId(inbound.providerMessageId);

  // Already durably handled — retry side effects only; never duplicate response rows.
  if (existing && isDurableHandledStatus(existing.status)) {
    const classification = await getClassificationForMessage(existing.id);
    const retry = await retryDurableSideEffects(existing.id);
    const refreshed = await findMessageByProviderId(inbound.providerMessageId);
    const openEsc = await getOpenEscalation(existing.id);
    return {
      messageId: existing.id,
      providerMessageId: inbound.providerMessageId,
      status: refreshed?.status ?? existing.status,
      category: classification?.category ?? "other",
      riskLevel: classification?.riskLevel ?? "YELLOW",
      confidence: classification?.confidence ?? 0,
      autoSent: retry.autoSent,
      escalated: Boolean(openEsc),
      skippedDuplicate: !retry.autoSent && !retry.escalationNotified,
      durableCaptured: true,
      customerSendRetried: retry.autoSent,
      escalationNotified: retry.escalationNotified,
      error: retry.error,
    };
  }

  const thread = await upsertThread({
    threadKey: inbound.threadKey,
    fromEmail: inbound.fromEmail,
    subject: inbound.subject,
  });

  const { message, inserted } = await insertInboundMessage({
    threadId: thread.id,
    providerMessageId: inbound.providerMessageId,
    fromEmail: inbound.fromEmail,
    subject: inbound.subject,
    receivedAt: inbound.receivedAt,
    normalizedBody: inbound.normalizedBody,
  });

  // Race: another worker inserted and already progressed.
  if (!inserted && isDurableHandledStatus(message.status)) {
    return processInboundEmail(inbound);
  }

  try {
    const classification = classifySupportMessage({
      subject: inbound.subject,
      body: inbound.normalizedBody,
    });
    await saveClassification(message.id, classification);

    const draft = await draftSupportResponse({
      classification,
      fromEmail: inbound.fromEmail,
      subject: inbound.subject,
      body: inbound.normalizedBody,
    });
    const responseId = await saveDraftResponse(message.id, draft);

    const action = decideOutboundAction({
      classification,
      draft,
      threadAutoSendDisabled: thread.autoSendDisabled,
    });

    let autoSent = false;
    let escalated = false;
    let escalationNotified = false;
    let sendError: string | undefined;

    if (action.sendCustomerReply) {
      const send = await tryCustomerSend({
        messageId: message.id,
        responseId,
        to: inbound.fromEmail,
        subject: inbound.subject,
        text: draft.bodyText,
        providerMessageId: inbound.providerMessageId,
      });
      autoSent = send.sent;
      sendError = send.error;
      // SMTP failure still leaves a durable draft for later retry.
    }

    if (action.escalate) {
      const esc = await createEscalation({
        messageId: message.id,
        riskLevel: classification.riskLevel,
        reason:
          action.reason +
          (draft.escalationReason ? ` | ${draft.escalationReason}` : ""),
      });
      escalated = true;
      const open = await getOpenEscalation(message.id);
      if (
        open &&
        isEscalationNotifyRetryable({
          notifiedAt: open.notifiedAt,
          resolvedAt: open.resolvedAt,
        })
      ) {
        const notify = await tryEscalationNotify({
          escalationId: esc.id,
          fromEmail: inbound.fromEmail,
          subject: inbound.subject,
          category: classification.category,
          risk: classification.riskLevel,
          confidence: classification.confidence,
          why: draft.escalationReason || action.reason,
          suggestedResponse: draft.bodyText,
        });
        escalationNotified = notify.notified;
      }
    }

    const finalStatus = isSolicitationCategory(classification.category)
      ? "ignored"
      : autoSent
        ? "auto_sent"
        : sendError
          ? "failed"
          : escalated
            ? "escalated"
            : "drafted";

    if (
      finalStatus === "drafted" ||
      finalStatus === "escalated" ||
      finalStatus === "ignored"
    ) {
      await setMessageStatus(message.id, finalStatus);
    }

    return {
      messageId: message.id,
      providerMessageId: inbound.providerMessageId,
      status: finalStatus,
      category: classification.category,
      riskLevel: classification.riskLevel,
      confidence: classification.confidence,
      autoSent,
      escalated,
      skippedDuplicate: false,
      durableCaptured: true,
      escalationNotified,
      error: sendError,
    };
  } catch (error) {
    // Failed before durable draft — leave IMAP UNSEEN.
    const msg = error instanceof Error ? error.message : "process failed";
    console.error("[support] process before durable capture:", msg);
    return {
      messageId: message.id,
      providerMessageId: inbound.providerMessageId,
      status: message.status,
      category: "other",
      riskLevel: "YELLOW",
      confidence: 0,
      autoSent: false,
      escalated: false,
      skippedDuplicate: false,
      durableCaptured: false,
      error: msg,
    };
  }
}

export async function runSupportInboxJob(options?: {
  fixtures?: InboundEmailNormalized[];
}): Promise<SupportJobSummary> {
  await ensureSupportSchema();

  const empty: SupportJobSummary = {
    messagesChecked: 0,
    newMessages: 0,
    autoSent: 0,
    escalated: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  };

  const leased = await claimSupportInboxLease({
    claimedBy: options?.fixtures ? "support-inbox-test" : "support-inbox",
  });
  if (!leased) {
    return {
      ...empty,
      skippedDueToLease: true,
      errors: ["Support inbox already running — skipped overlapping invocation."],
    };
  }

  try {
    return await runSupportInboxJobLocked(options);
  } finally {
    await releaseSupportInboxLease().catch(() => undefined);
  }
}

async function runSupportInboxJobLocked(options?: {
  fixtures?: InboundEmailNormalized[];
}): Promise<SupportJobSummary> {
  const summary: SupportJobSummary = {
    messagesChecked: 0,
    newMessages: 0,
    autoSent: 0,
    escalated: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  };

  const uidsToMarkSeen: number[] = [];

  try {
    // Retry Neon-side customer-send failures only when auto-send kill switch is on.
    if (isSupportAutoSendEnabled()) {
      for (const row of await listRetryableCustomerSendMessages(25)) {
        const retry = await retryDurableSideEffects(row.message.id, {
          forceCustomerSendRetry: true,
        });
        if (retry.autoSent) summary.autoSent += 1;
        if (retry.error) {
          summary.failed += 1;
          summary.errors.push(retry.error);
        }
      }
    }
    // Luke escalation notifications always retry (independent of customer auto-send).
    for (const row of await listUnnotifiedEscalations(25)) {
      const retry = await retryDurableSideEffects(row.message.id);
      if (retry.error && !retry.escalationNotified) {
        summary.errors.push(retry.error);
      }
    }

    const fetched = options?.fixtures
      ? { messages: options.fixtures, checked: options.fixtures.length }
      : await fetchUnreadSupportEmails(25);

    summary.messagesChecked = fetched.checked;
    if (fetched.error) summary.errors.push(fetched.error);

    for (const inbound of fetched.messages) {
      try {
        const result = await processInboundEmail(inbound);
        if (
          shouldMarkImapSeenAfterProcess({
            durableCaptured: result.durableCaptured,
          }) &&
          inbound.imapUid
        ) {
          uidsToMarkSeen.push(inbound.imapUid);
        }

        if (result.skippedDuplicate && !result.customerSendRetried) {
          summary.skipped += 1;
          continue;
        }
        if (!result.skippedDuplicate) summary.newMessages += 1;
        if (result.autoSent) summary.autoSent += 1;
        if (result.escalated) summary.escalated += 1;
        if (result.status === "failed") {
          summary.failed += 1;
          if (result.error) summary.errors.push(result.error);
        }
      } catch (error) {
        summary.failed += 1;
        summary.errors.push(
          error instanceof Error ? error.message : "process failed"
        );
      }
    }

    if (uidsToMarkSeen.length > 0) {
      const marked = await markSupportEmailsSeen(uidsToMarkSeen);
      if (marked.error) summary.errors.push(marked.error);
    }

    await recordJobRun({
      ok: summary.failed === 0,
      messagesChecked: summary.messagesChecked,
      newMessages: summary.newMessages,
      autoSent: summary.autoSent,
      escalated: summary.escalated,
      failed: summary.failed,
      skipped: summary.skipped,
      errorSummary: summary.errors[0],
      details: { errors: summary.errors.slice(0, 10) },
    });
  } catch (error) {
    summary.failed += 1;
    summary.errors.push(error instanceof Error ? error.message : "job failed");
    await recordJobRun({
      ok: false,
      messagesChecked: summary.messagesChecked,
      newMessages: summary.newMessages,
      autoSent: summary.autoSent,
      escalated: summary.escalated,
      failed: summary.failed,
      skipped: summary.skipped,
      errorSummary: summary.errors[0],
    });
  }

  return summary;
}
