import {
  AUTO_SEND_GREEN_CATEGORIES,
  HIGH_CONFIDENCE_THRESHOLD,
  type SupportCategory,
  type SupportRiskLevel,
} from "./constants";
import { containsInjectionAttempt } from "./sanitize";
import { detectSolicitation, isSolicitationCategory } from "./solicitation";
import type { ClassificationResult } from "./types";

const ORDER_ID_RE = /\b(psl_[a-z0-9_]+)\b/i;
const TRACKING_RE = /\b([A-Z0-9]{10,34})\b/;

type Rule = {
  category: SupportCategory;
  risk: SupportRiskLevel;
  patterns: RegExp[];
  weight: number;
};

const RULES: Rule[] = [
  {
    category: "chargeback",
    risk: "RED",
    patterns: [/chargeback/i, /dispute\s+with\s+(bank|card|paypal)/i],
    weight: 1,
  },
  {
    category: "fraud",
    risk: "RED",
    patterns: [/fraud/i, /stolen\s+card/i, /unauthorized\s+charge/i],
    weight: 1,
  },
  {
    category: "legal",
    risk: "RED",
    patterns: [/attorney/i, /lawyer/i, /lawsuit/i, /legal\s+demand/i, /cease\s+and\s+desist/i],
    weight: 1,
  },
  {
    category: "regulatory",
    risk: "RED",
    patterns: [/fda/i, /\bdea\b/i, /regulator/i, /compliance\s+inquiry/i],
    weight: 1,
  },
  {
    category: "security",
    risk: "RED",
    patterns: [/security\s+incident/i, /data\s+breach/i, /hacked/i, /threat(en|ening)?/i],
    weight: 1,
  },
  {
    category: "refund_request",
    risk: "RED",
    patterns: [/refund/i, /money\s+back/i, /charge\s+back\s+my/i],
    weight: 0.95,
  },
  {
    category: "human_use_request",
    risk: "GREEN",
    patterns: [
      /\bdos(e|ing)\b/i,
      /inject(ion|ing)?/i,
      /titrat/i,
      /cycle\b/i,
      /stack(ing)?\b/i,
      /reconstitut/i,
      /side\s*effect/i,
      /weight\s*loss/i,
      /fat\s*loss/i,
      /for\s+my\s+(patient|body|wife|husband|dog|cat)/i,
      /how\s+(much|often)\s+(do|should)\s+i\s+(take|use|inject)/i,
      /medical\s+advice/i,
      /treatment/i,
      /healing|recovery\s+protocol/i,
    ],
    weight: 1,
  },
  {
    category: "damaged_order",
    risk: "YELLOW",
    patterns: [/damaged/i, /broken\s+vial/i, /crushed/i, /leaking/i],
    weight: 0.95,
  },
  {
    category: "wrong_item",
    risk: "YELLOW",
    patterns: [/wrong\s+item/i, /wrong\s+product/i, /incorrect\s+item/i],
    weight: 0.95,
  },
  {
    category: "missing_item",
    risk: "YELLOW",
    patterns: [
      /missing\s+item/i,
      /not\s+in\s+(the\s+)?(box|package)/i,
      /delivered\s+but\s+missing/i,
      /empty\s+box/i,
    ],
    weight: 0.95,
  },
  {
    category: "returns_replacement",
    risk: "YELLOW",
    patterns: [/replac(e|ement)/i, /return\s+policy/i, /\breturn\b/i],
    weight: 0.85,
  },
  {
    category: "documentation_mismatch",
    risk: "YELLOW",
    patterns: [/coa\s+(doesn.?t|does\s+not)\s+match/i, /wrong\s+coa/i, /mismatch/i],
    weight: 0.9,
  },
  {
    category: "payment_declined",
    risk: "YELLOW",
    patterns: [/payment\s+declined/i, /card\s+declined/i, /failed\s+payment/i],
    weight: 0.85,
  },
  {
    category: "batch_report_missing",
    risk: "YELLOW",
    patterns: [/missing\s+(coa|report)/i, /no\s+coa/i, /report\s+not\s+(found|available)/i],
    weight: 0.8,
  },
  {
    category: "restock",
    risk: "YELLOW",
    patterns: [/when\s+(will|do).*(restock|back\s+in\s+stock)/i, /restock/i],
    weight: 0.75,
  },
  {
    category: "order_status",
    risk: "GREEN",
    patterns: [/order\s+status/i, /where\s+is\s+my\s+order/i, /has\s+my\s+order\s+shipped/i],
    weight: 0.9,
  },
  {
    category: "tracking_not_updated",
    risk: "GREEN",
    patterns: [/tracking/i, /track\s+(my\s+)?(order|package|shipment)/i, /tracking\s+number/i],
    weight: 0.88,
  },
  {
    category: "coa_location",
    risk: "GREEN",
    patterns: [/\bcoa\b/i, /certificate\s+of\s+analysis/i, /where.*(report|coa)/i],
    weight: 0.9,
  },
  {
    category: "batch_verification",
    risk: "GREEN",
    patterns: [/verify.*(batch|coa|report)/i, /janoshik/i, /batch\s+(number|id|code)/i],
    weight: 0.9,
  },
  {
    category: "shipping_timing",
    risk: "GREEN",
    patterns: [/how\s+long.*(ship|deliver)/i, /shipping\s+time/i, /delivery\s+time/i],
    weight: 0.88,
  },
  {
    category: "free_shipping",
    risk: "GREEN",
    patterns: [/free\s+shipping/i],
    weight: 0.9,
  },
  {
    category: "shipping_destination",
    risk: "GREEN",
    patterns: [/ship\s+to\s+(canada|uk|europe|international)/i, /international\s+ship/i, /do\s+you\s+ship\s+to/i],
    weight: 0.88,
  },
  {
    category: "out_of_stock",
    risk: "GREEN",
    patterns: [/in\s+stock/i, /out\s+of\s+stock/i, /available\s+to\s+(buy|order|purchase)/i, /availability/i],
    weight: 0.85,
  },
  {
    category: "card_payment",
    risk: "GREEN",
    patterns: [/credit\s+card/i, /debit\s+card/i, /visa|mastercard|amex/i, /tagada/i],
    weight: 0.85,
  },
  {
    category: "bitcoin_payment",
    risk: "GREEN",
    patterns: [/bitcoin/i, /\bbtc\b/i, /btcpay/i],
    weight: 0.88,
  },
  {
    category: "research_use_boundary",
    risk: "GREEN",
    patterns: [/research\s+use/i, /for\s+lab(oratory)?\s+use/i, /not\s+for\s+human/i],
    weight: 0.9,
  },
];

