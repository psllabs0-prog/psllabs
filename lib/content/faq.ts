import type { ContentPageMeta, FaqCategory } from "./types";

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
          "PSL Labs publishes research compound profiles with disclosed ingredients, batch-matched Certificates of Analysis, and reference citations. See the product catalog for current listings including Retatrutide and compound reference profiles.",
      },
      {
        question: "Are ingredient amounts fully disclosed?",
        answer:
          "Yes. Every active and dose appears on the label, product page, and batch COA. We do not use proprietary blends or undisclosed complexes.",
      },
      {
        question: "Where can I find batch documentation?",
        answer:
          "COAs are published on each product page and in our Testing section. Match the lot number on your label to the corresponding batch report.",
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
        answer:
          "Every batch is tested by an independent ISO 17025-accredited lab for identity (HPLC), potency, and heavy metals (ICP-MS). We publish full COAs for every lot—see our Testing page for details.",
      },
      {
        question: "Where can I find the COA for my batch?",
        answer:
          "COAs are published on each product page and in our Testing section. Match the lot number on your bottle label to the corresponding COA document.",
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
