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
import { getActiveCatalogProducts } from "@/lib/products/catalog";
import {
  getAvailableBatchReports,
  type BatchReport,
} from "@/lib/batch-reports";
import type { CatalogProduct } from "@/lib/products/catalog";

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

const COA_GENERIC =
  (getApprovedKnowledgeLibrary().find((k) => k.id === "policy:coa")?.text ??
    "Certificates of Analysis are published at /coa and on product pages. Verify originals with the testing lab using the task number on the report.") +
  "\n\nWe only reference batches/reports that are currently published. We will not invent a report.";

function scoreSnippet(question: string, text: string): number {
  const q = question.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
  const t = text.toLowerCase();
  let score = 0;
  for (const w of q) {
    if (t.includes(w)) score += 1;
  }
  return score;
}

function looksUnsafeToEcho(hint: string): boolean {
  return (
    looksLikeOrderPiiRequest(hint) ||
    /@/.test(hint) ||
    /\b\d{5}(-\d{4})?\b/.test(hint) ||
    /\border\b/i.test(hint) ||
    /\baddress\b/i.test(hint) ||
    /\bemail\b/i.test(hint)
  );
}

/** Exact/public catalog match only — no invention. */
export function matchKnownPublicProduct(
  hint: string
): CatalogProduct | null {
  const h = hint.trim().toLowerCase();
  if (!h) return null;
  const products = getActiveCatalogProducts();
  return (
    products.find(
      (p) =>
        p.handle === h ||
        p.sku.toLowerCase() === h ||
        p.name.toLowerCase() === h ||
        p.name.toLowerCase().replace(/\s+/g, "-") === h
    ) ?? null
  );
}

/** Exact public published batch/task match only. */
export function matchKnownPublicBatch(hint: string): BatchReport | null {
  const h = hint.trim().toLowerCase();
  if (!h) return null;
  return (
    getAvailableBatchReports().find(
      (r) =>
        r.batch.toLowerCase() === h ||
        r.taskNumber.toLowerCase() === h ||
        r.sku.toLowerCase() === h
    ) ?? null
  );
}

function restrictedBoundary(): DiscordAnswer {
  return {
    content: getHumanUseBoundaryText(),
    ephemeral: true,
    category: "restricted_human_use_request",
    riskLevel: "restricted",
    outcome: "boundary",
    responseSource: "policy:research-use",
  };
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
    return restrictedBoundary();
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

  if (!hint) {
    return {
      content: COA_GENERIC,
      ephemeral: false,
      category: "coa_location",
      riskLevel: "low",
      outcome: "answered",
      responseSource: "policy:coa",
    };
  }

  if (textLooksRestrictedHumanUse(hint)) {
    return restrictedBoundary();
  }

  if (looksUnsafeToEcho(hint)) {
    return {
      content: COA_GENERIC,
      ephemeral: true,
      category: "coa_location",
      riskLevel: "low",
      outcome: "answered",
      responseSource: "policy:coa",
    };
  }

  const product = matchKnownPublicProduct(hint);
  if (product) {
    return {
      content:
        `${COA_GENERIC}\n\nFor ${product.name}, check the product page (${product.href}) and /coa for any currently published batch report. We will not invent a report.`,
      ephemeral: false,
      category: "coa_location",
      riskLevel: "low",
      outcome: "answered",
      responseSource: "policy:coa+catalog",
    };
  }

  const batch = matchKnownPublicBatch(hint);
  if (batch) {
    return {
      content:
        `${COA_GENERIC}\n\nA published public report is listed for ${batch.product} (batch ${batch.batch}). Verify the original with the testing lab using the task number on that report. We do not invent reports.`,
      ephemeral: false,
      category: "coa_location",
      riskLevel: "low",
      outcome: "answered",
      responseSource: "policy:coa+public_batch",
    };
  }

  // Unknown freeform hint — do not echo raw text; generic guidance, ephemeral.
  return {
    content: COA_GENERIC,
    ephemeral: true,
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

  if (hint && textLooksRestrictedHumanUse(hint)) {
    return restrictedBoundary();
  }

  const summary = await lookupSellableAvailabilitySummary(hint || null);
  const products = getActiveCatalogProducts();
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
    .map(
      (p) =>
        `- ${p.name} (${p.strength}): $${p.price.toFixed(2)} · ${p.href}`
    );

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
