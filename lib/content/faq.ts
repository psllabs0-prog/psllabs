import type { ContentPageMeta, FaqCategory } from "./types";

export const faqPageMeta: ContentPageMeta = {
  label: "FAQ",
  title: "Common questions.",
  description:
    "Answers about the PSL stack, orders, testing, and shipping.",
  intro: [
    "Straight answers—no proprietary blends, no hand-waving. If you don't see your question here, reach out at support@psllabs.org.",
  ],
};

export const faqCategories: FaqCategory[] = [
  {
    id: "stack",
    title: "The Stack",
    items: [
      {
        question: "What is the PSL stack?",
        answer:
          "Three products designed to work together: Foundation (daily base layer), Cellular Energy (NAD+ support, morning), and Recovery (mitochondrial function, evening). Each discloses every dose. You can start with Foundation alone and add the others when ready.",
      },
      {
        question: "Can I take only one product?",
        answer:
          "Yes. Foundation is designed to stand alone. Cellular Energy and Recovery address specific mechanisms and are most useful as part of the full protocol—but there is no requirement to buy all three.",
      },
      {
        question: "How long before I notice anything?",
        answer:
          "We don't make outcome promises—that's intentional. Longevity compounds work on cellular timescales. Most users evaluate over 8–12 weeks of consistent daily use, not days.",
      },
      {
        question: "Are these proprietary blends?",
        answer:
          "No. Every ingredient and dose is on the label, this site, and every Certificate of Analysis. We do not use proprietary blends.",
      },
    ],
  },
  {
    id: "orders",
    title: "Orders",
    items: [
      {
        question: "Do you offer a guarantee?",
        answer:
          "Every first order includes a 60-day guarantee. If the product isn't right for you, contact us within 60 days of delivery for a refund on your first bottle of each SKU.",
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
          "Unopened products may be returned within 30 days of delivery. First-time customers also have our 60-day guarantee on their first bottle of each product. See our Returns page for full details.",
      },
    ],
  },
  {
    id: "safety",
    title: "Safety & Medical",
    items: [
      {
        question: "Should I talk to my doctor before taking these?",
        answer:
          "If you take prescription medications, are pregnant or nursing, or have a medical condition, consult your physician before starting any supplement protocol.",
      },
      {
        question: "Are these FDA approved?",
        answer:
          "Dietary supplements are not approved by the FDA in the same way drugs are. Our products are manufactured in cGMP-certified facilities and tested by third-party laboratories. Structure/function claims include the required FDA disclaimer on every product page.",
      },
    ],
  },
];
