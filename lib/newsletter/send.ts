import crypto from "crypto";

import { createSmtpTransport, SUPPORT_EMAIL } from "@/lib/email/shared";

import type { BuiltNewsletterEmail } from "./templates";

export type NewsletterMail = {
  from: string;
  to: string;
  replyTo: string;
  subject: string;
  text: string;
  html: string;
  messageId: string;
  headers: Record<string, string>;
};

export type NewsletterTransportResult = {
  messageId?: string;
  response?: string;
  accepted?: Array<string | { address: string }>;
  rejected?: Array<string | { address: string }>;
};

export type NewsletterTransport = (mail: NewsletterMail) => Promise<NewsletterTransportResult>;

/**
 * accepted  — the SMTP server returned 250 for the message (not inbox delivery).
 * failed    — definitely not accepted, temporary (eligible for a later run).
 * rejected  — definitely not accepted, permanent server refusal.
 * unknown   — the outcome cannot be determined; never retried automatically.
 * simulated — test mode: no SMTP connection at all.
 */
export type NewsletterDeliveryOutcome = {
  status: "accepted" | "failed" | "rejected" | "unknown" | "simulated";
  messageId: string;
  providerQueueId: string | null;
  providerResponse: string | null;
  errorCategory: string | null;
};

let transportOverride: NewsletterTransport | null = null;

export function __setNewsletterTransportForTests(transport: NewsletterTransport | null): void {
  transportOverride = transport;
}

const SMTP_TIMEOUTS = { connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000 };

function defaultTransport(): NewsletterTransport {
  return async (mail) => {
    const transporter = createSmtpTransport(SMTP_TIMEOUTS);
    try {
      return (await transporter.sendMail(mail)) as NewsletterTransportResult;
    } finally {
      transporter.close();
    }
  };
}

function sanitizeResponse(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  return value.replace(/[\r\n]+/g, " ").replace(/[^\x20-\x7E]/g, "").trim().slice(0, 200) || null;
}

function queueIdFrom(response: string | null): string | null {
  if (!response) return null;
  const m = /queued as ([A-Za-z0-9._-]{4,64})/i.exec(response) ?? /\bid=([A-Za-z0-9._-]{4,64})/i.exec(response);
  return m ? m[1] : null;
}

function addresses(list: NewsletterTransportResult["accepted"]): string[] {
  return (list ?? []).map((a) => (typeof a === "string" ? a : a.address).toLowerCase());
}

const CONNECT_PHASE = /Greeting never received|Connection timeout|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|EHOSTUNREACH|ENETUNREACH|certificate|self[- ]signed/i;

export function classifySmtpError(error: unknown): Pick<NewsletterDeliveryOutcome, "status" | "errorCategory" | "providerResponse"> {
  const e = (error ?? {}) as { code?: string; responseCode?: number; command?: string; message?: string; response?: string };
  const providerResponse = sanitizeResponse(e.response);
  const message = String(e.message ?? "");
  if (message === "SMTP is not configured.") return { status: "failed", errorCategory: "config", providerResponse };
  if (typeof e.responseCode === "number" && e.responseCode >= 500) {
    const command = String(e.command ?? "").toUpperCase();
    const category = command.startsWith("RCPT") ? "rejected_recipient" : command.startsWith("MAIL") ? "rejected_sender" : command.startsWith("AUTH") ? "auth" : "rejected_message";
    return { status: category === "auth" ? "failed" : "rejected", errorCategory: category, providerResponse };
  }
  if (typeof e.responseCode === "number" && e.responseCode >= 400) return { status: "failed", errorCategory: "temporary", providerResponse };
  if (e.code === "EAUTH") return { status: "failed", errorCategory: "auth", providerResponse };
  if (e.code === "EENVELOPE") return { status: "rejected", errorCategory: "rejected_recipient", providerResponse };
  if (e.code === "EMESSAGE" || e.code === "ESTREAM") return { status: "failed", errorCategory: "message_build", providerResponse };
  if ((e.code === "ECONNECTION" || e.code === "ESOCKET" || e.code === "ETIMEDOUT" || e.code === "EDNS" || e.code === "ETLS") && CONNECT_PHASE.test(message)) {
    return { status: "failed", errorCategory: "connection", providerResponse };
  }
  if (e.code === "ETIMEDOUT") return { status: "unknown", errorCategory: "timeout_ambiguous", providerResponse };
  return { status: "unknown", errorCategory: "unknown", providerResponse };
}

export function newsletterMessageId(fromEmail: string): string {
  const domain = fromEmail.split("@")[1]?.replace(/[^A-Za-z0-9.-]/g, "") || "psllabs.org";
  return `<nl.${crypto.randomBytes(12).toString("hex")}@${domain}>`;
}

export async function deliverNewsletterEmail(input: {
  to: string;
  fromEmail: string;
  built: BuiltNewsletterEmail;
  simulate: boolean;
}): Promise<NewsletterDeliveryOutcome> {
  const messageId = newsletterMessageId(input.fromEmail);
  if (input.simulate) {
    return { status: "simulated", messageId, providerQueueId: null, providerResponse: null, errorCategory: null };
  }
  const headers: Record<string, string> = {};
  if (input.built.listUnsubscribeUrl) {
    headers["List-Unsubscribe"] = `<${input.built.listUnsubscribeUrl}>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }
  const mail: NewsletterMail = {
    from: `PSL Labs <${input.fromEmail}>`,
    to: input.to,
    replyTo: SUPPORT_EMAIL,
    subject: input.built.subject,
    text: input.built.text,
    html: input.built.html,
    messageId,
    headers,
  };
  try {
    const info = await (transportOverride ?? defaultTransport())(mail);
    const providerResponse = sanitizeResponse(info.response);
    const to = input.to.toLowerCase();
    if (addresses(info.rejected).includes(to)) {
      return { status: "rejected", messageId, providerQueueId: null, providerResponse, errorCategory: "rejected_recipient" };
    }
    if (!addresses(info.accepted).includes(to)) {
      return { status: "unknown", messageId, providerQueueId: null, providerResponse, errorCategory: "no_acceptance_reported" };
    }
    return { status: "accepted", messageId, providerQueueId: queueIdFrom(providerResponse), providerResponse, errorCategory: null };
  } catch (error) {
    const c = classifySmtpError(error);
    return { ...c, messageId, providerQueueId: null };
  }
}
