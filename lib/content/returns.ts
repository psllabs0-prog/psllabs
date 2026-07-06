import type { ContentPageMeta, ContentSection } from "./types";

export const returnsPageMeta: ContentPageMeta = {
  label: "RETURNS",
  title: "Returns & Guarantee",
  description: "Our 60-day guarantee, return policy, and how to request a refund.",
  intro: [
    "We want you to have time to evaluate the protocol. First orders include a 60-day guarantee on your first bottle of each product.",
  ],
};

export const returnsSections: ContentSection[] = [
  {
    id: "guarantee",
    title: "60-day guarantee (first order)",
    paragraphs: [
      "If your first bottle of any PSL product isn't right for you, contact us within 60 days of delivery for a full refund of that product—no lengthy questionnaires.",
      "The guarantee applies once per product per customer (first order only).",
    ],
  },
  {
    id: "standard",
    title: "Standard returns",
    paragraphs: [
      "Unopened products in original packaging may be returned within 30 days of delivery for a refund minus shipping costs. Opened products are not eligible for standard returns unless covered by the 60-day guarantee.",
    ],
  },
  {
    id: "process",
    title: "How to start a return",
    paragraphs: [
      "Email support@psllabs.org with your order number and reason. We will provide return instructions if applicable. Refunds are processed to your original payment method within 5–10 business days of receiving the return or approving a guarantee claim.",
    ],
  },
  {
    id: "exclusions",
    title: "Exclusions",
    paragraphs: [
      "We cannot accept returns of products purchased through unauthorized resellers. Damaged products should be reported within 14 days of delivery with photos.",
    ],
  },
];
