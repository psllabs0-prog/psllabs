import type { ContentPageMeta, FaqCategory } from "./types";
import { TESTING_SCOPE_STATEMENT } from "./testing-scope";

export const faqPageMeta: ContentPageMeta = {
  label: "FAQ",
  title: "Common questions.",
  description:
    "Answers about orders, testing, shipping, and research-use policies.",
  intro: [
    "Straight answers about orders, testing, shipping, and research-use policies. If you don't see your question here, reach out at support@psllabs.org.",
  ],
};

export const faqCategories: FaqCategory[] = [
  {
    id: "products",
    title: "Products & Documentation",
    items: [
      {
        question: "What products does PSL Labs offer?",
        answer:
          "PSL Labs publishes research compound profiles with disclosed ingredients and reference citations. Batch-matched laboratory reports are published for selected lots when available. See the product catalog for current listings including Retatrutide.",
      },
      {
        question: "Are ingredient amounts fully disclosed?",
        answer:
          "Yes. Every active and dose appears on the label and product page. When a laboratory report is published for your lot, review that report for batch-specific testing results.",
      },
      {
        question: "Where can I find batch documentation?",
        answer:
          "When a laboratory report is published for your lot, it appears on the product page, in COA / Batch Lookup, and in our Testing section. Match the lot number on your label to the corresponding report.",
      },
      {
        question: "Can I request additional documentation?",
        answer:
          "Contact support@psllabs.org with your lot number for institutional or compliance documentation requests.",
      },
    ],
  },
  {
    id: "orders",
    title: "Orders",
    items: [
      {
        question: "What if my order arrives damaged or incorrect?",
        answer:
          "Order issues such as transit damage, incorrect items, or documentation mismatches are reviewed case-by-case. Email support@psllabs.org with your order number and clear photos. See our Returns page for full details.",
      },
    ],
  },
  {
    id: "testing",
    title: "Testing & Quality",
    items: [
      {
        question: "How do you test each batch?",
        answer: `${TESTING_SCOPE_STATEMENT} See our Testing page and COA / Batch Lookup for published reports.`,
      },
      {
        question: "Where can I find the COA for my batch?",
        answer:
          "When a laboratory report is published for your lot, it appears on the product page, in COA / Batch Lookup, and in our Testing section. Match the lot number on your bottle label to the corresponding report.",
      },
    ],
  },
  {
    id: "shipping-returns",
    title: "Shipping & Returns",
    items: [
      {
        question: "Where do you ship?",
        answer:
          "We currently ship to the United States. International shipping is not available at launch.",
      },
      {
        question: "How long does shipping take?",
        answer:
          "Orders ship within 1–2 business days. Standard delivery is 3–7 business days depending on location. You will receive tracking when your order ships.",
      },
      {
        question: "What is your return policy?",
        answer:
          "Order issues are reviewed case-by-case when reported with order number and photo evidence. Change-of-mind returns are not accepted. See our Returns page for eligibility and instructions.",
      },
    ],
  },
  {
    id: "research-use",
    title: "Research Use",
    items: [
      {
        question: "Are PSL Labs products intended for human use?",
        answer:
          "No. PSL Labs products and materials are sold strictly for laboratory research, analytical, and educational reference purposes. They are not intended for human consumption, medical use, or therapeutic application.",
      },
      {
        question: "Are these FDA approved?",
        answer:
          "PSL Labs materials are not FDA-approved drugs, dietary supplements, or medical devices. Product information and testing summaries are provided for research documentation and reference only.",
      },
    ],
  },
];
