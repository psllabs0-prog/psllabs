import type { Order } from "@/lib/orders/types";

function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

/**
 * Email line shown only when a discount was stored on the order.
 * Example:
 * - Bitcoin discount (5%): -$3.00
 * - Discount code used: SUMMER20 (-20%, -$12.00)
 */
export function formatDiscountEmailLine(order: Order): string | null {
  if (!(order.discountAmount > 0)) return null;

  const code = order.discountCode?.trim();
  if (code === "BITCOIN" || order.paymentMethod === "bitcoin") {
    return `Bitcoin discount (5%): -${money(order.discountAmount)}`;
  }

  if (!code) return null;

  const percent =
    order.subtotal > 0
      ? Math.round((order.discountAmount / order.subtotal) * 100)
      : 0;

  return `Discount code used: ${code} (-${percent}%, -${money(order.discountAmount)})`;
}
