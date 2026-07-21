import type { Order } from "@/lib/orders/types";

function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

/**
 * Email line shown only when a discount was stored on the order.
 * Example: Discount code used: SUMMER20 (-20%, -$12.00)
 */
export function formatDiscountEmailLine(order: Order): string | null {
  const code = order.discountCode?.trim();
  if (!code || !(order.discountAmount > 0)) return null;

  const percent =
    order.subtotal > 0
      ? Math.round((order.discountAmount / order.subtotal) * 100)
      : 0;

  return `Discount code used: ${code} (-${percent}%, -${money(order.discountAmount)})`;
}
