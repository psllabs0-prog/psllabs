import { FREE_SHIPPING_THRESHOLD } from "@/lib/cart/constants";

export const FLAT_SHIPPING_USD = 9.99;

// 2026 Phoenix, AZ combined Transaction Privilege Tax (TPT) rate.
// Applied historically to the product subtotal only — shipping was not taxed.
// REVIEW whenever Arizona / Phoenix tax rates change.
//
// Arizona TPT is currently absorbed in pricing rather than itemized at
// checkout. Kept here with calculateArizonaTpt() so we can re-enable easily.
export const AZ_TPT_RATE = 0.091;

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Arizona TPT on product subtotal (shipping excluded).
 * Currently unused — Arizona TPT is absorbed in pricing rather than itemized.
 * Re-enable from computeTotals when policy requires an itemized tax line.
 */
export function calculateArizonaTpt(subtotal: number): number {
  return roundMoney(subtotal * AZ_TPT_RATE);
}

export type OrderTotals = {
  subtotal: number;
  /** Always 0 while tax is absorbed in pricing; kept for easy re-enable. */
  taxRate: number;
  /** Always 0 while tax is absorbed in pricing; kept for easy re-enable. */
  tax: number;
  shipping: number;
  total: number;
};

/**
 * Compute order totals from a raw subtotal.
 * Shipping is free at or above FREE_SHIPPING_THRESHOLD, otherwise flat rate.
 * Total = subtotal + shipping only (no itemized tax).
 */
export function computeTotals(subtotalRaw: number, _state = ""): OrderTotals {
  const subtotal = roundMoney(subtotalRaw);
  // Tax intentionally not itemized. Arizona TPT is absorbed in pricing.
  // To re-enable itemized AZ tax:
  //   const taxRate = _state.trim().toUpperCase() === "AZ" ? AZ_TPT_RATE : 0;
  //   const tax = taxRate > 0 ? calculateArizonaTpt(subtotal) : 0;
  //   const total = roundMoney(subtotal + tax + shipping);
  void _state;
  const taxRate = 0;
  const tax = 0;
  const shipping = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : FLAT_SHIPPING_USD;
  const total = roundMoney(subtotal + shipping);
  return { subtotal, taxRate, tax, shipping, total };
}
