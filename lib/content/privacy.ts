import type { ContentPageMeta, ContentSection } from "./types";

export const privacyPageMeta: ContentPageMeta = {
  label: "LEGAL",
  title: "Privacy Policy",
  description: "How PSL Labs collects, uses, and protects your personal information.",
  intro: ["Last updated: May 2026."],
};

export const privacySections: ContentSection[] = [
  {
    id: "collect",
    title: "Information we collect",
    paragraphs: [
      "We collect information you provide directly: name, email, shipping address, payment details (processed by our payment provider—we do not store full card numbers), and order history.",
      "We automatically collect usage data: IP address, browser type, pages visited, and referring URL via standard analytics tools.",
    ],
  },
  {
    id: "use",
    title: "How we use your information",
    paragraphs: [
      "We use your information to process orders, manage subscriptions, send transactional emails (order confirmations, shipping updates), respond to support requests, and improve our site.",
      "We may send marketing emails if you opt in. You can unsubscribe at any time.",
    ],
  },
  {
    id: "share",
    title: "Information sharing",
    paragraphs: [
      "We share data with service providers who help us operate: payment processors, shipping carriers, email platforms, and analytics providers. They are contractually required to protect your data and use it only for the services they provide to us.",
      "We do not sell your personal information.",
    ],
  },
  {
    id: "cookies",
    title: "Cookies",
    paragraphs: [
      "We use cookies and similar technologies for site functionality, analytics, and marketing (if you consent). You can control cookies through your browser settings.",
    ],
  },
  {
    id: "security",
    title: "Data security",
    paragraphs: [
      "We implement reasonable technical and organizational measures to protect your data. No transmission over the internet is 100% secure.",
    ],
  },
  {
    id: "rights",
    title: "Your rights",
    paragraphs: [
      "Depending on your location, you may have rights to access, correct, delete, or port your personal data. Contact privacy@psllabs.com to exercise these rights. California residents may have additional rights under the CCPA.",
    ],
  },
  {
    id: "contact",
    title: "Contact",
    paragraphs: [
      "Questions about this policy: privacy@psllabs.com.",
    ],
  },
];
