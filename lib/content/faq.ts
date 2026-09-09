import type { ContentPageMeta, FaqCategory } from "./types";
import { FLAT_SHIPPING_USD, FREE_SHIPPING_THRESHOLD } from "@/lib/cart/constants";
import { TESTING_SCOPE_STATEMENT } from "./testing-scope";

export const faqPageMeta: ContentPageMeta = {
  label: "FAQ",
  title: "Common questions.",
  description:
    "Answers about orders, testing, shipping, and research-use policies.",
  intro: [
    "Straight answers about orders, testing, shipping, and research-use policies. If you don't see your question, email support@psllabs.org.",
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
          "We sell synthetic peptides and related research materials for laboratory use. Active products include lot-specific lab reports when published. See the product catalog for current listings.",
      },
      {
        question: "Are ingredient amounts fully disclosed?",
        answer:
          "Yes. Product pages list the labeled amount. When a lab report is published for your lot, check that report for the measured results on the tested sample.",
      },
      {
        question: "Where can I find batch documentation?",
        answer:
          "When a lab report is published for your lot, it appears on the product page, in COA Lookup, and on the Testing page. Match the lot number on your label to the report.",
      },
      {
        question: "Can I request additional documentation?",
        answer:
          "Email support@psllabs.org with your lot number if you need help finding published documentation.",
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
          "Email support@psllabs.org with your order number and clear photos. We review transit damage, wrong items, and documentation mismatches case by case. See the Returns page for details.",
      },
    ],
  },
  {
    id: "testing",
    title: "Testing & Quality",
    items: [
      {
        question: "How do you test each batch?",
        answer: `Published testing is done by an independent third-party lab. ${TESTING_SCOPE_STATEMENT} See the Testing page and COA Lookup for published reports.`,
      },
      {
        question: "Where can I find the COA for my batch?",
        answer:
          "When a lab report is published for your lot, it appears on the product page, in COA Lookup, and on the Testing page. Match the lot number on your vial to the report.",
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
          "We ship to physical addresses in all 50 U.S. states. We do not ship internationally at this time.",
      },
      {
        question: "How long does shipping take?",
        answer: `Orders usually pack and ship within 1 to 2 business days after payment clears. Carrier delivery often takes about 3 to 5 business days after that. Standard shipping is $${FLAT_SHIPPING_USD.toFixed(2)}; orders of $${FREE_SHIPPING_THRESHOLD} or more get free standard shipping.`,
      },
      {
        question: "What is your return policy?",
        answer:
          "Order issues are reviewed case by case when you send your order number and photos. Change-of-mind returns are not accepted. See the Returns page for eligibility and steps.",
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
          "No. Everything we sell is for laboratory research only. It is not for human consumption, medical use, or therapeutic application.",
      },
      {
        question: "Are these FDA approved?",
        answer:
          "No. These materials are not FDA-approved drugs, dietary supplements, or medical devices. Product information and testing summaries are for research documentation only.",
      },
    ],
  },
];
