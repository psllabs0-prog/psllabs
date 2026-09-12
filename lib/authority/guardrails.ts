/**
 * Claims / regulatory guardrails for authority opportunities and briefs.
 * RUO disclaimer alone never clears risky topics.
 */

export type AuthorityIntent =
  | "informational"
  | "analytical_educational"
  | "verification_trust"
  | "commercial_support";

export type AuthorityRiskLevel = "LOW" | "CLAIMS_REVIEW" | "COUNSEL_REVIEW";

const FORBIDDEN_TOPIC_PATTERNS: RegExp[] = [
  /\bdos(e|ing|ages?)\b/i,
  /\btitrat/i,
  /\binject/i,
  /\badministrat/i,
  /\bcycle(s)?\b/i,
  /\bstack(s|ing)?\b/i,
  /\breconstitut/i,
  /\bside[\s-]?effect/i,
  /\bweight[\s-]?loss\b/i,
  /\bfat[\s-]?loss\b/i,
  /\bheal(ing|s)?\b/i,
  /\bmuscle\b/i,
  /\btreat(ment|s|ing)?\b/i,
  /\bcure(s|d)?\b/i,
  /\bdisease\b/i,
  /\bsafety\b/i,
  /\befficacy\b/i,
  /\bfor humans?\b/i,
  /\bhuman use\b/i,
  /\bbodybuilding\b/i,
  /\bped\b/i,
];

const GENERIC_COMPOUND_PATTERNS: RegExp[] = [
  /^what is\s+/i,
  /^what are\s+/i,
  /\bbenefits of\b/i,
  /\bbuy\b/i,
  /\bwhere to buy\b/i,
];

const CLAIMS_NOT_TO_MAKE = [
  "Dosing, titration, injection, or administration guidance",
  "Cycles, stacks, or reconstitution for human use",
  "Side-effect management or human safety assurances",
  "Weight-loss, healing, muscle, disease-treatment, or efficacy claims",
  "Human-use testimonials republished as company content",
  "Any statement that a product is approved for human or animal administration",
] as const;

export function detectForbiddenTopic(text: string): boolean {
  return FORBIDDEN_TOPIC_PATTERNS.some((re) => re.test(text));
}

export function looksLikeGenericCompoundPage(query: string): boolean {
  return GENERIC_COMPOUND_PATTERNS.some((re) => re.test(query.trim()));
}

export function classifyIntent(query: string, page: string): AuthorityIntent {
  const t = `${query} ${page}`.toLowerCase();
  if (
    /coa|certificate|verify|verification|batch|lot|traceab|laboratory report/.test(
      t
    )
  ) {
    return "verification_trust";
  }
  if (
    /purity|identity|content|hplc|ms|analytical|testing|limitations/.test(t)
  ) {
    return "analytical_educational";
  }
  if (/buy|price|shop|order|product/.test(t)) {
    return "commercial_support";
  }
  return "informational";
}

export function classifyRisk(query: string, page: string): AuthorityRiskLevel {
  const t = `${query} ${page}`;
  if (detectForbiddenTopic(t)) return "COUNSEL_REVIEW";
  if (looksLikeGenericCompoundPage(query) || /benefit|result|works? for/i.test(t)) {
    return "CLAIMS_REVIEW";
  }
  return "LOW";
}

export function claimsNotToMake(): readonly string[] {
  return CLAIMS_NOT_TO_MAKE;
}

export function shouldSuppressAsNormalPublishable(query: string): boolean {
  return detectForbiddenTopic(query);
}

export function claimsReviewBanner(risk: AuthorityRiskLevel): string | null {
  if (risk === "LOW") return null;
  return "COUNSEL/CLAIMS REVIEW BEFORE PUBLICATION";
}
