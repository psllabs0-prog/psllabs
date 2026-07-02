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
      "Retatrutide is a research peptide supplied in lyophilized form for in vitro and laboratory research applications. Full compound documentation and batch-specific testing data are published for each lot we release.",
  },
  {
    id: "purity",
    question: "How do you verify purity?",
    answer:
      "Every batch undergoes HPLC identity and purity testing at independent, ISO 17025-accredited third-party laboratories. Results must meet our release specifications before a lot ships.",
  },
  {
    id: "coa",
    question: "Where can I find my Certificate of Analysis?",
    answer:
      "COAs are published on the product page and in our Testing section. Match the lot number on your vial label to the corresponding batch report. If your lot is not yet listed, contact support@psllabs.org.",
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
      "Unopened products in original condition may be returned within 30 days of delivery. See our Returns page for eligibility and instructions.",
  },
  {
    id: "payments",
    question: "What payment methods do you accept?",
    answer:
      "Checkout is processed via cryptocurrency through our secure payment partner. You will receive order confirmation and tracking once payment is confirmed.",
  },
];
