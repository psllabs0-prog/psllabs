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

export type AppliedDiscount = {
  code: string;
  percent: number;
};

export type OrderTotals = {
  /** Product subtotal before discount. */
  subtotal: number;
  discountCode: string | null;
  discountPercent: number;
  discountAmount: number;
  /** Always 0 while tax is absorbed in pricing; kept for easy re-enable. */
  taxRate: number;
  /** Always 0 while tax is absorbed in pricing; kept for easy re-enable. */
  tax: number;
  shipping: number;
  total: number;
};

/**
 * Compute order totals from a raw product subtotal.
 * Discount applies to the product subtotal before tax.
 * Shipping free-threshold uses the post-discount subtotal.
 */
export function computeTotals(
  subtotalRaw: number,
  _state = "",
  discount: AppliedDiscount | null = null
): OrderTotals {
  const subtotal = roundMoney(subtotalRaw);
  void _state;

  const discountCode =
    discount && discount.percent > 0 ? discount.code : null;
  const discountPercent =
    discountCode && discount ? Math.min(100, Math.max(0, discount.percent)) : 0;
  const discountAmount =
    discountPercent > 0
      ? roundMoney(subtotal * (discountPercent / 100))
      : 0;
  const afterDiscount = roundMoney(Math.max(0, subtotal - discountAmount));

  // Tax intentionally not itemized. Arizona TPT is absorbed in pricing.
  // To re-enable itemized AZ tax, compute tax from `afterDiscount`.
  const taxRate = 0;
  const tax = 0;
  const shipping =
    afterDiscount >= FREE_SHIPPING_THRESHOLD ? 0 : FLAT_SHIPPING_USD;
  const total = roundMoney(afterDiscount + tax + shipping);

  return {
    subtotal,
    discountCode,
    discountPercent,
    discountAmount,
    taxRate,
    tax,
    shipping,
    total,
  };
}
