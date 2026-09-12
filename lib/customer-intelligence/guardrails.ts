/**
 * Claims/regulatory guardrails for customer intelligence.
 * Restricted human-use never becomes marketing/content opportunity.
 */

const RESTRICTED_PATTERNS: RegExp[] = [
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
  /\befficacy\b/i,
  /\bfor humans?\b/i,
  /\bhuman use\b/i,
];

export function textLooksRestrictedHumanUse(text: string | null | undefined): boolean {
  if (!text) return false;
  return RESTRICTED_PATTERNS.some((re) => re.test(text));
}

export function canCreateContentOpportunityFromTheme(theme: string): boolean {
  return theme !== "restricted_human_use_request";
}
