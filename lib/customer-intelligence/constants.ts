export const CUSTOMER_FEEDBACK_SURVEY_VERSION = "v1" as const;
export const CUSTOMER_FEEDBACK_SUBMITTED_FROM = "order_success" as const;

export const DISCOVERY_SOURCE_OPTIONS = [
  { value: "google_search", label: "Google / search" },
  { value: "x", label: "X" },
  { value: "reddit_community", label: "Reddit or another community" },
  { value: "friend_colleague", label: "Friend or colleague" },
  { value: "another_website", label: "Another website" },
  { value: "already_knew", label: "I already knew about PSL Labs" },
  { value: "other", label: "Other" },
] as const;

export type DiscoverySourceValue =
  (typeof DISCOVERY_SOURCE_OPTIONS)[number]["value"];

export const PURCHASE_DRIVER_OPTIONS = [
  { value: "lab_reports", label: "Lab reports / batch documentation" },
  { value: "price", label: "Price" },
  { value: "availability", label: "Product availability" },
  { value: "clear_info", label: "Clear product information" },
  { value: "shipping_info", label: "Shipping / fulfillment information" },
  { value: "credibility", label: "PSL Labs seemed credible" },
  { value: "recommendation", label: "Recommendation from someone else" },
  { value: "other", label: "Other" },
] as const;

export type PurchaseDriverValue =
  (typeof PURCHASE_DRIVER_OPTIONS)[number]["value"];

export const OPEN_FEEDBACK_MAX_LENGTH = 750;

export const DISCOVERY_SOURCE_VALUES = new Set<string>(
  DISCOVERY_SOURCE_OPTIONS.map((o) => o.value)
);

export const PURCHASE_DRIVER_VALUES = new Set<string>(
  PURCHASE_DRIVER_OPTIONS.map((o) => o.value)
);

export function discoverySourceLabel(value: string | null): string {
  if (!value) return "";
  return (
    DISCOVERY_SOURCE_OPTIONS.find((o) => o.value === value)?.label ?? value
  );
}

export function purchaseDriverLabel(value: string): string {
  return (
    PURCHASE_DRIVER_OPTIONS.find((o) => o.value === value)?.label ?? value
  );
}
