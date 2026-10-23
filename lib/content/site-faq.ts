import { FLAT_SHIPPING_USD, FREE_SHIPPING_THRESHOLD } from "@/lib/cart/constants";
import { CARD_CHECKOUT_PAUSED } from "@/lib/checkout/card-availability";
import { TESTING_SCOPE_STATEMENT } from "./testing-scope";
import { ORDER_PROCESSING_NOTICE, PRIORITY_PRICING_NOTICE, STANDARD_TRANSIT_NOTICE } from "./shipping";

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
      "PSL Labs sells synthetic peptides and related materials for laboratory research. PSL Labs is operated by PSL Group LLC in Phoenix, Arizona. We publish third party lab reports and batch information that you can review yourself.",
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
      "PSL Labs does not create the lab reports shown on the site. Our published reports come from Janoshik Analytical, an independent laboratory. We do not rely only on manufacturer certificates.",
  },
  {
    id: "batch-specificity",
    category: "testing",
    question: "Are test results batch-specific?",
    answer:
      "Yes. Each Certificate of Analysis covers one production batch and the sample the lab tested. We do not reuse old reports for newer batches. New batches get new testing and a published report before release.",
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
    question: "What do the lab reports show?",
    answer:
      `For our published peptide batches, the Janoshik report shows three main results: the material identified by the lab, the reported purity, and the amount measured in the tested sample. The original report shows the full test details and results. ${TESTING_SCOPE_STATEMENT}`,
  },
  {
    id: "payments",
    category: "payments",
    question: "What payment methods do you accept?",
    answer: CARD_CHECKOUT_PAUSED
      ? "Right now we accept Bitcoin only, through BTCPay Server. Card payments are temporarily unavailable. Bitcoin gets a 5% discount on the product subtotal at checkout."
      : "Major credit and debit cards (Visa, Mastercard, American Express, Discover) through Tagada Pay, and Bitcoin through BTCPay Server. Bitcoin gets a 5% discount on the product subtotal at checkout.",
  },
  {
    id: "paying-with-bitcoin",
    category: "payments",
    question: "How do I pay with Bitcoin?",
    answer:
      "You need a Bitcoin wallet with enough BTC to cover your order, for example a mobile wallet or an exchange account that can send Bitcoin. At checkout, enter your contact and shipping details and choose Bitcoin. You'll be redirected to our secure BTCPay checkout, which shows the exact amount to send and a payment address with a QR code. Send that exact amount from your wallet before the invoice time limit runs out; your wallet sets the network fee. If the invoice expires before payment, start checkout again for a new invoice. Your order is marked paid once the payment is confirmed.",
  },
  {
    id: "shipping",
    category: "orders",
    question: "Where do you ship, and what does it cost?",
    answer:
      `We ship to physical addresses in all 50 U.S. states from Phoenix, Arizona. Standard shipping is $${FLAT_SHIPPING_USD.toFixed(2)}. A product subtotal of $${FREE_SHIPPING_THRESHOLD} or more before discounts gets free standard shipping. ${PRIORITY_PRICING_NOTICE} ${ORDER_PROCESSING_NOTICE} ${STANDARD_TRANSIT_NOTICE} Carrier estimates are not guaranteed.`,
  },
  {
    id: "order-tracking",
    category: "orders",
    question: "How do I track my order?",
    answer:
      "When tracking is saved to your order, we send a shipping email with the tracking number. Label creation alone does not mean carrier acceptance. You can also check status anytime on Track Order (/track) with your email and order number.",
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
      "Email support@psllabs.org or use Contact (/contact) for batch docs, COA checks, orders, or product details. We reply on standard business days.",
  },
];
