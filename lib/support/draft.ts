import { SUPPORT_EMAIL } from "@/lib/cart/constants";
import { SITE_URL } from "@/lib/seo";

import {
  HIGH_CONFIDENCE_THRESHOLD,
  MIN_AUTO_SEND_CONFIDENCE,
  isSupportAutoSendEnabled,
  type SupportCategory,
} from "./constants";
import { shouldEscalateClassification } from "./classify";
import {
  getHumanUseBoundaryText,
  getRedReceiptText,
  getYellowAckText,
  knowledgeForCategory,
} from "./knowledge";
import {
  formatOrderStatusFacts,
  lookupOrderForSupport,
} from "./order-lookup";
import { lookupSellableAvailabilitySummary } from "./inventory-lookup";
import type { ClassificationResult, DraftResult } from "./types";

function toHtml(text: string): string {
  return text
    .split("\n")
    .map((line) => `<p style="margin:0 0 10px;">${escapeBasic(line) || "&nbsp;"}</p>`)
    .join("");
}

function escapeBasic(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function footer(): string {
  return `\n\n—\nPSL Labs Support\n${SUPPORT_EMAIL}\n${SITE_URL}`;
}

export async function draftSupportResponse(input: {
  classification: ClassificationResult;
  fromEmail: string;
  subject: string;
  body: string;
}): Promise<DraftResult> {
  const c = input.classification;
  const sources: string[] = [];
  let bodyText = "";
  let policyDecision = "";
  let requiresEscalation = shouldEscalateClassification(c);
  let escalationReason: string | null = null;

  if (c.category === "human_use_request") {
    bodyText = getHumanUseBoundaryText() + footer();
    sources.push("policy:research-use");
    policyDecision = "fixed_human_use_boundary";
    requiresEscalation = true;
    escalationReason = "Human-use / medical boundary request";
  } else if (c.riskLevel === "RED") {
    bodyText = getRedReceiptText() + footer();
    policyDecision = "red_neutral_receipt_only";
    requiresEscalation = true;
    escalationReason = `RED:${c.category}`;
  } else if (c.riskLevel === "YELLOW") {
    bodyText = getYellowAckText() + footer();
    const kn = knowledgeForCategory(c.category);
    if (kn[0]) {
      sources.push(kn[0].id);
    }
    policyDecision = "yellow_ack_no_promise";
    requiresEscalation = true;
    escalationReason = `YELLOW:${c.category}`;
  } else {
    // GREEN
    const kn = knowledgeForCategory(c.category);
    for (const k of kn) sources.push(k.id);

    if (c.category === "order_status" || c.category === "tracking_not_updated") {
      const lookup = await lookupOrderForSupport({
        fromEmail: input.fromEmail,
        orderId: c.extractedOrderId,
      });
      sources.push("neon:orders");
      if (lookup.found && lookup.order) {
        bodyText =
          `Here is the verified status from our system:\n\n${formatOrderStatusFacts(lookup.order)}\n\n` +
          `You can also check anytime at ${SITE_URL}/track using the same email and order number.` +
          footer();
        policyDecision = "green_verified_order_facts";
      } else {
        bodyText =
          `We could not verify an order match for the email that contacted us` +
          (c.extractedOrderId ? ` and order ID ${c.extractedOrderId}` : "") +
          `. Please reply with the order email and full order ID (psl_…). We never share another customer's order details.` +
          footer();
        policyDecision = "green_order_unverified_escalate";
        requiresEscalation = true;
        escalationReason = lookup.reason;
      }
    } else if (c.category === "out_of_stock" || c.category === "restock") {
      const avail = await lookupSellableAvailabilitySummary(null);
      sources.push(...avail.sources);
      bodyText =
        `${avail.text}\n\nThis reflects current sellable inventory only. Inbound or testing inventory is not available for sale.` +
        footer();
      policyDecision =
        c.category === "restock"
          ? "green_availability_no_restock_promise"
          : "green_sellable_availability";
      if (c.category === "restock") {
        requiresEscalation = true;
        escalationReason = "Restock timing requires human judgment";
        bodyText =
          getYellowAckText() +
          "\n\n" +
          avail.text +
          "\n\nWe cannot promise a restock date from this mailbox." +
          footer();
      }
    } else if (kn.length > 0) {
      bodyText = kn.map((k) => k.text).join("\n\n") + footer();
      policyDecision = `green_knowledge:${c.category}`;
    } else {
      bodyText =
        getYellowAckText() +
        footer();
      policyDecision = "green_without_knowledge_escalate";
      requiresEscalation = true;
      escalationReason = "No approved knowledge snippet for category";
    }

    if (c.confidence < HIGH_CONFIDENCE_THRESHOLD) {
      requiresEscalation = true;
      escalationReason = escalationReason ?? "Low classification confidence";
      policyDecision = `${policyDecision}+low_confidence`;
    }
  }

  return {
    bodyText,
    bodyHtml: toHtml(bodyText),
    knowledgeSources: sources,
    aiDrafted: false,
    requiresEscalation,
    escalationReason,
    policyDecision,
  };
}

export function decideOutboundAction(input: {
  classification: ClassificationResult;
  draft: DraftResult;
  threadAutoSendDisabled: boolean;
}): {
  sendCustomerReply: boolean;
  escalate: boolean;
  reason: string;
} {
  const autoEnabled = isSupportAutoSendEnabled();
  const escalate = input.draft.requiresEscalation;
  const c = input.classification;

  const eligibleGreenAuto =
    c.riskLevel === "GREEN" &&
    c.autoResponseAllowed &&
    c.confidence >= MIN_AUTO_SEND_CONFIDENCE &&
    !input.threadAutoSendDisabled &&
    !input.draft.requiresEscalation;

  // Human-use: may send fixed boundary when auto-send on, always escalate.
  const humanUseAuto =
    c.category === "human_use_request" &&
    autoEnabled &&
    !input.threadAutoSendDisabled;

  // YELLOW/RED acknowledgments only when auto-send enabled (still escalate).
  const ackAuto =
    autoEnabled &&
    !input.threadAutoSendDisabled &&
    (c.riskLevel === "YELLOW" || c.riskLevel === "RED");

  if (!autoEnabled) {
    return {
      sendCustomerReply: false,
      escalate: escalate || c.riskLevel !== "GREEN" || !eligibleGreenAuto,
      reason: "SUPPORT_AUTO_SEND_ENABLED=false — draft/log only",
    };
  }

  if (input.threadAutoSendDisabled) {
    return {
      sendCustomerReply: false,
      escalate: true,
      reason: "Thread auto-send disabled by admin",
    };
  }

  if (humanUseAuto) {
    return {
      sendCustomerReply: true,
      escalate: true,
      reason: "Human-use boundary auto-reply + escalate",
    };
  }

  if (eligibleGreenAuto) {
    return {
      sendCustomerReply: true,
      escalate: false,
      reason: "GREEN high-confidence auto-send",
    };
  }

  if (ackAuto) {
    return {
      sendCustomerReply: true,
      escalate: true,
      reason: `${c.riskLevel} acknowledgment + escalate`,
    };
  }

  return {
    sendCustomerReply: false,
    escalate: true,
    reason: "Draft only — escalate for human review",
  };
}

export function categoryLabel(category: SupportCategory): string {
  return category.replace(/_/g, " ");
}
