import type { SupportCategory, SupportRiskLevel } from "./constants";
import type { ClassificationResult } from "./types";

const ORDER_ID_RE = /\b(psl_[a-z0-9_]+)\b/i;

/** Genuine customer-support cues that suppress solicitation classification. */
const CUSTOMER_CUE_PATTERNS: RegExp[] = [
  ORDER_ID_RE,
  /\bmy\s+order\b/i,
  /\bmy\s+(package|shipment|parcel)\b/i,
  /\bi\s+ordered\b/i,
  /\bwhere\s+(can|do|is)\s+i\s+find\b/i,
  /\bwhere\s+is\s+my\b/i,
  /\btrack(ing)?\s+(my|number)\b/i,
  /\bi\s+received\b/i,
  /\bmissing\s+from\s+my\b/i,
  /\bwrong\s+item\s+in\s+my\b/i,
  /\brefund\s+my\s+order\b/i,
  /\bsupport\s+ticket\b/i,
];

const SPAM_PATTERNS: RegExp[] = [
  /\btrustpilot\b/i,
  /\breputation\s+management\b/i,
  /\b(buy|purchase|guaranteed|fake|bulk|paid)\s+reviews?\b/i,
  /\breviews?\s+(for\s+sale|service|package|agency)\b/i,
  /\bSEO\b/,
  /\bsearch\s+engine\s+optim/i,
  /\bbacklinks?\b/i,
  /\bgoogle\s+ranking\b/i,
  /\bincrease\s+(your\s+)?(traffic|rankings?|SERP)\b/i,
  /\bdigital\s+marketing\s+(agency|services?|proposal)\b/i,
  /\bmarketing\s+agency\b/i,
  /\bsocial\s+media\s+(promotion|growth|followers|marketing)\b/i,
  /\b(guest\s+posts?|link\s+building)\b/i,
  /\bwebsite\s+(design|redesign|development)\s+services?\b/i,
  /\bunsolicited\b/i,
  /\bgrow\s+your\s+(online\s+)?(business|sales|presence)\b/i,
  /\bboost\s+your\s+(reviews?|ratings?|seo)\b/i,
];

const VENDOR_PATTERNS: RegExp[] = [
  /\b(we|our\s+company|our\s+factory)\s+(manufacture|produce|supply|offer|export)\b/i,
  /\bpeptide\s+(manufacturer|supplier|factory|wholesaler)\b/i,
  /\braw\s+materials?\b/i,
  /\bwholesale\s+(peptides?|pricing|supply)\b/i,
  /\bMOQ\b/,
  /\bminimum\s+order\s+quantity\b/i,
  /\bAPI\s+(powder|manufacturer|supplier)\b/i,
  /\b(packaging|vial)\s+supplier\b/i,
  /\bwe\s+can\s+supply\b/i,
  /\bour\s+(product\s+)?catalog\b/i,
  /\bprice\s+list\b/i,
  /\bbulk\s+peptides?\b/i,
  /\bmanufacturer\s+of\s+peptides?\b/i,
  /\blogistics\s+(partner|provider|vendor)\b/i,
  /\blooking\s+for\s+(distributors?|partners?)\b/i,
  /\boffer\s+you\s+(our\s+)?peptides?\b/i,
  /\bpharmaceutical\s+(raw|intermediate)\b/i,
];

function countHits(hay: string, patterns: RegExp[]): number {
  let n = 0;
  for (const p of patterns) {
    p.lastIndex = 0;
    if (p.test(hay)) n += 1;
  }
  return n;
}

function hasCustomerCues(hay: string): boolean {
  return CUSTOMER_CUE_PATTERNS.some((p) => {
    p.lastIndex = 0;
    return p.test(hay);
  });
}

/**
 * Pre-classification: high-confidence spam/vendor solicitation.
 * Runs before normal support category matching.
 * Mentions of COA/Janoshik alone never force a customer support category here.
 */
export function detectSolicitation(input: {
  subject: string;
  body: string;
}): ClassificationResult | null {
  const hay = `${input.subject}\n${input.body}`;
  if (hasCustomerCues(hay)) return null;

  const spamHits = countHits(hay, SPAM_PATTERNS);
  const vendorHits = countHits(hay, VENDOR_PATTERNS);

  // Prefer spam when both fire (marketing pitches sometimes name products).
  if (spamHits >= 1) {
    const confidence = Math.min(0.99, 0.86 + spamHits * 0.04);
    if (confidence >= 0.85) {
      return {
        category: "spam_solicitation",
        riskLevel: "GREEN",
        confidence,
        reasons: [`solicitation:spam_hits=${spamHits}`],
        autoResponseAllowed: false,
        extractedOrderId: null,
        extractedTracking: null,
      };
    }
  }

  if (vendorHits >= 1) {
    const confidence = Math.min(0.99, 0.86 + vendorHits * 0.04);
    if (confidence >= 0.85) {
      return {
        category: "vendor_solicitation",
        riskLevel: "GREEN",
        confidence,
        reasons: [`solicitation:vendor_hits=${vendorHits}`],
        autoResponseAllowed: false,
        extractedOrderId: null,
        extractedTracking: null,
      };
    }
  }

  return null;
}

export function isSolicitationCategory(category: SupportCategory): boolean {
  return category === "spam_solicitation" || category === "vendor_solicitation";
}
