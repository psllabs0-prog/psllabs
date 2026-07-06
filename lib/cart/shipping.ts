import { FREE_SHIPPING_THRESHOLD } from "./constants";
import type { ShippingDisplay } from "./types";

export function getSubtotal(
  lines: { unitPrice: number; quantity: number }[]
): number {
  return lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
}

export function getShippingDisplay(subtotal: number): ShippingDisplay {
  if (subtotal >= FREE_SHIPPING_THRESHOLD) {
    return {
      message: "Free shipping applied",
      isFreeShipping: true,
    };
  }

  return {
    message: "Shipping calculated after shipping information is entered",
    isFreeShipping: false,
  };
}

export function getEstimatedTotal(subtotal: number): number {
  return subtotal;
}
