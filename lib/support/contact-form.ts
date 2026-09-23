import { extractEmailAddress } from "./sanitize";

export const CONTACT_FORM_SUBJECT_PREFIX = "[PSL Labs Contact]";
export const CONTACT_FORM_SOURCE_MARKER = "Source: PSL Labs Contact Form";
export const SUPPORT_MAILBOX_ADDRESS = "support@psllabs.org";

/**
 * Website contact-form messages only.
 * BOTH conditions required — ordinary inbox mail is completely ineligible.
 */
export function isEligibleWebsiteContactForm(input: {
  subject: string;
  body: string;
}): boolean {
  const subject = (input.subject ?? "").trim();
  const body = input.body ?? "";
  return (
    subject.startsWith(CONTACT_FORM_SUBJECT_PREFIX) &&
    body.includes(CONTACT_FORM_SOURCE_MARKER)
  );
}

export function isValidEmailShape(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/**
 * Addresses that must never receive an automated customer support reply.
 * Especially: never treat the mailbox From (support@) as the customer.
 */
export function isForbiddenCustomerReplyRecipient(email: string): boolean {
  const normalized = extractEmailAddress(email);
  if (!normalized) return true;
  if (normalized === SUPPORT_MAILBOX_ADDRESS) return true;
  if (normalized.endsWith("@psllabs.org")) return true;
  return false;
}

export function isAllowedCustomerReplyRecipient(email: string): boolean {
  const normalized = extractEmailAddress(email);
  if (!normalized || !isValidEmailShape(normalized)) return false;
  if (isForbiddenCustomerReplyRecipient(normalized)) return false;
  return true;
}

/** Parse structured contact-form body field: Email: customer@example.com */
export function parseContactFormEmailField(body: string): string | null {
  const match = (body ?? "").match(/^\s*Email:\s*(.+)\s*$/im);
  if (!match?.[1]) return null;
  const email = extractEmailAddress(match[1]);
  return email || null;
}

export type ResolveCustomerReplyResult = {
  email: string | null;
  source: "reply-to" | "body-email-field" | "none";
};

/**
 * Prefer explicit Reply-To; otherwise parse Email: from the contact-form body.
 * Never falls back to envelope From when that is support@psllabs.org.
 */
export function resolveContactFormCustomerReplyEmail(input: {
  replyToHeader?: string | null;
  body: string;
  envelopeFrom?: string | null;
}): ResolveCustomerReplyResult {
  const replyToRaw = (input.replyToHeader ?? "").trim();
  if (replyToRaw) {
    const replyTo = extractEmailAddress(replyToRaw);
    if (isAllowedCustomerReplyRecipient(replyTo)) {
      return { email: replyTo, source: "reply-to" };
    }
  }

  const fromBody = parseContactFormEmailField(input.body);
  if (fromBody && isAllowedCustomerReplyRecipient(fromBody)) {
    return { email: fromBody, source: "body-email-field" };
  }

  // Explicitly do NOT use envelope From when it is the support mailbox / internal.
  return { email: null, source: "none" };
}
