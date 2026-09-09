import { FLAT_SHIPPING_USD, FREE_SHIPPING_THRESHOLD } from "@/lib/cart/constants";
import { TESTING_SCOPE_STATEMENT } from "./testing-scope";

export type SiteFaqItem = {
  id: string;
  category: "identity" | "testing" | "compliance" | "orders" | "payments";
  question: string;
  answer: string;
};

export const siteFaqItems: SiteFaqItem[] = [
  {
    id: "identity",
    category: "identity",
    question: "What is PSL Labs and what does the company provide?",
    answer:
      "PSL Labs (operated by PSL Group LLC in Phoenix, AZ) supplies synthetic peptides and related research materials for laboratory use. Our catalog focuses on clear third-party lab documentation and lot-level data you can check yourself.",
  },
  {
    id: "research-use-only",
    category: "compliance",
    question: "Are PSL Labs products intended for human or animal consumption?",
    answer:
      "No. Everything we sell is for laboratory research and analytical work only. It is not for human or animal consumption, and it is not intended to diagnose, treat, cure, or prevent any disease.",
  },
  {
    id: "no-medical-guidance",
    category: "compliance",
    question: "Can PSL Labs provide guidance on dosing, administration, injection, or human reconstitution?",
    answer:
      "No. We do not give advice on dosing, administration, injection, therapeutic use, or human reconstitution. Our support covers orders, shipping, and batch documentation only. Materials must be handled by qualified researchers in a lab setting.",
  },
  {
    id: "third-party-testing",
    category: "testing",
    question: "Who conducts the analytical testing on your products?",
    answer:
      "Published testing is done by Janoshik Analytical, an independent third-party lab. PSL Labs does not run its own HPLC/MS testing for published reports, and we do not rely only on manufacturer certificates.",
  },
  {
    id: "batch-specificity",
    category: "testing",
    question: "Are test results batch-specific?",
    answer:
      "Yes. Each Certificate of Analysis applies to one production lot and the sample the lab tested. We do not reuse old reports for newer lots. When a new lot is released, new testing is completed and published first.",
  },
  {
    id: "independent-verification",
    category: "testing",
    question: "How can I verify a Certificate of Analysis independently?",
    answer:
      "Each published report includes a task number and a link to the lab. You can confirm the original file on the lab's site at verify.janoshik.com so you are not relying on a copy that could have been edited.",
  },
  {
    id: "analytical-limitations",
    category: "testing",
    question: "What do your third-party test reports establish, and what do they not establish?",
    answer:
      `Published reports cover chemical identity, HPLC purity percentage, and measured net mass for the tested vial. Unless a separate assay is documented, they do not cover sterility, endotoxin status, human safety, or biological efficacy. ${TESTING_SCOPE_STATEMENT}`,
  },
  {
    id: "payments",
    category: "payments",
    question: "What payment methods do you accept?",
    answer:
      "We accept major credit and debit cards (Visa, Mastercard, American Express, and Discover) through Tagada Pay, and Bitcoin through BTCPay Server. Bitcoin payments get a 5% discount on the product subtotal at checkout.",
  },
  {
    id: "shipping",
    category: "orders",
    question: "Where do you ship, what does it cost, and what are delivery times?",
    answer:
      `We ship to physical addresses in all 50 U.S. states from Phoenix, AZ. Standard shipping is $${FLAT_SHIPPING_USD.toFixed(2)}. Orders of $${FREE_SHIPPING_THRESHOLD} or more get free standard shipping. We pack and ship within 1 to 2 business days after payment clears. Carrier delivery usually takes about 3 to 5 business days after that.`,
  },
  {
    id: "order-tracking",
    category: "orders",
    question: "How do I track my order?",
    answer:
      "When your label is created, you get a shipping email with the tracking number. You can also check status anytime on our Track Order page (/track) with your email and order number.",
  },
  {
    id: "order-issues",
    category: "orders",
    question: "What should I do if my package arrives damaged, incorrect, or missing items?",
    answer:
      "Take clear photos of the outer box, shipping label, packing materials, and any damaged or wrong items. Email support@psllabs.org with your order number and photos. We review claims under our Returns and Refunds Policy (/returns).",
  },
  {
    id: "support",
    category: "identity",
    question: "How do I contact PSL Labs for support or technical documentation inquiries?",
    answer:
      "Email support@psllabs.org or use the Contact page (/contact) for questions about batch docs, COA verification, orders, or product specs. We respond on standard business days.",
  },
];
