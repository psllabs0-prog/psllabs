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
    question: "What does PSL Labs sell?",
    answer:
      "PSL Labs (operated by PSL Group LLC in Phoenix, AZ) sells synthetic peptides and related materials for laboratory research. The focus is third-party lab docs and lot-level data you can check yourself.",
  },
  {
    id: "research-use-only",
    category: "compliance",
    question: "Are these products for human or animal use?",
    answer:
      "No. Everything we sell is for laboratory research and analytical work only. Not for human or animal consumption, and not intended to diagnose, treat, cure, or prevent any disease.",
  },
  {
    id: "no-medical-guidance",
    category: "compliance",
    question: "Can you advise on dosing, injection, or human reconstitution?",
    answer:
      "No. We do not advise on dosing, administration, injection, therapeutic use, or human reconstitution. Support covers orders, shipping, and batch documentation. Materials belong in a lab with qualified researchers.",
  },
  {
    id: "third-party-testing",
    category: "testing",
    question: "Who tests your products?",
    answer:
      "Published testing is done by Janoshik Analytical, an independent third-party lab. PSL Labs does not run its own HPLC/MS for published reports, and we do not rely only on manufacturer certificates.",
  },
  {
    id: "batch-specificity",
    category: "testing",
    question: "Are test results batch-specific?",
    answer:
      "Yes. Each Certificate of Analysis covers one production lot and the sample the lab tested. We do not reuse old reports for newer lots. New lots get new testing and a published report before release.",
  },
  {
    id: "independent-verification",
    category: "testing",
    question: "How do I verify a COA myself?",
    answer:
      "Each published report includes a task number and a link to the lab. Confirm the original file at verify.janoshik.com so you are not relying on a copy that could have been edited.",
  },
  {
    id: "analytical-limitations",
    category: "testing",
    question: "What do the lab reports cover, and what do they leave out?",
    answer:
      `Published reports usually cover identity (what the lab detected), HPLC purity percentage (how clean the sample looked under that test), and measured amount for the tested vial. Unless another test is listed, they do not cover sterility, endotoxin status, human safety, or biological efficacy. ${TESTING_SCOPE_STATEMENT}`,
  },
  {
    id: "payments",
    category: "payments",
    question: "What payment methods do you accept?",
    answer:
      "Major credit and debit cards (Visa, Mastercard, American Express, Discover) through Tagada Pay, and Bitcoin through BTCPay Server. Bitcoin gets a 5% discount on the product subtotal at checkout.",
  },
  {
    id: "shipping",
    category: "orders",
    question: "Where do you ship, and what does it cost?",
    answer:
      `We ship to physical addresses in all 50 U.S. states from Phoenix, AZ. Standard shipping is $${FLAT_SHIPPING_USD.toFixed(2)}. Orders of $${FREE_SHIPPING_THRESHOLD} or more get free standard shipping. We pack and ship within 1 to 2 business days after payment clears. Carrier delivery usually takes about 3 to 5 business days after that.`,
  },
  {
    id: "order-tracking",
    category: "orders",
    question: "How do I track my order?",
    answer:
      "When your label is created, you get a shipping email with the tracking number. You can also check status anytime on Track Order (/track) with your email and order number.",
  },
  {
    id: "order-issues",
    category: "orders",
    question: "What if my package arrives damaged, wrong, or incomplete?",
    answer:
      "Take clear photos of the outer box, shipping label, packing materials, and any damaged or wrong items. Email support@psllabs.org with your order number and photos. We review claims under Returns & Refunds (/returns).",
  },
  {
    id: "support",
    category: "identity",
    question: "How do I reach support?",
    answer:
      "Email support@psllabs.org or use Contact (/contact) for batch docs, COA checks, orders, or product specs. We reply on standard business days.",
  },
];
