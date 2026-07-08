import { TESTING_SCOPE_STATEMENT } from "./testing-scope";

export type SiteFaqItem = {
  id: string;
  question: string;
  answer: string;
};

export const siteFaqItems: SiteFaqItem[] = [
  {
    id: "research-use",
    question: "Are PSL Labs peptides for human consumption?",
    answer:
      "No. PSL Labs products—including Retatrutide—are sold strictly for laboratory and research use only. They are not intended for human or animal consumption, diagnosis, treatment, cure, or prevention of any disease.",
  },
  {
    id: "retatrutide",
    question: "What is Retatrutide?",
    answer:
      "Retatrutide is a research peptide supplied in lyophilized form for in vitro and laboratory research applications. Batch-specific laboratory documentation is published for selected lots when available.",
  },
  {
    id: "purity",
    question: "How do you verify purity?",
    answer: TESTING_SCOPE_STATEMENT,
  },
  {
    id: "coa",
    question: "Where can I find my Certificate of Analysis?",
    answer:
      "When a laboratory report is published for your lot, it appears on the product page, in COA / Batch Lookup, and in our Testing section. Match the lot number on your vial label to the corresponding report. If your lot is not yet listed, contact support@psllabs.org.",
  },
  {
    id: "storage",
    question: "How should I store research peptides?",
    answer:
      "Store lyophilized peptides refrigerated or frozen per the product documentation. Reconstituted material should be handled according to your laboratory protocol and stored at recommended temperatures. Avoid repeated freeze-thaw cycles.",
  },
  {
    id: "shipping",
    question: "How does shipping work?",
    answer:
      "We ship within the United States. Orders dispatch within 1–2 business days with tracked delivery. Peptides are packed for stability in transit using temperature-aware materials.",
  },
  {
    id: "returns",
    question: "What is your return policy?",
    answer:
      "Order issues such as transit damage, incorrect items, or documentation mismatches are reviewed case-by-case. Email support@psllabs.org with your order number and photos. See our Returns page for full details.",
  },
  {
    id: "payments",
    question: "What payment methods do you accept?",
    answer:
      "Checkout is processed via Bitcoin through BTCPay Server. You will receive order confirmation and tracking once payment is confirmed.",
  },
];
