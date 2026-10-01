import crypto from "crypto";

import { LEGAL_ENTITY_NAME } from "@/lib/content/testing-scope";
import { emailPageWrapper, escapeHtml, EMAIL_COLORS, SUPPORT_EMAIL } from "@/lib/email/shared";

import type { NewsletterSendKind } from "./schema";

export const NEWSLETTER_UTM_CAMPAIGN = "newsletter_welcome_v1";

export const NEWSLETTER_UTM_CONTENT = {
  welcome_1: "welcome_1_guide",
  welcome_2: "welcome_2_reports",
  welcome_3: "welcome_3_information",
} as const;

export const NEWSLETTER_TEMPLATE_VERSIONS: Record<NewsletterSendKind, string> = {
  confirmation: "confirmation-v1",
  welcome_1: "welcome-1-v1",
  welcome_2: "welcome-2-v1",
  welcome_3: "welcome-3-v1",
};

/** Pilot timing after confirmation; later steps go out on the next eligible daily run. */
export const NEWSLETTER_STEP_DELAY_HOURS = { welcome_1: 0, welcome_2: 48, welcome_3: 120 } as const;

export const NEWSLETTER_PLACEMENTS = ["home_newsletter"] as const;
export type NewsletterPlacement = (typeof NEWSLETTER_PLACEMENTS)[number];

export { NEWSLETTER_SIGNUP_COPY, NEWSLETTER_SIGNUP_VERSIONS } from "./copy";

export const NEWSLETTER_GUIDE_PATH = "/science/how-to-read-a-coa";

/** Exact wording the subscriber confirms (in the confirmation email). */
export const NEWSLETTER_CONSENT_TEXT =
  "You requested PSL’s report-reading guide, two short follow-ups, and occasional documentation and availability updates.";

export const NEWSLETTER_CONSENT_TEXT_HASH = crypto
  .createHash("sha256")
  .update(`${NEWSLETTER_TEMPLATE_VERSIONS.confirmation}\n${NEWSLETTER_CONSENT_TEXT}`, "utf8")
  .digest("hex");

export const NEWSLETTER_PUBLIC_MESSAGES = {
  requested:
    "Thanks. If this address can be subscribed, a confirmation link is on its way. You are not subscribed until you confirm.",
  uncertain:
    "We could not confirm that the confirmation email was sent. If nothing arrives within 15 minutes, please try again later.",
  sendFailed: "We could not send the confirmation email right now. Please try again later.",
  rateLimited: "Too many requests. Please try again later.",
  unavailable: "Signup is temporarily unavailable. Please try again later.",
  invalid: "Enter a valid email address.",
} as const;

function base(siteUrl: string): string {
  return siteUrl.replace(/\/$/, "");
}

export function newsletterCampaignUrl(siteUrl: string, path: string, content: string): string {
  const u = new URL(path, base(siteUrl));
  u.searchParams.set("utm_source", "email");
  u.searchParams.set("utm_medium", "email");
  u.searchParams.set("utm_campaign", NEWSLETTER_UTM_CAMPAIGN);
  u.searchParams.set("utm_content", content);
  return u.toString();
}

/** Token in the fragment: never sent to the server, analytics, or referrers. */
export function newsletterConfirmUrl(siteUrl: string, token: string): string {
  return `${base(siteUrl)}/newsletter/confirm#t=${encodeURIComponent(token)}`;
}

export function newsletterHumanUnsubscribeUrl(siteUrl: string, token: string): string {
  return `${base(siteUrl)}/unsubscribe?token=${encodeURIComponent(token)}`;
}

export function newsletterListUnsubscribeUrl(siteUrl: string, token: string): string {
  return `${base(siteUrl)}/api/marketing/unsubscribe?token=${encodeURIComponent(token)}`;
}

export type BuiltNewsletterEmail = {
  kind: NewsletterSendKind;
  templateVersion: string;
  subject: string;
  text: string;
  html: string;
  links: Array<{ label: string; url: string }>;
  listUnsubscribeUrl: string | null;
};

type Link = { label: string; url: string };
type Paragraph =
  | string
  | { cta: string; url: string }
  | { text: string; link: Link }
  | { list: Link[] };

const { muted, accent } = EMAIL_COLORS;

