import {
  getApprovedKnowledgeLibrary,
  getHumanUseBoundaryText,
} from "@/lib/support/knowledge";
import { SUPPORT_EMAIL } from "@/lib/cart/constants";
import { lookupSellableAvailabilitySummary } from "@/lib/support/inventory-lookup";
import { textLooksRestrictedHumanUse } from "@/lib/customer-intelligence/guardrails";
import {
  looksLikeOrderPiiRequest,
  sanitizeDiscordInput,
} from "./sanitize";

export type DiscordAnswer = {
  content: string;
  ephemeral: boolean;
  category: string;
  riskLevel: "low" | "restricted";
  outcome: "answered" | "routed_support" | "boundary" | "uncertain";
  responseSource: string;
};

const UNCERTAIN =
  "I don't have enough verified information to answer that here. Please contact PSL Labs Support at " +
  SUPPORT_EMAIL +
  ".";

const PRIVATE_SUPPORT =
  "For order-specific help, please email " +
  SUPPORT_EMAIL +
  " from your order email (include your order number). Do not post order numbers, emails, addresses, or payment details in Discord.";

function scoreSnippet(question: string, text: string): number {
  const q = question.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
  const t = text.toLowerCase();
  let score = 0;
  for (const w of q) {
    if (t.includes(w)) score += 1;
  }
  return score;
}

/** Deterministic /ask — no generative LLM. */
export function answerAsk(questionRaw: string): DiscordAnswer {
  const question = sanitizeDiscordInput(questionRaw);
  if (!question) {
    return {
      content: UNCERTAIN,
      ephemeral: true,
      category: "uncertain",
      riskLevel: "low",
      outcome: "uncertain",
      responseSource: "fixed:empty",
    };
  }

  if (textLooksRestrictedHumanUse(question)) {
    return {
      content: getHumanUseBoundaryText(),
      ephemeral: true,
      category: "restricted_human_use_request",
      riskLevel: "restricted",
      outcome: "boundary",
      responseSource: "policy:research-use",
    };
  }

  if (looksLikeOrderPiiRequest(question)) {
    return {
      content: PRIVATE_SUPPORT,
      ephemeral: true,
      category: "order_status_private",
      riskLevel: "low",
      outcome: "routed_support",
      responseSource: "policy:private_support",
    };
  }

  const library = getApprovedKnowledgeLibrary();
  let best = library[0];
  let bestScore = 0;
  for (const snip of library) {
    const s = scoreSnippet(question, snip.text);
    if (s > bestScore) {
      bestScore = s;
      best = snip;
    }
  }

  if (bestScore < 2) {
    return {
      content: UNCERTAIN,
      ephemeral: true,
      category: "uncertain",
      riskLevel: "low",
      outcome: "uncertain",
      responseSource: "fixed:uncertain",
    };
  }

  const publicSafe =
    best.id.startsWith("faq:") ||
    best.id === "policy:coa" ||
    best.id === "policy:shipping" ||
    best.id === "policy:contact";

  return {
    content: best.text.slice(0, 1800),
    ephemeral: !publicSafe,
    category: best.categoryHints[0] ?? "analytical_education",
    riskLevel: "low",
    outcome: "answered",
    responseSource: best.id,
  };
}

export function answerCoa(productOrBatchRaw?: string): DiscordAnswer {
  const hint = sanitizeDiscordInput(productOrBatchRaw);
  if (textLooksRestrictedHumanUse(hint)) {
    return {
      content: getHumanUseBoundaryText(),
      ephemeral: true,
      category: "restricted_human_use_request",
      riskLevel: "restricted",
      outcome: "boundary",
      responseSource: "policy:research-use",
    };
  }

  const base =
    getApprovedKnowledgeLibrary().find((k) => k.id === "policy:coa")?.text ??
    "Certificates of Analysis are published at /coa. We do not invent batch reports.";

  const extra = hint
    ? `\n\nYou asked about “${hint}”. Use the product page and /coa for published batch documentation. We only confirm batches that appear in current public PSL documentation — we will not invent a report.`
    : "\n\nWe only reference batches/reports that are currently published. We will not invent a report.";

  return {
    content: base + extra,
    ephemeral: false,
    category: "coa_location",
    riskLevel: "low",
    outcome: "answered",
    responseSource: "policy:coa",
  };
}

export async function answerProducts(
  productHint?: string
): Promise<DiscordAnswer> {
  const hint = sanitizeDiscordInput(productHint);
  const summary = await lookupSellableAvailabilitySummary(hint || null);
  const catalog = await import("@/lib/products/catalog");
  const products = catalog.getActiveCatalogProducts();
  const priceLines = products
    .filter((p) => {
      if (!hint) return true;
      const h = hint.toLowerCase();
      return (
        p.name.toLowerCase().includes(h) ||
        p.handle.includes(h) ||
        p.sku.toLowerCase().includes(h)
      );
    })
    .slice(0, 12)
    .map((p) => `- ${p.name} (${p.strength}): $${p.price.toFixed(2)} · ${p.href}`);

  return {
    content:
      summary.text +
      "\n\nPublic list pricing:\n" +
      (priceLines.join("\n") || "- No matching active products.") +
      "\n\nAvailability labels are sellable-status only — not internal unit counts or inbound pipeline.",
    ephemeral: false,
    category: "product_availability",
    riskLevel: "low",
    outcome: "answered",
    responseSource: "neon:sellable_availability+catalog",
  };
}

export function answerShipping(): DiscordAnswer {
  const text =
    getApprovedKnowledgeLibrary().find((k) => k.id === "policy:shipping")
      ?.text ?? UNCERTAIN;
  return {
    content: text,
    ephemeral: false,
    category: "shipping_question",
    riskLevel: "low",
    outcome: "answered",
    responseSource: "policy:shipping",
  };
}

export function answerSupport(): DiscordAnswer {
  return {
    content: PRIVATE_SUPPORT,
    ephemeral: true,
    category: "support_route",
    riskLevel: "low",
    outcome: "routed_support",
    responseSource: "policy:private_support",
  };
}

/** Local admin test of knowledge answers — no Discord network. */
export function testKnowledgeAnswerLocally(question: string): DiscordAnswer {
  return answerAsk(question);
}
