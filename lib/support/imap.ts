import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

import { isSupportTestMode } from "./constants";
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

/**
 * Connect → fetch recent UNSEEN → disconnect.
 * Safe for daily serverless cron (no persistent connection).
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
        const fromEmail = extractEmailAddress(
          parsed.from?.text || parsed.from?.value?.[0]?.address || ""
        );
        if (!fromEmail || fromEmail.endsWith("@psllabs.org")) {
          // Skip empty or our own outbound echoes.
          await client.messageFlagsAdd(uid, ["\\Seen"], { uid: true });
          continue;
        }

        const providerMessageId =
          (parsed.messageId || `uid-${uid}@imap.local`).trim().slice(0, 500);
        const subject = normalizeSubject(parsed.subject || "(no subject)");
        const bodyText =
          typeof parsed.text === "string"
            ? parsed.text
            : parsed.html
              ? String(parsed.html).replace(/<[^>]+>/g, " ")
              : "";
        const normalized = normalizeBody(bodyText);
        const receivedAt = (
          parsed.date instanceof Date ? parsed.date : new Date()
        ).toISOString();

        messages.push({
          providerMessageId,
          threadKey: buildThreadKey({
            fromEmail,
            subject,
            inReplyTo: parsed.inReplyTo || null,
            references: Array.isArray(parsed.references)
              ? parsed.references.join(" ")
              : parsed.references || null,
          }),
          fromEmail,
          fromName: parsed.from?.value?.[0]?.name || null,
          toEmail: parsed.to
            ? extractEmailAddress(
                typeof parsed.to === "object" && "text" in parsed.to
                  ? String(parsed.to.text)
                  : String(parsed.to)
              )
            : null,
          subject,
          receivedAt,
          normalizedBody: normalized,
          rawHeadersSummary: null,
        });

        // Mark seen after successful parse so retries don't re-fetch forever.
        // Idempotency is still enforced in Neon by provider_message_id.
        await client.messageFlagsAdd(uid, ["\\Seen"], { uid: true });
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
    // Never log credentials.
    console.error("[support/imap]", message);
    return { messages, checked, error: message };
  }

  return { messages, checked };
}
