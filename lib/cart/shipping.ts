import { computeTotals, roundMoney } from "@/lib/checkout/totals";
import { formatPrice } from "./format";
import type { ShippingDisplay } from "./types";

export function getSubtotal(
  lines: { unitPrice: number; quantity: number }[]
): number {
  return roundMoney(lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0));
}

export function getShippingDisplay(subtotal: number): ShippingDisplay {
  if (subtotal <= 0) {
    return { message: "Add items to estimate shipping", isFreeShipping: false };
  }

  const totals = computeTotals(subtotal);
  if (totals.shipping === 0) {
    return {
      message: "Free shipping applied",
      isFreeShipping: true,
    };
  }

  return {
    message: `${formatPrice(totals.shipping)} standard U.S. shipping`,
    isFreeShipping: false,
  };
}

export function getEstimatedTotal(subtotal: number): number {
  // Payment method and promotion choices are made at checkout. Use the same
  // undiscounted shipping/tax rules here without charging shipping on an empty cart.
  return subtotal <= 0 ? 0 : computeTotals(subtotal).total;
}
