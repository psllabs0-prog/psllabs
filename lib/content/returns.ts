import { PUBLIC_CLAIM_WINDOW_NOTICE } from "./testing-scope";

export const returnsPageMeta = {
  title: "Returns & Refunds",
  description:
    "How to report damaged, incorrect, or documentation issues with PSL Labs orders.",
};

export const returnsPageContent = {
  eyebrow: "Order Issue Policy",
  title: "Returns & Refunds",
  subtitle:
    "If an order arrives damaged, incorrect, or has a verified documentation issue, contact PSL Labs with your order number and clear photos so the issue can be reviewed.",
  badge: "Reviewed case-by-case",
  claimWindow: {
    title: "Reporting order issues",
    body: PUBLIC_CLAIM_WINDOW_NOTICE,
  },
  protectionPolicy: {
    title: "Damage / Issue Protection Policy",
    body: "PSL Labs reviews order issues on a case-by-case basis. If an item arrives damaged in transit, incorrect, or does not match the available batch documentation, customers should contact support with clear photo evidence and their order number. Approved claims may be eligible for a one-time replacement or another resolution at PSL Labs' discretion.",
  },
  steps: [
    {
      step: 1,
      title: "Document the Issue",
      body: "Take clear photos of the product, packaging, label, and any visible damage or discrepancy as soon as the order arrives.",
    },
    {
      step: 2,
      title: "Contact Support",
      body: "Email support@psllabs.org with your order number, photos, and a short description of the issue.",
    },
    {
      step: 3,
      title: "Review & Resolution",
      body: "PSL Labs will review the claim and respond with next steps. Approved claims may be eligible for a replacement or other resolution.",
    },
  ],
  eligible: [
    "Products damaged during transit with clear photo evidence",
    "Incorrect item received",
    "Missing item from order",
    "Product/documentation mismatch",
    "Verified batch documentation issue",
  ],
  notEligible: [
    "Claims without photo evidence",
    "Products without proof of purchase",
    "Products altered, opened, mishandled, or improperly stored after delivery",
    "Change-of-mind returns",
    "Requests submitted outside the applicable review period once stated in the final policy",
    "Suspicious, excessive, or unverifiable claims",
  ],
  timeline: [
    {
      label: "Issue submitted",
      body: "Customer emails support@psllabs.org with photos and order number.",
    },
    {
      label: "Claim reviewed",
      body: "Most claims are reviewed within 1–3 business days.",
    },
    {
      label: "Resolution provided",
      body: "If approved, PSL Labs will provide the next steps for replacement or another resolution.",
    },
  ],
  disclaimer:
    "All claims are subject to review and may be denied if evidence is incomplete, unverifiable, or inconsistent with the policy. PSL Labs reserves the right to deny excessive, suspicious, or unsupported claims. This policy does not override any applicable laws, carrier policies, or product-specific restrictions.",
  cta: {
    title: "Need help with an order?",
    buttonLabel: "Contact Support",
    buttonHref: "/contact",
    note: "Please include your order number and clear photos when contacting support.",
  },
} as const;
