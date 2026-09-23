import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

import { isSupportTestMode } from "./constants";
import {
  isEligibleWebsiteContactForm,
  resolveContactFormCustomerReplyEmail,
} from "./contact-form";
import {
  buildThreadKey,
  extractEmailAddress,
  normalizeBody,
  normalizeSubject,
} from "./sanitize";
import type { InboundEmailNormalized } from "./types";

export type ImapFetchResult = {
  messages: InboundEmailNormalized[];
  checked: number;
  error?: string;
};

function imapConfig() {
  const host = process.env.SUPPORT_IMAP_HOST?.trim();
  const user = process.env.SUPPORT_IMAP_USER?.trim();
  const pass = process.env.SUPPORT_IMAP_PASSWORD?.trim();
  if (!host || !user || !pass) {
    return null;
  }
  return {
    host,
    port: Number(process.env.SUPPORT_IMAP_PORT?.trim() || 993),
    secure: true,
    auth: { user, pass },
    logger: false as const,
  };
}

export function isSupportImapConfigured(): boolean {
  return imapConfig() !== null;
}

function replyToFromParsed(parsed: {
  replyTo?: { text?: string; value?: Array<{ address?: string }> } | string;
}): string | null {
  const replyTo = parsed.replyTo;
  if (!replyTo) return null;
  if (typeof replyTo === "string") return replyTo;
  if (typeof replyTo.text === "string" && replyTo.text.trim()) return replyTo.text;
  const addr = replyTo.value?.[0]?.address;
  return addr ? String(addr) : null;
}

/**
 * Normalize a raw IMAP/parser payload into an inbound message only when it is
 * an eligible website contact-form submission. Returns null for all other mail
 * (ordinary support@ traffic, internal, vendor) — callers must not mutate those.
 */
export function normalizeEligibleContactFormInbound(input: {
  providerMessageId: string;
  imapUid?: number | null;
  envelopeFrom: string;
  fromName?: string | null;
  toEmail?: string | null;
  replyToHeader?: string | null;
  subject: string;
  bodyText: string;
  receivedAt: string;
}): InboundEmailNormalized | null {
  const subject = normalizeSubject(input.subject || "(no subject)");
  const normalizedBody = normalizeBody(input.bodyText || "");
  if (
    !isEligibleWebsiteContactForm({
      subject,
      body: normalizedBody,
    })
  ) {
    return null;
  }

  const envelopeFrom = extractEmailAddress(input.envelopeFrom);
  const resolved = resolveContactFormCustomerReplyEmail({
    replyToHeader: input.replyToHeader ?? null,
    body: normalizedBody,
    envelopeFrom,
  });

  const customerReplyEmail = resolved.email;
  // Thread identity prefers the real customer; never leave support@ as customer.
  const fromEmail = customerReplyEmail || envelopeFrom || "unknown@invalid";

  return {
    providerMessageId: input.providerMessageId.trim().slice(0, 500),
    imapUid: input.imapUid ?? null,
    threadKey: buildThreadKey({
      fromEmail,
      subject,
      inReplyTo: null,
      references: null,
    }),
    fromEmail,
    fromName: input.fromName ?? null,
    toEmail: input.toEmail ?? null,
    envelopeFromEmail: envelopeFrom || null,
    replyToEmail: input.replyToHeader
      ? extractEmailAddress(input.replyToHeader) || null
      : null,
    customerReplyEmail,
    subject,
    receivedAt: input.receivedAt,
    normalizedBody,
    rawHeadersSummary: null,
  };
}

/**
 * Connect → fetch recent UNSEEN → disconnect.
 * Does NOT mark \Seen — caller must mark only after durable Neon handling.
 * Non-contact-form mail is left completely untouched (UNSEEN, unprocessed).
 */
export async function fetchUnreadSupportEmails(
  limit = 25
): Promise<ImapFetchResult> {
  if (isSupportTestMode()) {
    return { messages: [], checked: 0 };
  }

  const config = imapConfig();
  if (!config) {
    return {
      messages: [],
      checked: 0,
      error: "Support IMAP not configured",
    };
  }

  const client = new ImapFlow(config);
  const messages: InboundEmailNormalized[] = [];
  let checked = 0;

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const uids = await client.search({ seen: false }, { uid: true });
      const list = (uids || []).slice(-limit);
      checked = list.length;

      for (const uid of list) {
        const downloaded = await client.download(uid, undefined, { uid: true });
        if (!downloaded?.content) continue;
        const parsed = await simpleParser(downloaded.content);
        const envelopeFrom = extractEmailAddress(
          parsed.from?.text || parsed.from?.value?.[0]?.address || ""
        );
        const providerMessageId = (
          parsed.messageId || `uid-${uid}@imap.local`
        )
          .trim()
          .slice(0, 500);
        const subjectRaw = parsed.subject || "(no subject)";
        const bodyText =
          typeof parsed.text === "string"
            ? parsed.text
            : parsed.html
              ? String(parsed.html).replace(/<[^>]+>/g, " ")
              : "";
        const receivedAt = (
          parsed.date instanceof Date ? parsed.date : new Date()
        ).toISOString();
        const replyToHeader = replyToFromParsed(parsed);

        const inbound = normalizeEligibleContactFormInbound({
          providerMessageId,
          imapUid: Number(uid),
          envelopeFrom,
          fromName: parsed.from?.value?.[0]?.name || null,
          toEmail: parsed.to
            ? extractEmailAddress(
                typeof parsed.to === "object" && "text" in parsed.to
                  ? String(parsed.to.text)
                  : String(parsed.to)
              )
            : null,
          replyToHeader,
          subject: subjectRaw,
          bodyText,
          receivedAt,
        });

        // Ineligible: ignore completely — do not mark Seen, label, or archive.
        if (!inbound) continue;

        // Preserve in-reply-to / references for thread key when present.
        inbound.threadKey = buildThreadKey({
          fromEmail: inbound.fromEmail,
          subject: inbound.subject,
          inReplyTo: parsed.inReplyTo || null,
          references: Array.isArray(parsed.references)
            ? parsed.references.join(" ")
            : parsed.references || null,
        });

        messages.push(inbound);
      }
    } finally {
      lock.release();
    }
    await client.logout();
  } catch (error) {
    try {
      await client.logout();
    } catch {
      /* ignore */
    }
    const message = error instanceof Error ? error.message : "IMAP fetch failed";
    console.error("[support/imap]", message);
    return { messages, checked, error: message };
  }

  return { messages, checked };
}

/** Mark UIDs \Seen after durable Neon handling. Failures are non-fatal (dedupe covers re-fetch). */
export async function markSupportEmailsSeen(
  uids: number[]
): Promise<{ marked: number; error?: string }> {
  const unique = [...new Set(uids.filter((u) => Number.isFinite(u) && u > 0))];
  if (unique.length === 0) return { marked: 0 };
  if (isSupportTestMode()) return { marked: unique.length };

  const config = imapConfig();
  if (!config) return { marked: 0, error: "Support IMAP not configured" };

  const client = new ImapFlow(config);
  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      for (const uid of unique) {
        await client.messageFlagsAdd(uid, ["\\Seen"], { uid: true });
      }
    } finally {
      lock.release();
    }
    await client.logout();
    return { marked: unique.length };
  } catch (error) {
    try {
      await client.logout();
    } catch {
      /* ignore */
    }
    const message =
      error instanceof Error ? error.message : "IMAP mark-seen failed";
    console.error("[support/imap] mark-seen:", message);
    return { marked: 0, error: message };
  }
}
