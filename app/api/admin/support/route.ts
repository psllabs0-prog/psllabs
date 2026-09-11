import { NextResponse } from "next/server";

import { requireAdminAuth } from "@/lib/admin/require-auth";
import {
  isSupportAutoSendEnabled,
  type SupportCategory,
  type SupportRiskLevel,
} from "@/lib/support/constants";
import { isSupportImapConfigured } from "@/lib/support/imap";
import { isSolicitationCategory } from "@/lib/support/solicitation";
import { sendSupportCustomerEmail } from "@/lib/support/smtp";
import {
  getLatestDraft,
  getLatestJobRun,
  getMessageWithThread,
  listSupportInbox,
  markMessageResolved,
  markMessageSolicitation,
  markResponseSent,
  restoreMessageToActiveSupport,
  saveDraftResponse,
  setMessageReportingExcluded,
  setThreadAutoSendDisabled,
  type SupportInboxFilter,
  updateClassificationManual,
} from "@/lib/support/store";
import { runSupportInboxJob } from "@/lib/support/process";

export const runtime = "nodejs";
export const maxDuration = 60;

function parseInboxFilter(value: string | null): SupportInboxFilter {
  if (value === "spam" || value === "vendor") return value;
  return "active";
}

export async function GET(request: Request) {
  const authError = await requireAdminAuth();
  if (authError) return authError;

  try {
    const url = new URL(request.url);
    const filter = parseInboxFilter(url.searchParams.get("filter"));
    const [items, lastJob] = await Promise.all([
      listSupportInbox(75, filter),
      getLatestJobRun(),
    ]);
    return NextResponse.json({
      autoSendEnabled: isSupportAutoSendEnabled(),
      imapConfigured: isSupportImapConfigured(),
      filter,
      lastJob,
      items,
    });
  } catch (error) {
    console.error("[admin/support] GET", error);
    return NextResponse.json(
      { error: "Unable to load support inbox." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const authError = await requireAdminAuth();
  if (authError) return authError;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = typeof body.action === "string" ? body.action : "";

  try {
    if (action === "run_inbox") {
      const summary = await runSupportInboxJob();
      return NextResponse.json({ ok: true, summary });
    }

    if (action === "approve_send") {
      const messageId = Number(body.messageId);
      const edited =
        typeof body.body === "string" && body.body.trim()
          ? body.body.trim()
          : null;
      const row = await getMessageWithThread(messageId);
      if (!row) {
        return NextResponse.json({ error: "Message not found" }, { status: 404 });
      }
      let responseId: number;
      let text: string;
      if (edited) {
        responseId = await saveDraftResponse(messageId, {
          bodyText: edited,
          bodyHtml: `<p>${edited.replace(/\n/g, "<br/>")}</p>`,
          knowledgeSources: ["admin:edited"],
          aiDrafted: false,
          requiresEscalation: false,
          escalationReason: null,
          policyDecision: "human_approved_send",
        });
        text = edited;
      } else {
        const draft = await getLatestDraft(messageId);
        if (!draft) {
          return NextResponse.json({ error: "No draft" }, { status: 400 });
        }
        if (draft.sentAt) {
          return NextResponse.json(
            { error: "Already sent — will not send twice" },
            { status: 400 }
          );
        }
        responseId = draft.id;
        text = draft.draftBody;
      }

      await sendSupportCustomerEmail({
        to: row.message.fromEmail,
        subject: row.message.subject,
        text,
        inReplyTo: row.message.providerMessageId,
        references: row.message.providerMessageId,
      });
      await markResponseSent({
        responseId,
        messageId,
        sentBody: text,
        humanApproved: true,
        status: "human_sent",
      });
      return NextResponse.json({ ok: true });
    }

    if (action === "mark_resolved") {
      const messageId = Number(body.messageId);
      await markMessageResolved(messageId);
      return NextResponse.json({ ok: true });
    }

    if (action === "mark_spam") {
      const messageId = Number(body.messageId);
      await markMessageSolicitation({
        messageId,
        category: "spam_solicitation",
      });
      return NextResponse.json({ ok: true });
    }

    if (action === "mark_vendor") {
      const messageId = Number(body.messageId);
      await markMessageSolicitation({
        messageId,
        category: "vendor_solicitation",
      });
      return NextResponse.json({ ok: true });
    }

    if (action === "restore_active") {
      const messageId = Number(body.messageId);
      const category =
        typeof body.category === "string"
          ? (body.category as SupportCategory)
          : undefined;
      const riskLevel =
        typeof body.riskLevel === "string"
          ? (body.riskLevel as SupportRiskLevel)
          : undefined;
      const result = await restoreMessageToActiveSupport({
        messageId,
        category,
        riskLevel,
      });
      return NextResponse.json({ ok: true, ...result });
    }

    if (action === "mark_reporting_excluded") {
      const messageId = Number(body.messageId);
      await setMessageReportingExcluded(messageId, true);
      return NextResponse.json({ ok: true });
    }

    if (action === "restore_reporting") {
      const messageId = Number(body.messageId);
      await setMessageReportingExcluded(messageId, false);
      return NextResponse.json({ ok: true });
    }

    if (action === "set_auto_send") {
      const threadId = Number(body.threadId);
      const disabled = body.disabled === true;
      await setThreadAutoSendDisabled(threadId, disabled);
      return NextResponse.json({ ok: true });
    }

    if (action === "change_classification") {
      const messageId = Number(body.messageId);
      const category = body.category as SupportCategory;
      const riskLevel = body.riskLevel as SupportRiskLevel;
      if (!category || !riskLevel) {
        return NextResponse.json(
          { error: "category and riskLevel required" },
          { status: 400 }
        );
      }
      if (isSolicitationCategory(category)) {
        await markMessageSolicitation({
          messageId,
          category: category as "spam_solicitation" | "vendor_solicitation",
        });
      } else {
        await updateClassificationManual({ messageId, category, riskLevel });
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("[admin/support] POST", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Action failed",
      },
      { status: 500 }
    );
  }
}