const htmlText = (s: string) => escapeHtml(s).replace(/\n/g, "<br/>");
const anchor = (l: Link) => `<a href="${escapeHtml(l.url)}" style="color:${accent};">${escapeHtml(l.label)}</a>`;

function renderHtml(paragraphs: Paragraph[], footerHtml: string): string {
  const body = paragraphs
    .map((p) => {
      if (typeof p === "string") return `<p style="margin:0 0 12px;">${htmlText(p)}</p>`;
      if ("cta" in p) {
        return `<p style="margin:4px 0 20px;"><a href="${escapeHtml(p.url)}" style="display:inline-block;background:${accent};color:#0B0C0E;text-decoration:none;padding:10px 16px;border-radius:4px;font-weight:600;">${escapeHtml(p.cta)}</a></p>`;
      }
      if ("list" in p) {
        return `<ul style="margin:0 0 12px;padding-left:18px;">${p.list.map((l) => `<li>${anchor(l)}</li>`).join("")}</ul>`;
      }
      const i = p.text.indexOf(p.link.label);
      const inner =
        i < 0
          ? `${htmlText(p.text)} ${anchor(p.link)}`
          : `${htmlText(p.text.slice(0, i))}${anchor(p.link)}${htmlText(p.text.slice(i + p.link.label.length))}`;
      return `<p style="margin:0 0 12px;">${inner}</p>`;
    })
    .join("");
  return emailPageWrapper(`${body}${footerHtml}`);
}

function renderText(paragraphs: Paragraph[], footerText: string[]): string {
  const lines: string[] = [];
  for (const p of paragraphs) {
    if (typeof p === "string") lines.push(p);
    else if ("cta" in p) lines.push(`${p.cta}: ${p.url}`);
    else if ("list" in p) lines.push(p.list.map((l) => `${l.label}: ${l.url}`).join("\n"));
    else lines.push(`${p.text}\n${p.link.label[0].toUpperCase()}${p.link.label.slice(1)}: ${p.link.url}`);
    lines.push("");
  }
  return [...lines, ...footerText].join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
}

function signature(): Paragraph[] {
  return ["Thanks,\nPSL Labs"];
}

export function buildNewsletterConfirmationEmail(input: {
  siteUrl: string;
  token: string;
  postalAddress: string;
}): BuiltNewsletterEmail {
  const confirmUrl = newsletterConfirmUrl(input.siteUrl, input.token);
  const paragraphs: Paragraph[] = [
    "Hi,",
    NEWSLETTER_CONSENT_TEXT,
    "Confirm your email to subscribe:",
    { cta: "Confirm my email", url: confirmUrl },
    "If you did not request this, you can ignore this message. The welcome emails will not start unless you confirm.",
    "PSL Labs",
  ];
  const footerText = [LEGAL_ENTITY_NAME, input.postalAddress];
  const footerHtml = `<p style="margin:24px 0 0;font-size:12px;color:${muted};">${escapeHtml(LEGAL_ENTITY_NAME)}<br/>${escapeHtml(input.postalAddress)}</p>`;
  return {
    kind: "confirmation",
    templateVersion: NEWSLETTER_TEMPLATE_VERSIONS.confirmation,
    subject: "Confirm your PSL Labs updates",
    text: renderText(paragraphs, footerText),
    html: renderHtml(paragraphs, footerHtml),
    links: [{ label: "Confirm my email", url: confirmUrl }],
    listUnsubscribeUrl: null,
  };
}

