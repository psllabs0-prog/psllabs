import { LEGAL_ENTITY_NAME } from "@/lib/content/testing-scope";
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
