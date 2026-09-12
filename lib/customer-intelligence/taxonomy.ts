/**
 * Conservative customer-intelligence taxonomy.
 * Human-use is compliance-only — never a marketing/content opportunity.
 */

export const CI_THEMES = [
  "discovery_source",
  "purchase_driver",
  "checkout_friction",
  "payment_friction",
  "shipping_question",
  "documentation_question",
  "coa_findability",
  "batch_verification",
  "product_availability",
  "returns_policy",
  "support_question",
  "website_clarity",
  "trust_signal",
  "analytical_education",
  "community_question",
  "restricted_human_use_request",
] as const;

export type CiTheme = (typeof CI_THEMES)[number];

export type EvidenceClass =
  | "customer"
  | "community"
  | "search_demand"
  | "order_context"
  | "compliance";

export type CiConfidence =
  | "insufficient"
  | "early_signal"
  | "meaningful"
  | "strong";

export type CiSignalStatus =
  | "early"
  | "validated"
  | "watch"
  | "resolved"
  | "dismissed";

export type CiRecommendationType =
  | "FAQ_REVIEW"
  | "SITE_COPY_REVIEW"
  | "COA_DISCOVERABILITY_REVIEW"
  | "SUPPORT_KNOWLEDGE_REVIEW"
  | "CONTENT_OPPORTUNITY_REVIEW"
  | "CHECKOUT_FRICTION_REVIEW"
  | "SHIPPING_CLARITY_REVIEW"
  | "DOCUMENTATION_REVIEW";

/** Support categories → CI themes (customer evidence). */
export function themeFromSupportCategory(category: string | null): CiTheme {
  const c = (category ?? "").toLowerCase();
  if (c === "human_use_request" || c === "research_use_boundary") {
    return "restricted_human_use_request";
  }
  if (c === "coa_location") return "coa_findability";
  if (c === "batch_verification") return "batch_verification";
  if (
    c === "shipping_timing" ||
    c === "shipping_destination" ||
    c === "free_shipping" ||
    c === "tracking_not_updated"
  ) {
    return "shipping_question";
  }
  if (c === "card_payment" || c === "bitcoin_payment") return "payment_friction";
  if (
    c === "returns_replacement" ||
    c === "damaged_order" ||
    c === "wrong_item" ||
    c === "missing_item"
  ) {
    return "returns_policy";
  }
  if (c === "order_status") return "support_question";
  if (c.includes("stock") || c.includes("availability")) {
    return "product_availability";
  }
  return "support_question";
}

export function themeFromPurchaseDriver(driver: string): CiTheme {
  switch (driver) {
    case "lab_reports":
      return "purchase_driver";
    case "price":
      return "purchase_driver";
    case "availability":
      return "product_availability";
    case "clear_info":
      return "website_clarity";
    case "shipping_info":
      return "shipping_question";
    case "credibility":
      return "trust_signal";
    case "recommendation":
      return "discovery_source";
    default:
      return "purchase_driver";
  }
}

export function themeFromDiscoverySource(_source: string): CiTheme {
  return "discovery_source";
}

export function recommendationForTheme(
  theme: CiTheme
): CiRecommendationType | null {
  if (theme === "restricted_human_use_request") return null;
  switch (theme) {
    case "coa_findability":
    case "batch_verification":
      return "COA_DISCOVERABILITY_REVIEW";
    case "documentation_question":
    case "analytical_education":
      return "DOCUMENTATION_REVIEW";
    case "shipping_question":
      return "SHIPPING_CLARITY_REVIEW";
    case "checkout_friction":
      return "CHECKOUT_FRICTION_REVIEW";
    case "payment_friction":
      return "CHECKOUT_FRICTION_REVIEW";
    case "website_clarity":
    case "trust_signal":
      return "SITE_COPY_REVIEW";
    case "support_question":
    case "returns_policy":
      return "SUPPORT_KNOWLEDGE_REVIEW";
    case "purchase_driver":
    case "discovery_source":
      return "FAQ_REVIEW";
    case "community_question":
      return "FAQ_REVIEW";
    case "product_availability":
      return "SITE_COPY_REVIEW";
    default:
      return "FAQ_REVIEW";
  }
}

export function isMarketingForbiddenTheme(theme: CiTheme): boolean {
  return theme === "restricted_human_use_request";
}
