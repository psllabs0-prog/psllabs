import { FREE_SHIPPING_THRESHOLD } from "@/lib/cart/constants";

export const FLAT_SHIPPING_USD = 9.99;

/** Bitcoin payments receive a 5% discount on the product subtotal before tax/shipping. */
export const BITCOIN_DISCOUNT_PERCENT = 5;

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

export type PaymentMethodOption = "bitcoin" | "btcpay" | "card" | string | null;

export type ComputeTotalsOptions = {
  paymentMethod?: PaymentMethodOption;
};

export type OrderTotals = {
  /** Product subtotal before discount. */
  subtotal: number;
  discountCode: string | null;
  discountPercent: number;
  discountAmount: number;
  /** Dedicated Bitcoin discount amount if payment method is Bitcoin. */
  bitcoinDiscountAmount: number;
  /** Dedicated Bitcoin discount percentage (5% when active, 0 otherwise). */
  bitcoinDiscountPercent: number;
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
 * If payment method is Bitcoin (or btcpay), a 5% discount is applied to the subtotal.
 * Shipping free-threshold qualifies if either raw or post-discount subtotal is >= $100.
 */
export function computeTotals(
  subtotalRaw: number,
  _state = "",
  discount: AppliedDiscount | null = null,
  options?: ComputeTotalsOptions | PaymentMethodOption
): OrderTotals {
  const subtotal = roundMoney(subtotalRaw);
  void _state;

  const paymentMethod =
    typeof options === "string" ? options : options?.paymentMethod ?? null;
  const isBitcoin = paymentMethod === "bitcoin" || paymentMethod === "btcpay";

  // 1. Promo code discount
  const promoPercent =
    discount && discount.percent > 0
      ? Math.min(100, Math.max(0, discount.percent))
      : 0;
  const promoCode = promoPercent > 0 ? discount!.code : null;
  const promoDiscountAmount =
    promoPercent > 0 ? roundMoney(subtotal * (promoPercent / 100)) : 0;

  // 2. Bitcoin 5% discount
  const bitcoinDiscountPercent = isBitcoin ? BITCOIN_DISCOUNT_PERCENT : 0;
  const bitcoinDiscountAmount = isBitcoin
    ? roundMoney(subtotal * (BITCOIN_DISCOUNT_PERCENT / 100))
    : 0;

  // Combined discount
  const combinedDiscountAmount = roundMoney(
    Math.min(subtotal, promoDiscountAmount + bitcoinDiscountAmount)
  );

  let discountCode: string | null = null;
  let discountPercent = 0;

  if (promoCode && isBitcoin) {
    discountCode = `${promoCode}+BTC`;
    discountPercent = promoPercent + bitcoinDiscountPercent;
  } else if (promoCode) {
    discountCode = promoCode;
    discountPercent = promoPercent;
  } else if (isBitcoin) {
    discountCode = "BITCOIN";
    discountPercent = BITCOIN_DISCOUNT_PERCENT;
  }

  const afterDiscount = roundMoney(
    Math.max(0, subtotal - combinedDiscountAmount)
  );

  // Tax intentionally not itemized. Arizona TPT is absorbed in pricing.
  // To re-enable itemized AZ tax, compute tax from `afterDiscount`.
  const taxRate = 0;
  const tax = 0;
  const shipping =
    subtotal >= FREE_SHIPPING_THRESHOLD ||
    afterDiscount >= FREE_SHIPPING_THRESHOLD
      ? 0
      : FLAT_SHIPPING_USD;
  const total = roundMoney(afterDiscount + tax + shipping);

  return {
    subtotal,
    discountCode,
    discountPercent,
    discountAmount: combinedDiscountAmount,
    bitcoinDiscountAmount,
    bitcoinDiscountPercent,
    taxRate,
    tax,
    shipping,
    total,
  };
}
