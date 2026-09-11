import {
  FLAT_SHIPPING_USD,
  FREE_SHIPPING_THRESHOLD,
  SUPPORT_EMAIL,
} from "@/lib/cart/constants";
import { siteFaqItems } from "@/lib/content/site-faq";
import { TESTING_SCOPE_STATEMENT } from "@/lib/content/testing-scope";
import type { SupportCategory } from "./constants";

export type KnowledgeSnippet = {
  id: string;
  categoryHints: SupportCategory[];
  text: string;
};

const HUMAN_USE_BOUNDARY = `PSL Labs products are for laboratory and research use only. They are not for human or animal administration, and we cannot provide dosing, injection, reconstitution for personal use, treatment, or medical guidance.

If you have a question about an order, shipping, or batch documentation, reply with those details and we will help.`;

const YELLOW_ACK = `Thanks for contacting PSL Labs Support. We received your message and a team member will review it shortly. We will follow up with next steps — please do not assume a refund or replacement has been approved yet.`;

const RED_RECEIPT = `Thanks for contacting PSL Labs Support. We received your message and it has been routed for review. We will respond after a human review.`;

export function getHumanUseBoundaryText(): string {
  return HUMAN_USE_BOUNDARY;
}

export function getYellowAckText(): string {
  return YELLOW_ACK;
}

export function getRedReceiptText(): string {
  return RED_RECEIPT;
}

export function getApprovedKnowledgeLibrary(): KnowledgeSnippet[] {
  const faqSnippets: KnowledgeSnippet[] = siteFaqItems.map((item) => ({
    id: `faq:${item.id}`,
    categoryHints: mapFaqToCategories(item.id),
    text: `${item.question}\n${item.answer}`,
  }));

  return [
    ...faqSnippets,
    {
      id: "policy:coa",
      categoryHints: ["coa_location", "batch_verification"],
      text: `Certificates of Analysis are published on our site at /coa and on product pages. Reports are produced by Janoshik Analytical. Verify originals at verify.janoshik.com using the task number on the report. ${TESTING_SCOPE_STATEMENT}`,
    },
    {
      id: "policy:shipping",
      categoryHints: ["shipping_timing", "shipping_destination", "free_shipping"],
      text: `We ship to physical addresses in all 50 U.S. states from Phoenix, Arizona. Standard shipping is $${FLAT_SHIPPING_USD.toFixed(2)}. Orders of $${FREE_SHIPPING_THRESHOLD} or more include free standard shipping. International shipping is not offered. We pack and ship within 1–2 business days after payment clears; carrier transit is typically about 3–5 business days.`,
    },
    {
      id: "policy:returns",
      categoryHints: ["returns_replacement", "damaged_order", "wrong_item", "missing_item"],
      text: `Damaged, wrong, or missing items are reviewed case-by-case. Email ${SUPPORT_EMAIL} with your order number and clear photos. We do not auto-approve refunds or replacements from this mailbox.`,
    },
    {
      id: "policy:contact",
      categoryHints: ["other"],
      text: `You can reach PSL Labs at ${SUPPORT_EMAIL}. Track orders at /track with your order email and order number.`,
    },
    {
      id: "policy:research-use",
      categoryHints: ["research_use_boundary", "human_use_request"],
      text: HUMAN_USE_BOUNDARY,
    },
  ];
}

function mapFaqToCategories(id: string): SupportCategory[] {
  switch (id) {
    case "research-use-only":
    case "no-medical-guidance":
      return ["research_use_boundary", "human_use_request"];
    case "third-party-testing":
    case "batch-specificity":
    case "independent-verification":
    case "analytical-limitations":
      return ["coa_location", "batch_verification"];
    case "payments":
      return ["card_payment", "bitcoin_payment"];
    case "shipping":
      return ["shipping_timing", "shipping_destination", "free_shipping"];
    case "order-tracking":
      return ["order_status", "tracking_not_updated"];
    case "order-issues":
      return ["damaged_order", "wrong_item", "missing_item", "returns_replacement"];
    case "support":
      return ["other"];
    default:
      return ["other"];
  }
}

export function knowledgeForCategory(category: SupportCategory): KnowledgeSnippet[] {
  return getApprovedKnowledgeLibrary().filter((k) =>
    k.categoryHints.includes(category)
  );
}
