/**
 * Order receipt email — PLACEHOLDER ONLY
 *
 * Do not connect Resend, SendGrid, SMTP, or any mail provider until checkout
 * and payment are approved for production use.
 *
 * Future integration should send from support@psllabs.org and include the
 * fields defined in OrderReceiptPayload below.
 */

import type { CartLineWithMeta } from "@/lib/cart/types";

export type OrderReceiptPaymentStatus =
  | "pending"
  | "paid"
  | "failed"
  | "unavailable";

export type OrderReceiptPayload = {
  orderNumber: string;
  customerEmail: string;
  items: Pick<
    CartLineWithMeta,
    "name" | "strength" | "quantity" | "unitPrice"
  >[];
  subtotal: number;
  shipping: string;
  total: number;
  paymentStatus: OrderReceiptPaymentStatus;
  supportEmail: "support@psllabs.org";
};

/**
 * Example future usage (not wired):
 *
 * ```ts
 * // await sendOrderReceiptEmail({
 * //   orderNumber: "PSL-20260706-001",
 * //   customerEmail: "researcher@lab.example",
 * //   items: cartLines.map(({ name, strength, quantity, unitPrice }) => ({
 * //     name,
 * //     strength,
 * //     quantity,
 * //     unitPrice,
 * //   })),
 * //   subtotal: 188,
 * //   shipping: "Free shipping applied",
 * //   total: 188,
 * //   paymentStatus: "pending",
 * //   supportEmail: "support@psllabs.org",
 * // });
 * ```
 */
export async function sendOrderReceiptEmail(
  _payload: OrderReceiptPayload
): Promise<void> {
  throw new Error(
    "Order receipt emails are not enabled. Connect an approved provider after checkout goes live."
  );
}

export function formatOrderReceiptPreview(payload: OrderReceiptPayload): string {
  const lines = [
    `Order ${payload.orderNumber}`,
    `To: ${payload.customerEmail}`,
    "",
    ...payload.items.map(
      (item) =>
        `${item.name} (${item.strength}) × ${item.quantity} — $${item.unitPrice * item.quantity}`
    ),
    "",
    `Subtotal: $${payload.subtotal}`,
    `Shipping: ${payload.shipping}`,
    `Total: $${payload.total}`,
    `Payment: ${payload.paymentStatus}`,
    "",
    `Questions: ${payload.supportEmail}`,
  ];

  return lines.join("\n");
}