function welcomeContent(kind: Exclude<NewsletterSendKind, "confirmation">, siteUrl: string): {
  subject: string;
  paragraphs: Paragraph[];
  links: Array<{ label: string; url: string }>;
} {
  const link = (path: string) => newsletterCampaignUrl(siteUrl, path, NEWSLETTER_UTM_CONTENT[kind]);
  if (kind === "welcome_1") {
    const guide = link(NEWSLETTER_GUIDE_PATH);
    return {
      subject: "Your PSL report-reading guide",
      paragraphs: [
        "Hi,",
        "Thanks for confirming your email.",
        "Our guide walks through locating a lot identifier, opening the original laboratory report, and reading the fields actually shown.",
        { cta: "Read the guide", url: guide },
        "We’ll send two short follow-ups over the next few days. After that, you can expect occasional documentation and availability updates.",
        ...signature(),
      ],
      links: [{ label: "Read the guide", url: guide }],
    };
  }
  if (kind === "welcome_2") {
    const reports = link("/coa");
    const contact = link("/contact");
    return {
      subject: "Finding the report that matches your label",
      paragraphs: [
        "Hi,",
        "When checking documentation, start with the lot or batch identifier on the label. Open the corresponding original report rather than substituting one for a different lot.",
        { cta: "Open Batch Reports", url: reports },
        {
          text: "If the connection is unclear or a report is missing, our contact form is the place to ask PSL to check.",
          link: { label: "contact form", url: contact },
        },
        ...signature(),
      ],
      links: [
        { label: "Open Batch Reports", url: reports },
        { label: "Contact form", url: contact },
      ],
    };
  }
  const products = link("/products");
  const shipping = link("/shipping");
  const faq = link("/faq");
  const contact = link("/contact");
  return {
    subject: "Where to find PSL product and order information",
    paragraphs: [
      "Hi,",
      "For product details and current availability, visit the PSL catalog.",
      { cta: "View product information", url: products },
      "You can also find our shipping information, FAQs, and contact page on the site when you have a question before ordering.",
      {
        list: [
          { label: "Shipping information", url: shipping },
          { label: "FAQs", url: faq },
          { label: "Contact", url: contact },
        ],
      },
      ...signature(),
    ],
    links: [
      { label: "View product information", url: products },
      { label: "Shipping information", url: shipping },
      { label: "FAQs", url: faq },
      { label: "Contact", url: contact },
    ],
  };
}

export function buildNewsletterWelcomeEmail(input: {
  kind: Exclude<NewsletterSendKind, "confirmation">;
  siteUrl: string;
  unsubscribeToken: string;
  postalAddress: string;
}): BuiltNewsletterEmail {
  const { subject, paragraphs, links } = welcomeContent(input.kind, input.siteUrl);
  const humanUrl = newsletterHumanUnsubscribeUrl(input.siteUrl, input.unsubscribeToken);
  const listUrl = newsletterListUnsubscribeUrl(input.siteUrl, input.unsubscribeToken);
  const why = "You are receiving this because you confirmed your email for PSL Labs updates.";
  const ruo = "All products are for laboratory research use only. Not for human or animal consumption.";
  const footerText = [why, ruo, "", LEGAL_ENTITY_NAME, input.postalAddress, `Support: ${SUPPORT_EMAIL}`, "", `Unsubscribe: ${humanUrl}`];
  const footerHtml = [
    `<p style="margin:24px 0 8px;font-size:12px;color:${muted};">${escapeHtml(why)}</p>`,
    `<p style="margin:0 0 8px;font-size:12px;color:${muted};">${escapeHtml(ruo)}</p>`,
    `<p style="margin:12px 0 0;font-size:12px;color:${muted};">${escapeHtml(LEGAL_ENTITY_NAME)}<br/>${escapeHtml(input.postalAddress)}<br/>Support: ${escapeHtml(SUPPORT_EMAIL)}</p>`,
    `<p style="margin:12px 0 0;font-size:12px;"><a href="${escapeHtml(humanUrl)}" style="color:${muted};">Unsubscribe</a></p>`,
  ].join("");
  const html = renderHtml(paragraphs, footerHtml);
  return {
    kind: input.kind,
    templateVersion: NEWSLETTER_TEMPLATE_VERSIONS[input.kind],
    subject,
    text: renderText(paragraphs, footerText),
    html,
    links: [...links, { label: "Unsubscribe", url: humanUrl }],
    listUnsubscribeUrl: listUrl,
  };
}

/** Template fingerprint so the admin page can show exactly which copy is live. */
export function newsletterTemplateHash(kind: NewsletterSendKind): string {
  const sample =
    kind === "confirmation"
      ? buildNewsletterConfirmationEmail({ siteUrl: "https://example.invalid", token: "nc1_PREVIEW", postalAddress: "ADDRESS" })
      : buildNewsletterWelcomeEmail({ kind, siteUrl: "https://example.invalid", unsubscribeToken: "nu1_PREVIEW", postalAddress: "ADDRESS" });
  return crypto.createHash("sha256").update(`${sample.subject}\n${sample.text}`, "utf8").digest("hex").slice(0, 16);
}