function extractOrderId(text: string): string | null {
  const m = text.match(ORDER_ID_RE);
  return m ? m[1] : null;
}

function extractTracking(text: string): string | null {
  // Avoid treating order ids as tracking.
  const withoutOrders = text.replace(ORDER_ID_RE, " ");
  const m = withoutOrders.match(TRACKING_RE);
  return m ? m[1] : null;
}

export function classifySupportMessage(input: {
  subject: string;
  body: string;
}): ClassificationResult {
  const hay = `${input.subject}\n${input.body}`;

  // Precedence: high-confidence solicitation/vendor BEFORE support matching.
  const solicitation = detectSolicitation(input);
  if (solicitation) return solicitation;

  const reasons: string[] = [];
  let best: { category: SupportCategory; risk: SupportRiskLevel; score: number } | null =
    null;

  if (containsInjectionAttempt(hay)) {
    reasons.push("prompt-injection patterns detected — escalate");
  }

  for (const rule of RULES) {
    const hits = rule.patterns.filter((p) => p.test(hay)).length;
    if (!hits) continue;
    const score = Math.min(0.99, rule.weight + hits * 0.02);
    if (!best || score > best.score) {
      best = { category: rule.category, risk: rule.risk, score };
    }
    reasons.push(`matched:${rule.category}`);
  }

  // Injection forces at least YELLOW unless already RED.
  if (containsInjectionAttempt(hay)) {
    if (!best || best.risk === "GREEN") {
      best = { category: best?.category ?? "other", risk: "YELLOW", score: 0.5 };
    }
  }

  if (!best) {
    return {
      category: "other",
      riskLevel: "YELLOW",
      confidence: 0.35,
      reasons: ["no strong category match — escalate"],
      autoResponseAllowed: false,
      extractedOrderId: extractOrderId(hay),
      extractedTracking: extractTracking(hay),
    };
  }

  let confidence = best.score;
  if (best.category === "other") confidence = Math.min(confidence, 0.4);

  // Human-use is GREEN for the fixed boundary reply, but always escalate.
  const autoResponseAllowed =
    best.risk === "GREEN" &&
    confidence >= HIGH_CONFIDENCE_THRESHOLD &&
    AUTO_SEND_GREEN_CATEGORIES.has(best.category);

  if (best.risk !== "GREEN") {
    reasons.push(`risk=${best.risk}`);
  }
  if (confidence < HIGH_CONFIDENCE_THRESHOLD) {
    reasons.push("low confidence");
  }

  return {
    category: best.category,
    riskLevel: best.risk,
    confidence,
    reasons,
    autoResponseAllowed,
    extractedOrderId: extractOrderId(hay),
    extractedTracking: extractTracking(hay),
  };
}

export function shouldEscalateClassification(
  c: ClassificationResult
): boolean {
  if (isSolicitationCategory(c.category)) return false;
  if (c.riskLevel === "YELLOW" || c.riskLevel === "RED") return true;
  if (c.confidence < HIGH_CONFIDENCE_THRESHOLD) return true;
  if (c.category === "human_use_request") return true;
  if (c.category === "other") return true;
  if (!c.autoResponseAllowed) return true;
  return false;
}
