import nodemailer from "nodemailer";

import {
  createSmtpTransport,
  emailPageWrapper,
  escapeHtml,
  EMAIL_COLORS,
} from "@/lib/email/shared";
import { SUPPORT_EMAIL } from "@/lib/cart/constants";

import {
  SUPPORT_FROM_EMAIL_DEFAULT,
  SUPPORT_FROM_NAME_DEFAULT,
  isSupportTestMode,
} from "./constants";

export type SupportMailPayload = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  inReplyTo?: string | null;
  references?: string | null;
};

function supportFromAddress(): string {
  const email =
    process.env.SUPPORT_FROM_EMAIL?.trim() || SUPPORT_FROM_EMAIL_DEFAULT;
  const name =
    process.env.SUPPORT_FROM_NAME?.trim() || SUPPORT_FROM_NAME_DEFAULT;
  return `${name} <${email}>`;
}

/** Customer-facing support SMTP (Porkbun). Falls back to shared SMTP_* if unset. */
export function createSupportSmtpTransport() {
  const host =
    process.env.SUPPORT_SMTP_HOST?.trim() || process.env.SMTP_HOST?.trim();
  const user =
    process.env.SUPPORT_SMTP_USER?.trim() || process.env.SMTP_USER?.trim();
  const pass =
    process.env.SUPPORT_SMTP_PASSWORD?.trim() ||
    process.env.SMTP_PASSWORD?.trim();
  if (!host || !user || !pass) {
    throw new Error("Support SMTP is not configured.");
  }
  return nodemailer.createTransport({
    host,
    port: Number(
      process.env.SUPPORT_SMTP_PORT?.trim() ||
        process.env.SMTP_PORT?.trim() ||
        587
    ),
    secure: false,
    requireTLS: true,
    auth: { user, pass },
  });
}

export async function sendSupportCustomerEmail(
  payload: SupportMailPayload
): Promise<{ sent: boolean; skippedTestMode: boolean }> {
  if (isSupportTestMode()) {
    console.log(
      `[support/smtp] TEST MODE skip customer send to=${payload.to} subject=${payload.subject}`
    );
    return { sent: false, skippedTestMode: true };
  }

  const transporter = createSupportSmtpTransport();
  await transporter.sendMail({
    from: supportFromAddress(),
    to: payload.to,
    replyTo: process.env.SUPPORT_FROM_EMAIL?.trim() || SUPPORT_FROM_EMAIL_DEFAULT,
    subject: payload.subject.startsWith("Re:")
      ? payload.subject
      : `Re: ${payload.subject}`,
    text: payload.text,
    html: payload.html ?? emailPageWrapper(`<pre style="white-space:pre-wrap;font-family:Arial,Helvetica,sans-serif;">${escapeHtml(payload.text)}</pre>`),
    inReplyTo: payload.inReplyTo ?? undefined,
    references: payload.references ?? undefined,
  });
  return { sent: true, skippedTestMode: false };
}

export async function sendSupportEscalationEmail(input: {
  customer: string;
  subject: string;
  category: string;
  risk: string;
  confidence: number;
  why: string;
  suggestedResponse: string;
  adminUrl: string;
}): Promise<void> {
  if (isSupportTestMode()) {
    console.log("[support/smtp] TEST MODE skip escalation email");
    return;
  }

  const to =
    process.env.ORDER_NOTIFICATION_EMAIL?.trim() || SUPPORT_EMAIL;
  const { muted, accent, border, surface } = EMAIL_COLORS;
  const html = emailPageWrapper(`
    <h2 style="margin:0 0 12px;font-size:18px;color:${accent};">SUPPORT ESCALATION</h2>
    <div style="background:${surface};border:1px solid ${border};border-radius:8px;padding:16px;font-size:14px;">
      <p style="margin:0 0 8px;"><strong>Customer:</strong> ${escapeHtml(input.customer)}</p>
      <p style="margin:0 0 8px;"><strong>Subject:</strong> ${escapeHtml(input.subject)}</p>
      <p style="margin:0 0 8px;"><strong>Category:</strong> ${escapeHtml(input.category)}</p>
      <p style="margin:0 0 8px;"><strong>Risk:</strong> ${escapeHtml(input.risk)}</p>
      <p style="margin:0 0 8px;"><strong>Confidence:</strong> ${input.confidence.toFixed(2)}</p>
      <p style="margin:0 0 8px;color:${muted};"><strong>Why escalated:</strong> ${escapeHtml(input.why)}</p>
      <p style="margin:12px 0 4px;color:${muted};">Suggested response</p>
      <pre style="white-space:pre-wrap;font-size:12px;">${escapeHtml(input.suggestedResponse.slice(0, 4000))}</pre>
      <p style="margin:12px 0 0;"><a href="${escapeHtml(input.adminUrl)}" style="color:${accent};">Open admin support</a></p>
    </div>`);

  const text = [
    "SUPPORT ESCALATION",
    "",
    `Customer: ${input.customer}`,
    `Subject: ${input.subject}`,
    `Category: ${input.category}`,
    `Risk: ${input.risk}`,
    `Confidence: ${input.confidence.toFixed(2)}`,
    "",
    `Why escalated: ${input.why}`,
    "",
    "Suggested response:",
    input.suggestedResponse.slice(0, 4000),
    "",
    `Admin: ${input.adminUrl}`,
  ].join("\n");

  // Internal notify may use shared SMTP.
  const transporter = createSmtpTransport();
  await transporter.sendMail({
    from: `PSL Labs Support Agent <${SUPPORT_EMAIL}>`,
    to,
    subject: `SUPPORT ESCALATION — ${input.risk} — ${input.subject}`.slice(0, 200),
    text,
    html,
  });
}
