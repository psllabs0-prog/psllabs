import type { ContentPageMeta, ContentSection } from "./types";

export const termsPageMeta: ContentPageMeta = {
  label: "LEGAL",
  title: "Terms of Service",
  description: "Terms governing use of psllabs.com and purchase of PSL Labs products.",
  intro: [
    "Last updated: May 2026. By using this site or purchasing our products, you agree to these terms.",
  ],
};

export const termsSections: ContentSection[] = [
  {
    id: "acceptance",
    title: "Acceptance of terms",
    paragraphs: [
      "These Terms of Service govern your access to psllabs.com and your purchase of products from PSL Labs. If you do not agree, do not use this site or purchase our products.",
    ],
  },
  {
    id: "products",
    title: "Products and supplements",
    paragraphs: [
      "PSL Labs sells dietary supplements. Our products are not intended to diagnose, treat, cure, or prevent any disease. Statements on this site have not been evaluated by the Food and Drug Administration.",
      "You are responsible for consulting a healthcare provider before use, especially if you take medications, are pregnant or nursing, or have a medical condition.",
    ],
  },
  {
    id: "orders",
    title: "Orders and payment",
    paragraphs: [
      "All orders are subject to acceptance and availability. We reserve the right to refuse or cancel orders, including for suspected fraud, pricing errors, or inventory limitations. Prices are listed in USD and subject to change without notice.",
    ],
  },
  {
    id: "subscriptions",
    title: "Subscriptions",
    paragraphs: [
      "Subscription orders renew automatically at the interval selected at checkout. You may pause, skip, or cancel before your next billing date through your account or by contacting support. Cancellation stops future charges; it does not refund prior charges.",
    ],
  },
  {
    id: "intellectual-property",
    title: "Intellectual property",
    paragraphs: [
      "All content on this site—including text, design, logos, and product copy—is owned by PSL Labs and protected by applicable intellectual property laws. You may not reproduce or distribute our content without written permission.",
    ],
  },
  {
    id: "limitation",
    title: "Limitation of liability",
    paragraphs: [
      "To the fullest extent permitted by law, PSL Labs is not liable for indirect, incidental, or consequential damages arising from use of our site or products. Our total liability for any claim is limited to the amount you paid for the product giving rise to the claim.",
    ],
  },
  {
    id: "governing-law",
    title: "Governing law",
    paragraphs: [
      "These terms are governed by the laws of the State of Delaware, without regard to conflict of law principles. Disputes shall be resolved in courts located in Delaware.",
    ],
  },
];
