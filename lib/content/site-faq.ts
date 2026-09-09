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
      "PSL Labs (operated by PSL Group LLC, Phoenix, AZ) is a dedicated research supplier providing high-purity synthetic peptide reference standards and biochemical materials for laboratory research, in vitro experimentation, and analytical reference. Our catalog is built around verifiable third-party documentation and transparent lot data.",
  },
  {
    id: "research-use-only",
    category: "compliance",
    question: "Are PSL Labs products intended for human or animal consumption?",
    answer:
      "No. All products offered by PSL Labs are sold strictly for in vitro laboratory research, analytical testing, and chemical characterization. They are not intended for human or animal consumption, diagnosis, clinical treatment, cure, or disease prevention.",
  },
  {
    id: "no-medical-guidance",
    category: "compliance",
    question: "Can PSL Labs provide guidance on dosing, administration, injection, or human reconstitution?",
    answer:
      "No. In strict compliance with regulatory standards and research-use-only policies, PSL Labs and its support team cannot and will not provide advice, protocols, or calculations regarding human dosage, in vivo administration routes, subcutaneous injection, therapeutic outcomes, or human reconstitution. All compounds must be handled exclusively by qualified researchers in equipped laboratory settings.",
  },
  {
    id: "third-party-testing",
    category: "testing",
    question: "Who conducts the analytical testing on your products?",
    answer:
      "All published analytical testing is conducted by Janoshik Analytical, an independent third-party analytical laboratory specializing in chromatographic peptide analysis. PSL Labs does not test its own compounds in-house or rely solely on manufacturer-provided certificates.",
  },
  {
    id: "batch-specificity",
    category: "testing",
    question: "Are test results batch-specific?",
    answer:
      "Yes. Every Certificate of Analysis (COA) is strictly batch-specific. Testing performed on a designated sample applies exclusively to that specific production lot and sample analyzed by the laboratory. We never use legacy or historical reports to represent new or separate production runs. When a new lot is introduced, independent testing is completed and published before release.",
  },
  {
    id: "independent-verification",
    category: "testing",
    question: "How can I verify a Certificate of Analysis independently?",
    answer:
      "Every third-party laboratory report published by PSL Labs contains a unique task number and an authentic laboratory URL. Researchers can verify the authentic document directly on the laboratory's verification server at verify.janoshik.com to ensure that the document, task number, and reported analytical findings have not been altered.",
  },
  {
    id: "analytical-limitations",
    category: "testing",
    question: "What do your third-party test reports establish—and what do they not establish?",
    answer:
      `Our published reports establish chemical identity, HPLC chromatographic purity percentage, and sample net mass for the tested vial. Unless independently tested by a designated assay, third-party analytical reports do not establish microbiological sterility, bacterial endotoxin/pyrogen status, human safety, pharmacological kinetics, or biological efficacy. ${TESTING_SCOPE_STATEMENT}`,
  },
  {
    id: "payments",
    category: "payments",
    question: "What payment methods do you accept?",
    answer:
      "We accept major credit and debit cards (Visa, Mastercard, American Express, and Discover) processed securely via Tagada Pay, as well as Bitcoin via BTCPay Server. Customers paying with Bitcoin automatically receive a 5% discount on their product subtotal at checkout.",
  },
  {
    id: "shipping",
    category: "orders",
    question: "Where do you ship, what does it cost, and what are delivery times?",
    answer:
      `We ship to physical addresses across all 50 U.S. states from our fulfillment center in Phoenix, AZ. Standard domestic shipping is a flat rate of $${FLAT_SHIPPING_USD.toFixed(2)}, and orders of $${FREE_SHIPPING_THRESHOLD} or more automatically receive free standard shipping. Orders are packed and dispatched within 1–2 business days of payment confirmation, with estimated carrier delivery typically taking 3–5 business days.`,
  },
  {
    id: "order-tracking",
    category: "orders",
    question: "How do I track my order?",
    answer:
      "An automated shipping confirmation email with your carrier tracking number is sent immediately when your label is printed. You can also look up real-time shipping status and tracking history anytime via our self-service Track Order page (/track) using your email and order number.",
  },
  {
    id: "order-issues",
    category: "orders",
    question: "What should I do if my package arrives damaged, incorrect, or missing items?",
    answer:
      "If an order arrives with transit damage, broken vials, or incorrect items, take clear photos of the exterior shipping box, shipping label, internal packaging, and damaged items immediately. Email support@psllabs.org with your order number and photo evidence. Claims are reviewed promptly in accordance with our Returns & Refunds Policy (/returns).",
  },
  {
    id: "support",
    category: "identity",
    question: "How do I contact PSL Labs for support or technical documentation inquiries?",
    answer:
      "For questions regarding batch documentation, COA verification, orders, or product specifications, you can email our support team at support@psllabs.org or submit an inquiry through our Contact page (/contact). Support inquiries are addressed during standard business days.",
  },
];
