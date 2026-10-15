import type { ShippingMethod, ShippingSelection } from "./types";

export const PRIORITY_ORIGIN_ZIP = "85016";
export const PRIORITY_PACKAGE = { weightOz: 8, lengthIn: 6, widthIn: 4, heightIn: 3 } as const;
export const PRIORITY_MAX_UNITS = 10;
export const PRIORITY_BASE_SHIPPING_USD = 24.99;
export const PRIORITY_DISCOUNTED_SHIPPING_USD = 22.99;
export const PACKAGING_LANDED_COST_USD = 0.50808;
export const PRIORITY_QUOTE_TTL_MS = 5 * 60 * 1000;

/** Prices are USD cents; exactly $100 after merchandise discounts stays at $24.99. */
export function getPriorityShippingPriceUsd(afterDiscountCents: number): number {
  if (!Number.isSafeInteger(afterDiscountCents) || afterDiscountCents < 0) throw new Error("Invalid merchandise amount.");
  return afterDiscountCents > 10_000 ? PRIORITY_DISCOUNTED_SHIPPING_USD : PRIORITY_BASE_SHIPPING_USD;
}

export function normalizeShippingMethod(value: unknown): ShippingMethod | null {
  return value === undefined || value === null ? "standard"
    : value === "standard" || value === "priority" ? value : null;
}

export function standardShippingSelection(): ShippingSelection {
  return { method: "standard", carrier: "USPS", providerServiceCode: "GroundAdvantage",
    serviceDisplayName: "USPS Ground Advantage", transitDays: null,
    deliveryEstimate: "Estimated 2–5 business days after carrier acceptance in the contiguous U.S.; Alaska and Hawaii may take longer. Not guaranteed.",
    quotedPostageUsd: null, package: null, quotedAt: null, quoteExpiresAt: null };
}

/** No fuzzy matching: Express and flat-rate variants require separate verification. */
export function isPriorityServiceCode(value: unknown): value is string {
  return typeof value === "string" && ["priority", "prioritymail"].includes(value.replace(/[ _-]/g, "").toLowerCase());
}

/** A new paid offer needs an actual bounded, whole-day carrier estimate. */
export function readPriorityTransitDays(value: unknown): number | null {
  const days = typeof value === "number" ? value : typeof value === "string" && /^\d+$/.test(value.trim()) ? Number(value.trim()) : null;
  return days !== null && Number.isInteger(days) && days >= 1 && days <= 30 ? days : null;
}

/** Round each cost upward to cents so fractional packaging/reserve costs cannot hide a loss. */
export function priorityCostCovered(postageUsd: number, shippingPriceUsd: number, extraCostReserveUsd: number): boolean {
  if (![postageUsd, shippingPriceUsd, extraCostReserveUsd].every(value => Number.isFinite(value) && value >= 0)) return false;
  const centsUp = (value: number) => Math.ceil(value * 100 - 1e-8);
  return centsUp(postageUsd) + centsUp(PACKAGING_LANDED_COST_USD) + centsUp(extraCostReserveUsd) <= Math.round(shippingPriceUsd * 100);
}

/** Explicit projection for stored data and public receipts; never serialize an address wholesale. */
export function readShippingSelection(value: unknown): ShippingSelection | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (raw.method !== "standard" && raw.method !== "priority") return null;
  if (!(raw.carrier === "USPS" || raw.carrier === null) ||
      !(raw.providerServiceCode === null || typeof raw.providerServiceCode === "string" && /^[A-Za-z0-9 _-]{1,100}$/.test(raw.providerServiceCode)) ||
      typeof raw.serviceDisplayName !== "string" || !raw.serviceDisplayName || raw.serviceDisplayName.length > 100 ||
      !(raw.transitDays === null || Number.isInteger(raw.transitDays) && Number(raw.transitDays) > 0 && Number(raw.transitDays) <= 30) ||
      !(raw.deliveryEstimate === null || typeof raw.deliveryEstimate === "string" && raw.deliveryEstimate.length <= 200) ||
      !(raw.quotedPostageUsd === null || typeof raw.quotedPostageUsd === "number" && Number.isFinite(raw.quotedPostageUsd) && raw.quotedPostageUsd > 0) ||
      ![raw.quotedAt, raw.quoteExpiresAt].every(date => date === null || typeof date === "string" && Number.isFinite(Date.parse(date)) && new Date(date).toISOString() === date) ||
      !(raw.tagadaShippingRateId === undefined || typeof raw.tagadaShippingRateId === "string" && /^[A-Za-z0-9_.:-]{1,150}$/.test(raw.tagadaShippingRateId))) return null;
  let pkg = null;
  if (raw.package !== null) {
    if (!raw.package || typeof raw.package !== "object" || Array.isArray(raw.package)) return null;
    const item = raw.package as Record<string, unknown>;
    if (![item.weightOz, item.lengthIn, item.widthIn, item.heightIn].every(value => typeof value === "number" && Number.isFinite(value) && value > 0 && value < 1000)) return null;
    pkg = { weightOz: Number(item.weightOz), lengthIn: Number(item.lengthIn), widthIn: Number(item.widthIn), heightIn: Number(item.heightIn) };
  }
  if (raw.method === "priority" && (raw.carrier !== "USPS" || !isPriorityServiceCode(raw.providerServiceCode) ||
      !pkg || raw.quotedPostageUsd === null || raw.quotedAt === null || raw.quoteExpiresAt === null)) return null;
  return { method: raw.method, carrier: raw.carrier, providerServiceCode: raw.providerServiceCode as string | null,
    serviceDisplayName: raw.serviceDisplayName, transitDays: raw.transitDays as number | null,
    deliveryEstimate: raw.deliveryEstimate as string | null, quotedPostageUsd: raw.quotedPostageUsd as number | null,
    package: pkg, quotedAt: raw.quotedAt as string | null, quoteExpiresAt: raw.quoteExpiresAt as string | null,
    ...(raw.tagadaShippingRateId ? { tagadaShippingRateId: raw.tagadaShippingRateId as string } : {}) };
}
