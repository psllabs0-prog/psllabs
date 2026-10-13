import crypto from "node:crypto";
import type { SendMailOptions } from "nodemailer";
import { LEGAL_ENTITY_NAME } from "@/lib/content/testing-scope";
import { classifySmtpError, type NewsletterTransportResult } from "@/lib/newsletter/send";
import {
  createSmtpTransport,
  emailPageWrapper,
  escapeHtml,
  EMAIL_COLORS,
  SUPPORT_EMAIL,
} from "@/lib/email/shared";
import { SITE_URL } from "@/lib/seo";
import { ORDER_DOCUMENTATION_LINKS } from "@/lib/email/order-documentation";

import {
  createUnsubscribeToken,
  getMarketingFromEmail,
  getMarketingPostalAddress,
  humanUnsubscribeUrl,
  isRetentionTestMode,
  listUnsubscribeApiUrl,
  RETENTION_SUBJECT,
  RETENTION_UTM,
  retentionProductsUrl,
} from "./config";

export function buildRetention30dEmail(input: {
  email: string;
  siteUrl?: string;
}): {
  subject: string;
  text: string;
  html: string;
  /** Visible body link → human confirmation page. */
  humanUnsubscribeUrl: string;
  /** List-Unsubscribe header → one-click API. */
  listUnsubscribeUrl: string;
} {
  const site = input.siteUrl ?? SITE_URL;
  const ctaUrl = retentionProductsUrl(site);
  const documentationLinks = ORDER_DOCUMENTATION_LINKS.map((link) => {
    const url = new URL(link.path, site);
    for (const [key, value] of Object.entries(RETENTION_UTM)) url.searchParams.set(key, value);
    return { label: link.label, url: url.toString() };
  });
  const unsubToken = createUnsubscribeToken(input.email);
  const humanUrl = humanUnsubscribeUrl(site, unsubToken);
  const listUrl = listUnsubscribeApiUrl(site, unsubToken);
  const postal = getMarketingPostalAddress() ?? "[postal address not configured]";
  const { muted, accent } = EMAIL_COLORS;

  const subject = RETENTION_SUBJECT;

  const text = [
    "Hello,",
    "",
    "Planning another laboratory research order? You can check current PSL Labs availability and the documentation published for each listed lot before choosing a product.",
    "",
    `View Products & Batch Reports: ${ctaUrl}`,
    "",
    "Keeping records from your last order? Match the identifier on the received label to its original report. A newly listed lot may have different documentation.",
    ...documentationLinks.map((link) => `${link.label}: ${link.url}`),
    "",
    "If a report is missing or a field is unclear, reply with the label identifier and your question. We can help you locate the documentation.",
    "",
    "You are receiving this because you opted into PSL Labs marketing emails. You can unsubscribe below.",
    "All products are for laboratory research use only. Not for human or animal consumption.",
    "",
    `${LEGAL_ENTITY_NAME}`,
    postal,
    `Support: ${SUPPORT_EMAIL}`,
    "",
    `Unsubscribe: ${humanUrl}`,
  ].join("\n");

  const html = emailPageWrapper(`
    <p style="margin:0 0 12px;">Hello,</p>
    <p style="margin:0 0 16px;">Planning another laboratory research order? You can check current PSL Labs availability and the documentation published for each listed lot before choosing a product.</p>
    <p style="margin:0 0 20px;">
      <a href="${escapeHtml(ctaUrl)}" style="display:inline-block;background:${accent};color:#0B0C0E;text-decoration:none;padding:10px 16px;border-radius:4px;font-weight:600;">View Products &amp; Batch Reports</a>
    </p>
    <p style="margin:0 0 12px;">Keeping records from your last order? Match the identifier on the received label to its original report. A newly listed lot may have different documentation.</p>
    <ul style="margin:0 0 16px;padding-left:20px;">${documentationLinks.map((link) => `<li><a href="${escapeHtml(link.url)}" style="color:${accent};">${escapeHtml(link.label)}</a></li>`).join("")}</ul>
    <p style="margin:0 0 20px;">If a report is missing or a field is unclear, reply with the label identifier and your question. We can help you locate the documentation.</p>
    <p style="margin:0 0 12px;font-size:13px;color:${muted};">You are receiving this because you opted into PSL Labs marketing emails. You can unsubscribe below.</p>
    <p style="margin:0 0 12px;font-size:13px;color:${muted};">All products are for laboratory research use only. Not for human or animal consumption.</p>
    <p style="margin:24px 0 0;font-size:12px;color:${muted};">${escapeHtml(LEGAL_ENTITY_NAME)}<br/>${escapeHtml(postal)}<br/>Support: ${escapeHtml(SUPPORT_EMAIL)}</p>
    <p style="margin:12px 0 0;font-size:12px;"><a href="${escapeHtml(humanUrl)}" style="color:${muted};">Unsubscribe</a></p>
  `);

  return {
    subject,
    text,
    html,
    humanUnsubscribeUrl: humanUrl,
    listUnsubscribeUrl: listUrl,
  };
}

