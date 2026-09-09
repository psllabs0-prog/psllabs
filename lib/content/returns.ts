import { PUBLIC_CLAIM_WINDOW_NOTICE } from "./testing-scope";

export const returnsPageMeta = {
  title: "Returns & Refunds",
  description:
    "How to report damaged, incorrect, or documentation issues with PSL Labs orders.",
};

export const returnsPageContent = {
  eyebrow: "Order issues",
  title: "Returns & Refunds",
  subtitle:
    "If something arrives damaged, wrong, or does not match the batch documentation, email us with your order number and clear photos so we can review it.",
  badge: "Reviewed case by case",
  claimWindow: {
    title: "When to report a problem",
    body: PUBLIC_CLAIM_WINDOW_NOTICE,
  },
  protectionPolicy: {
    title: "How we handle damage and order issues",
    body: "We review each case individually. If an item arrives damaged in transit, incorrect, or does not match the batch documentation, contact support with photos and your order number. If approved, we may offer a one-time replacement or another resolution.",
  },
  steps: [
    {
      step: 1,
      title: "Take photos",
      body: "Photograph the product, packaging, label, and any damage or mismatch as soon as the order arrives.",
    },
    {
      step: 2,
      title: "Email support",
      body: "Send your order number, photos, and a short description to support@psllabs.org.",
    },
    {
      step: 3,
      title: "We review and reply",
      body: "We review the claim and tell you the next steps. Approved claims may get a replacement or another resolution.",
    },
  ],
  eligible: [
    "Transit damage with clear photo evidence",
    "Wrong item received",
    "Missing item from the order",
    "Product does not match documentation",
    "Verified batch documentation issue",
  ],
  notEligible: [
    "Claims without photos",
    "No proof of purchase",
    "Items altered, opened, mishandled, or stored poorly after delivery",
    "Change-of-mind returns",
    "Claims made long after delivery without timely notice or evidence",
    "Suspicious, excessive, or unverifiable claims",
  ],
  timeline: [
    {
      label: "You report the issue",
      body: "Email support@psllabs.org with photos and your order number.",
    },
    {
      label: "We review",
      body: "Most claims are reviewed within 1 to 3 business days.",
    },
    {
      label: "Resolution",
      body: "If approved, we explain the next steps for replacement or another option.",
    },
  ],
  disclaimer:
    "Claims are reviewed case by case and may be denied if evidence is incomplete, unverifiable, or inconsistent with this policy. PSL Labs may deny excessive, suspicious, or unsupported claims. This policy does not override applicable laws, carrier rules, or product-specific limits.",
  cta: {
    title: "Need help with an order?",
    buttonLabel: "Contact Support",
    buttonHref: "/contact",
    note: "Include your order number and clear photos when you write.",
  },
} as const;
