import type { SupportCategory } from "./constants";
import type { ClassificationResult } from "./types";

const ORDER_ID_RE = /\b(psl_[a-z0-9_]+)\b/i;

/**
 * Customer / presale question language — suppress solicitation auto-ignore
 * when the message looks like someone buying from PSL, not selling to PSL.
 */
const CUSTOMER_OR_PRESALE_PATTERNS: RegExp[] = [
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
  // Presale / buyer questions (must not silent-ignore)
  /\bdo\s+you\s+(have|offer|sell|accept|ship)\b/i,
  /\bcan\s+you\s+(send|provide|tell|help|ship)\b/i,
  /\bwhat\s+(is|are)\s+(your|the)\b/i,
  /\bhow\s+much\b/i,
  /\bi\s+(want|would\s+like|need)\s+to\s+(order|buy|purchase)\b/i,
  /\bam\s+i\s+able\s+to\b/i,
  /\bis\s+there\s+an?\s+moq\b/i,
  /\byour\s+(moq|minimum\s+order|price\s+list|shipping)\b/i,
];

/** Strong spam phrases — one hit is enough for high-confidence ignore. */
const STRONG_SPAM_PATTERNS: RegExp[] = [
  /\breputation\s+management\s+services?\b/i,
  /\breputation\s+management\b/i,
  /\b(bulk|paid|fake|guaranteed)\s+review\s+packages?\b/i,
  /\bbulk\s+reviews?\b/i,
  /\breviews?\s+for\s+sale\b/i,
  /\bSEO\s+services?\b/i,
  /\b(offer|provide)\s+SEO\b/i,
  /\bsend\s+you\s+a\s+proposal\b/i,
  /\bdigital\s+marketing\s+(agency|services?|proposal)\b/i,
  /\bmarketing\s+agency\b/i,
  /\bsocial\s+media\s+(promotion|growth|followers)\b/i,
  /\blink\s+building\s+(services?|package)\b/i,
  /\bwebsite\s+(design|redesign|development)\s+services?\b/i,
  /\bgrow\s+your\s+(online\s+)?(business|sales|presence)\b/i,
  /\bboost\s+your\s+(reviews?|ratings?)\b/i,
  /\bwe\s+(can|will)\s+(get|deliver|provide)\s+you\s+\d+\s+.*reviews?\b/i,
];

/** Weak spam indicators — need ≥2 independent hits (and no customer/presale cues). */
const WEAK_SPAM_PATTERNS: RegExp[] = [
  /\btrustpilot\b/i,
  /\bSEO\b/,
  /\bsearch\s+engine\s+optim/i,
  /\bbacklinks?\b/i,
  /\bgoogle\s+ranking\b/i,
  /\bincrease\s+(your\s+)?(traffic|rankings?|SERP)\b/i,
  /\bguest\s+posts?\b/i,
  /\bunsolicited\b/i,
  /\breputation\s+management\b/i,
  /\breviews?\b/i,
];

/** Strong vendor phrases — one hit is enough. */
const STRONG_VENDOR_PATTERNS: RegExp[] = [
  /\bwe\s+are\s+a\s+peptide\s+(manufacturer|supplier|factory|wholesaler)\b/i,
  /\bour\s+factory\b/i,
  /\bwe\s+can\s+supply\b/i,
  /\b(we|our\s+company|our\s+factory)\s+(manufacture|produce|supply|export)\b/i,
  /\bpeptide\s+(manufacturer|supplier|factory|wholesaler)\b/i,
  /\bmanufacturer\s+of\s+peptides?\b/i,
  /\b(packaging|vial)\s+supplier\b/i,
  /\blogistics\s+(partner|provider|vendor)\b/i,
  /\blooking\s+for\s+(distributors?|partners?)\b/i,
  /\boffer\s+you\s+(our\s+)?peptides?\b/i,
  /\bAPI\s+(powder\s+)?(manufacturer|supplier)\b/i,
];

/** Weak vendor indicators — need ≥2 independent hits. */
const WEAK_VENDOR_PATTERNS: RegExp[] = [
  /\bMOQ\b/,
  /\bminimum\s+order\s+quantity\b/i,
  /\bprice\s+list\b/i,
  /\braw\s+materials?\b/i,
  /\bwholesale\b/i,
  /\bbulk\s+peptides?\b/i,
  /\bour\s+(product\s+)?catalog\b/i,
  /\bpharmaceutical\s+(raw|intermediate)\b/i,
  /\bwholesale\s+(peptides?|pricing|supply)\b/i,
];

function countHits(hay: string, patterns: RegExp[]): number {
  let n = 0;
  for (const p of patterns) {
    p.lastIndex = 0;
    if (p.test(hay)) n += 1;
  }
  return n;
}

function hasCustomerOrPresaleCues(hay: string): boolean {
  return CUSTOMER_OR_PRESALE_PATTERNS.some((p) => {
    p.lastIndex = 0;
    return p.test(hay);
  });
}

function solicitationResult(
  category: "spam_solicitation" | "vendor_solicitation",
  confidence: number,
  reasons: string[]
): ClassificationResult {
  return {
    category,
    riskLevel: "GREEN",
    confidence,
    reasons,
    autoResponseAllowed: false,
    extractedOrderId: null,
    extractedTracking: null,
  };
}

/**
 * Conservative pre-classification for spam/vendor solicitation.
 * Strong phrases may qualify alone; weak indicators need ≥2 hits.
 * Customer/presale question language suppresses auto-ignore when ambiguous.
 * COA / Janoshik / purity alone never force ignore or a support category here.
 */
export function detectSolicitation(input: {
  subject: string;
  body: string;
}): ClassificationResult | null {
  const hay = `${input.subject}\n${input.body}`;
  if (hasCustomerOrPresaleCues(hay)) return null;

  const strongSpam = countHits(hay, STRONG_SPAM_PATTERNS);
  const weakSpam = countHits(hay, WEAK_SPAM_PATTERNS);
  const strongVendor = countHits(hay, STRONG_VENDOR_PATTERNS);
  const weakVendor = countHits(hay, WEAK_VENDOR_PATTERNS);

  const spamQualified = strongSpam >= 1 || weakSpam >= 2;
  const vendorQualified = strongVendor >= 1 || weakVendor >= 2;

  // Prefer spam when both fire (marketing pitches sometimes name products).
  if (spamQualified) {
    const confidence = Math.min(
      0.99,
      strongSpam >= 1 ? 0.92 + strongSpam * 0.02 : 0.86 + weakSpam * 0.03
    );
    return solicitationResult("spam_solicitation", confidence, [
      `solicitation:strong_spam=${strongSpam}`,
      `solicitation:weak_spam=${weakSpam}`,
    ]);
  }

  if (vendorQualified) {
    const confidence = Math.min(
      0.99,
      strongVendor >= 1
        ? 0.92 + strongVendor * 0.02
        : 0.86 + weakVendor * 0.03
    );
    return solicitationResult("vendor_solicitation", confidence, [
      `solicitation:strong_vendor=${strongVendor}`,
      `solicitation:weak_vendor=${weakVendor}`,
    ]);
  }

  return null;
}

export function isSolicitationCategory(category: SupportCategory): boolean {
  return category === "spam_solicitation" || category === "vendor_solicitation";
}