export type RetentionTransport = (mail: SendMailOptions) => Promise<NewsletterTransportResult>;
let transportOverride: RetentionTransport | null = null;

export function __setRetentionTransportForTests(transport: RetentionTransport | null): void {
  transportOverride = transport;
}

export class RetentionDeliveryError extends Error {
  constructor(public readonly outcome: "failed" | "rejected" | "unknown", public readonly category: string) {
    super(`Retention SMTP ${outcome}: ${category}`);
    this.name = "RetentionDeliveryError";
  }
}

const RETENTION_SMTP_TIMEOUTS = { connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000 };

async function deliverRetentionMail(mail: SendMailOptions): Promise<NewsletterTransportResult> {
  if (transportOverride) return transportOverride(mail);
  const transporter = createSmtpTransport(RETENTION_SMTP_TIMEOUTS);
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      transporter.sendMail(mail) as Promise<NewsletterTransportResult>,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          transporter.close();
          reject(new RetentionDeliveryError("unknown", "submission_deadline"));
        }, 20_000);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
    transporter.close();
  }
}

/** Authenticates the existing SMTP connection; does not submit any message. */
export async function verifyRetentionEmailTransport(): Promise<{ verified: boolean; category: string | null }> {
  const transporter = createSmtpTransport(RETENTION_SMTP_TIMEOUTS);
  try { return { verified: await transporter.verify(), category: null }; }
  catch (error) { return { verified: false, category: classifySmtpError(error).errorCategory }; }
  finally { transporter.close(); }
}

export async function sendRetention30dEmail(input: {
  to: string;
  sendId: number;
}): Promise<{ sent: boolean; simulated: boolean }> {
  if (isRetentionTestMode()) {
    return { sent: false, simulated: true };
  }

  const from = getMarketingFromEmail();
  if (!from) throw new Error("MARKETING_FROM_EMAIL missing");
  if (!getMarketingPostalAddress()) {
    throw new Error("MARKETING_POSTAL_ADDRESS missing");
  }

  const built = buildRetention30dEmail({ email: input.to });
  const domain = from.split("@")[1]?.replace(/[^A-Za-z0-9.-]/g, "") || "psllabs.org";
  const messageKey = crypto.createHash("sha256").update(`post_purchase_30d_v1:${input.sendId}`).digest("hex").slice(0, 24);
  const mail: SendMailOptions = {
    from: `PSL Labs <${from}>`,
    to: input.to,
    replyTo: SUPPORT_EMAIL,
    subject: built.subject,
    text: built.text,
    html: built.html,
    messageId: `<retention.${messageKey}@${domain}>`,
    headers: {
      "List-Unsubscribe": `<${built.listUnsubscribeUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
  try {
    const result = await deliverRetentionMail(mail);
    const addresses = (list: NewsletterTransportResult["accepted"]) => (list ?? []).map((address) => (typeof address === "string" ? address : address.address).toLowerCase());
    const recipient = input.to.trim().toLowerCase();
    if (addresses(result.rejected).includes(recipient)) throw new RetentionDeliveryError("rejected", "rejected_recipient");
    if (!addresses(result.accepted).includes(recipient)) throw new RetentionDeliveryError("unknown", "no_acceptance_reported");
    // SMTP acceptance confirms submission to the mail server, not inbox delivery.
    return { sent: true, simulated: false };
  } catch (error) {
    if (error instanceof RetentionDeliveryError) throw error;
    const classified = classifySmtpError(error);
    const outcome = classified.status === "failed" || classified.status === "rejected" ? classified.status : "unknown";
    throw new RetentionDeliveryError(outcome, classified.errorCategory ?? "unknown");
  }
}
