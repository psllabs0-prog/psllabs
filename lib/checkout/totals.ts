import { FREE_SHIPPING_THRESHOLD } from "@/lib/cart/constants";

export const FLAT_SHIPPING_USD = 9.99;

// 2026 Phoenix, AZ combined Transaction Privilege Tax (TPT) rate.
// Applied to the product subtotal only — shipping is stated separately and not taxed.
// REVIEW whenever Arizona / Phoenix tax rates change.
export const AZ_TPT_RATE = 0.091;

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export type OrderTotals = {
  subtotal: number;
  taxRate: number;
  tax: number;
  shipping: number;
  total: number;
};

/**
 * Compute order totals from a raw subtotal and ship-to state.
 * Shipping is free at or above FREE_SHIPPING_THRESHOLD, otherwise flat rate.
 * Tax applies to the product subtotal only for Arizona addresses.
 */
export function computeTotals(subtotalRaw: number, state: string): OrderTotals {
  const subtotal = roundMoney(subtotalRaw);
  const taxRate = state.trim().toUpperCase() === "AZ" ? AZ_TPT_RATE : 0;
  const tax = roundMoney(subtotal * taxRate);
  const shipping = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : FLAT_SHIPPING_USD;
  const total = roundMoney(subtotal + tax + shipping);
  return { subtotal, taxRate, tax, shipping, total };
}
