import { LEGAL_ENTITY_NAME } from "@/lib/content/testing-scope";
import {
  createSmtpTransport,
  emailPageWrapper,
  escapeHtml,
  EMAIL_COLORS,
  SUPPORT_EMAIL,
} from "@/lib/email/shared";
import { SITE_URL } from "@/lib/seo";

import {
  createUnsubscribeToken,
  getMarketingFromEmail,
  getMarketingPostalAddress,
  humanUnsubscribeUrl,
  isRetentionTestMode,
  listUnsubscribeApiUrl,
  RETENTION_SUBJECT,
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
  const unsubToken = createUnsubscribeToken(input.email);
  const humanUrl = humanUnsubscribeUrl(site, unsubToken);
  const listUrl = listUnsubscribeApiUrl(site, unsubToken);
  const postal = getMarketingPostalAddress() ?? "[postal address not configured]";
  const { muted, accent } = EMAIL_COLORS;

  const subject = RETENTION_SUBJECT;

  const text = [
    "Hello,",
    "",
    "If you have another laboratory research need in the future, current PSL Labs product availability and batch documentation are on the site.",
    "",
    "You can review:",
    "- Current product availability",
    "- Batch documentation / reports for listed lots",
    "- Analytical guides on identity, purity, and COA reading",
    "",
    `View Products & Batch Reports: ${ctaUrl}`,
    "",
    "All products are for laboratory research use only. Not for human or animal consumption.",
    "",
    "No discount code is included. This message is informational.",
    "",
    `${LEGAL_ENTITY_NAME}`,
    postal,
    `Support: ${SUPPORT_EMAIL}`,
    "",
    `Unsubscribe: ${humanUrl}`,
  ].join("\n");

  const html = emailPageWrapper(`
    <p style="margin:0 0 12px;">Hello,</p>
    <p style="margin:0 0 12px;">If you have another laboratory research need in the future, current PSL Labs product availability and batch documentation are on the site.</p>
    <p style="margin:0 0 8px;color:${muted};">You can review:</p>
    <ul style="margin:0 0 16px;padding-left:18px;">
      <li>Current product availability</li>
      <li>Batch documentation / reports for listed lots</li>
      <li>Analytical guides on identity, purity, and COA reading</li>
    </ul>
    <p style="margin:0 0 20px;">
      <a href="${escapeHtml(ctaUrl)}" style="display:inline-block;background:${accent};color:#0B0C0E;text-decoration:none;padding:10px 16px;border-radius:4px;font-weight:600;">View Products &amp; Batch Reports</a>
    </p>
    <p style="margin:0 0 12px;font-size:13px;color:${muted};">All products are for laboratory research use only. Not for human or animal consumption.</p>
    <p style="margin:0 0 12px;font-size:13px;color:${muted};">No discount code is included. This message is informational.</p>
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

export async function sendRetention30dEmail(input: {
  to: string;
}): Promise<{ sent: boolean }> {
  if (isRetentionTestMode()) {
    console.log("[retention] TEST MODE skip send");
    return { sent: true };
  }

  const from = getMarketingFromEmail();
  if (!from) throw new Error("MARKETING_FROM_EMAIL missing");
  if (!getMarketingPostalAddress()) {
    throw new Error("MARKETING_POSTAL_ADDRESS missing");
  }

  const built = buildRetention30dEmail({ email: input.to });
  const transporter = createSmtpTransport();
  await transporter.sendMail({
    from: `PSL Labs <${from}>`,
    to: input.to,
    replyTo: SUPPORT_EMAIL,
    subject: built.subject,
    text: built.text,
    html: built.html,
    headers: {
      "List-Unsubscribe": `<${built.listUnsubscribeUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });
  return { sent: true };
}
