import { SITE_URL } from "@/lib/seo";

import { classifySupportMessage } from "./classify";
import { decideOutboundAction, draftSupportResponse } from "./draft";
import { sendSupportCustomerEmail, sendSupportEscalationEmail } from "./smtp";
import {
  createEscalation,
  findMessageByProviderId,
  insertInboundMessage,
  markEscalationNotified,
  markResponseSent,
  saveClassification,
  saveDraftResponse,
  setMessageStatus,
  upsertThread,
} from "./store";
import type {
  InboundEmailNormalized,
  ProcessMessageResult,
  SupportJobSummary,
} from "./types";
import { fetchUnreadSupportEmails } from "./imap";
import { recordJobRun } from "./store";
import { ensureSupportSchema } from "./schema";

export async function processInboundEmail(
  inbound: InboundEmailNormalized
): Promise<ProcessMessageResult> {
  const existing = await findMessageByProviderId(inbound.providerMessageId);
  if (
    existing &&
    (existing.status === "auto_sent" ||
      existing.status === "human_sent" ||
      existing.status === "escalated" ||
      existing.status === "resolved" ||
      existing.status === "drafted" ||
      existing.status === "classified")
  ) {
    return {
      messageId: existing.id,
      providerMessageId: inbound.providerMessageId,
      status: existing.status,
      category: "other",
      riskLevel: "YELLOW",
      confidence: 0,
      autoSent: existing.status === "auto_sent",
      escalated: existing.status === "escalated",
      skippedDuplicate: true,
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

  if (!inserted && message.status !== "ingested") {
    return {
      messageId: message.id,
      providerMessageId: inbound.providerMessageId,
      status: message.status,
      category: "other",
      riskLevel: "YELLOW",
      confidence: 0,
      autoSent: false,
      escalated: false,
      skippedDuplicate: true,
    };
  }

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

  if (action.sendCustomerReply) {
    try {
      const result = await sendSupportCustomerEmail({
        to: inbound.fromEmail,
        subject: inbound.subject,
        text: draft.bodyText,
        html: draft.bodyHtml,
        inReplyTo: inbound.providerMessageId,
        references: inbound.providerMessageId,
      });
      if (result.sent) {
        await markResponseSent({
          responseId,
          messageId: message.id,
          sentBody: draft.bodyText,
          humanApproved: false,
          status: "auto_sent",
        });
        autoSent = true;
      }
      // Test mode: keep drafted/escalated path; never pretend a real send happened.
    } catch (error) {
      // Leave without sent_at so a later run can retry send if still eligible.
      await setMessageStatus(message.id, "failed");
      return {
        messageId: message.id,
        providerMessageId: inbound.providerMessageId,
        status: "failed",
        category: classification.category,
        riskLevel: classification.riskLevel,
        confidence: classification.confidence,
        autoSent: false,
        escalated: false,
        skippedDuplicate: false,
        error: error instanceof Error ? error.message : "SMTP send failed",
      };
    }
  }

  if (action.escalate) {
    const escId = await createEscalation({
      messageId: message.id,
      riskLevel: classification.riskLevel,
      reason: action.reason + (draft.escalationReason ? ` | ${draft.escalationReason}` : ""),
    });
    escalated = true;
    try {
      await sendSupportEscalationEmail({
        customer: inbound.fromEmail,
        subject: inbound.subject,
        category: classification.category,
        risk: classification.riskLevel,
        confidence: classification.confidence,
        why: draft.escalationReason || action.reason,
        suggestedResponse: draft.bodyText,
        adminUrl: `${SITE_URL}/admin-support`,
      });
      await markEscalationNotified(escId);
    } catch (error) {
      console.error(
        "[support] escalation notify failed:",
        error instanceof Error ? error.message : error
      );
    }
  }

  return {
    messageId: message.id,
    providerMessageId: inbound.providerMessageId,
    status: autoSent ? "auto_sent" : escalated ? "escalated" : "drafted",
    category: classification.category,
    riskLevel: classification.riskLevel,
    confidence: classification.confidence,
    autoSent,
    escalated,
    skippedDuplicate: false,
  };
}

export async function runSupportInboxJob(options?: {
  fixtures?: InboundEmailNormalized[];
}): Promise<SupportJobSummary> {
  await ensureSupportSchema();

  const summary: SupportJobSummary = {
    messagesChecked: 0,
    newMessages: 0,
    autoSent: 0,
    escalated: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  };

  try {
    const fetched = options?.fixtures
      ? { messages: options.fixtures, checked: options.fixtures.length }
      : await fetchUnreadSupportEmails(25);

    summary.messagesChecked = fetched.checked;
    if (fetched.error) summary.errors.push(fetched.error);

    for (const inbound of fetched.messages) {
      try {
        const result = await processInboundEmail(inbound);
        if (result.skippedDuplicate) {
          summary.skipped += 1;
          continue;
        }
        summary.newMessages += 1;
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
