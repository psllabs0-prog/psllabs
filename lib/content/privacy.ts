import type { ContentPageMeta, ContentSection } from "./types";
import { LEGAL_ENTITY_NAME, PRIVACY_LAST_UPDATED } from "./testing-scope";

export const privacyPageMeta: ContentPageMeta = {
  label: "LEGAL",
  title: "Privacy Policy",
  description: "How PSL Labs collects, uses, and protects your personal information.",
  intro: [`Last updated: ${PRIVACY_LAST_UPDATED}.`],
};

export const privacySections: ContentSection[] = [
  {
    id: "collect",
    title: "Information we collect",
    paragraphs: [
      "When you place an order or contact us, you may give us information such as your name, email address, shipping address, and order details. Payment information is handled by our payment provider. PSL Labs does not store your full card number.",
      "We also collect basic information about how the website is used, such as browser information, pages viewed, and referral information through the analytics tools used on the site.",
    ],
  },
  {
    id: "use",
    title: "How we use your information",
    paragraphs: [
      "We use this information to process orders, send order and shipping updates, answer support requests, prevent fraud, and improve the website.",
    ],
  },
  {
    id: "share",
    title: "Information sharing",
    paragraphs: [
      "We share information only with service providers that help us run the business, such as payment processors, shipping carriers, email providers, and analytics services.",
      "We do not sell your personal information.",
    ],
  },
  {
    id: "cookies",
    title: "Cookies",
    paragraphs: [
      // Verified against codebase: public site analytics use Plausible (cookieless). Admin login uses a session cookie. Checkout payment fields are handled by third-party payment providers.
      "We use a small number of cookies when needed for site function, such as securing an admin sign-in session. Website analytics on psllabs.org use Plausible Analytics, which is set up to work without tracking cookies.",
      "Payment pages may use cookies or similar tools from our payment providers. You can control cookies through your browser settings where your browser allows it.",
    ],
  },
  {
    id: "security",
    title: "Data security",
    paragraphs: [
      "We use reasonable technical and organizational safeguards to protect customer information. No method of sending or storing information online can be guaranteed to be completely secure.",
    ],
  },
  {
    id: "rights",
    title: "Your rights",
    paragraphs: [
      "Depending on where you live, you may have rights to request access to, correction of, or deletion of certain personal information. Contact support@psllabs.org if you want to make a request.",
      "California residents may have additional rights under the CCPA. Contact us if you want to make a request under those rights.",
    ],
  },
  {
    id: "contact",
    title: "Contact",
    paragraphs: [
      "Questions about this Privacy Policy? Email support@psllabs.org.",
    ],
  },
];
