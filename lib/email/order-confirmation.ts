import { LEGAL_ENTITY_NAME } from "@/lib/content/testing-scope";
import { formatDiscountEmailLine } from "@/lib/email/discount-line";
import {
  createSmtpTransport,
  EMAIL_COLORS,
  escapeHtml,
  FROM_EMAIL,
  money,
  shippingLabel,
  SUPPORT_EMAIL,
  emailPageWrapper,
} from "@/lib/email/shared";
import {
  formatOrderDate,
  formatPartialShippingAddress,
} from "@/lib/orders/tracking";
import { getCatalogProductByHandle } from "@/lib/products/catalog";
import type { Order } from "@/lib/orders/types";

const LEGAL_FOOTER = `${LEGAL_ENTITY_NAME} — Phoenix, AZ. All products are for laboratory research use only. Not for human or animal consumption.`;
const TRACK_URL = "https://www.psllabs.org/track";

/**
 * Customer-facing order confirmation.
 * Must only be called from the verified webhook handler on InvoiceSettled.
 * Throws on failure so the caller can record the error and allow a retry.
 */
export async function sendCustomerOrderConfirmation(
  order: Order
): Promise<void> {
  const to = order.email.trim();
  if (!to) {
    throw new Error("Order has no customer email for confirmation.");
  }

  const { border, surface, muted, accent } = EMAIL_COLORS;
  const name = `${order.shipping.firstName} ${order.shipping.lastName}`.trim();
  const greeting = name ? `Hi ${name},` : "Hi,";
  const orderDate = formatOrderDate(order.createdAt);
  const shipSummary = formatPartialShippingAddress(order.shipping);

  const itemRows = order.items
    .map((it) => {
      const sku = getCatalogProductByHandle(it.handle)?.sku ?? it.handle;
      return `
      <tr>
        <td style="padding:8px;border-bottom:1px solid ${border};">${escapeHtml(it.name)}</td>
        <td style="padding:8px;border-bottom:1px solid ${border};font-family:monospace;font-size:12px;">${escapeHtml(sku)}</td>
        <td style="padding:8px;border-bottom:1px solid ${border};">${escapeHtml(it.strength || "—")}</td>
        <td style="padding:8px;border-bottom:1px solid ${border};text-align:center;">${it.quantity}</td>
        <td style="padding:8px;border-bottom:1px solid ${border};text-align:right;font-family:monospace;">${money(it.unitPrice)}</td>
        <td style="padding:8px;border-bottom:1px solid ${border};text-align:right;font-family:monospace;">${money(it.lineTotal)}</td>
      </tr>`;
    })
    .join("");

  const discountLine = formatDiscountEmailLine(order);

  const html = emailPageWrapper(`
    <p style="margin:0 0 12px;">${escapeHtml(greeting)}</p>
    <p style="margin:0 0 20px;color:${muted};">
      Thank you for your order. We&apos;ll notify you when it ships.
    </p>
    <div style="background:${surface};border:1px solid ${border};border-radius:8px;padding:16px;margin-bottom:20px;">
      <p style="margin:0 0 4px;font-size:13px;color:${muted};">Order number</p>
      <p style="margin:0 0 12px;font-family:monospace;font-size:15px;">${escapeHtml(order.orderId)}</p>
      <p style="margin:0 0 4px;font-size:13px;color:${muted};">Order date</p>
      <p style="margin:0;font-size:15px;">${escapeHtml(orderDate)}</p>
    </div>
    <table style="border-collapse:collapse;width:100%;font-size:14px;margin-bottom:16px;">
      <thead><tr style="background:${surface};">
        <th style="padding:8px;text-align:left;border-bottom:1px solid ${border};">Product</th>
        <th style="padding:8px;text-align:left;border-bottom:1px solid ${border};">SKU</th>
        <th style="padding:8px;text-align:left;border-bottom:1px solid ${border};">Strength</th>
        <th style="padding:8px;text-align:center;border-bottom:1px solid ${border};">Qty</th>
        <th style="padding:8px;text-align:right;border-bottom:1px solid ${border};">Unit</th>
        <th style="padding:8px;text-align:right;border-bottom:1px solid ${border};">Total</th>
      </tr></thead>
      <tbody>${itemRows}</tbody>
      <tfoot>
        <tr><td colspan="5" style="padding:6px 8px;text-align:right;color:${muted};">Subtotal</td><td style="padding:6px 8px;text-align:right;font-family:monospace;">${money(order.subtotal)}</td></tr>
        ${
          order.discountAmount > 0
            ? `<tr><td colspan="5" style="padding:6px 8px;text-align:right;color:${accent};">${order.discountCode === "BITCOIN" || order.paymentMethod === "bitcoin" ? "Bitcoin discount (5%)" : `Discount (${escapeHtml(order.discountCode || "Promo")})`}</td><td style="padding:6px 8px;text-align:right;font-family:monospace;color:${accent};">-${money(order.discountAmount)}</td></tr>`
            : ""
        }
        <tr><td colspan="5" style="padding:6px 8px;text-align:right;color:${muted};">Shipping</td><td style="padding:6px 8px;text-align:right;font-family:monospace;">${shippingLabel(order.shippingCost)}</td></tr>
        <tr><td colspan="5" style="padding:10px 8px;text-align:right;font-weight:bold;">Order total</td><td style="padding:10px 8px;text-align:right;font-weight:bold;font-family:monospace;">${money(order.total)}</td></tr>
      </tfoot>
    </table>
    ${
      discountLine
        ? `<p style="margin:0 0 16px;font-size:14px;"><strong>${escapeHtml(discountLine)}</strong></p>`
        : ""
    }
    <p style="margin:0 0 4px;font-size:13px;color:${muted};">Ship to</p>
    <p style="margin:0 0 20px;white-space:pre-line;font-size:14px;">${escapeHtml(shipSummary)}</p>
    <p style="margin:0 0 20px;font-size:13px;color:${muted};line-height:1.6;">
      Batch documentation is available in your account area / COA lookup.
      Track your order anytime at
      <a href="${TRACK_URL}" style="color:${accent};">${TRACK_URL.replace("https://", "")}</a>.
    </p>
    <p style="margin:0 0 16px;font-size:13px;color:${muted};">
      Questions? Reply to this email or contact
      <a href="mailto:${SUPPORT_EMAIL}" style="color:${accent};">${SUPPORT_EMAIL}</a>.
    </p>
    <p style="margin:0;font-size:11px;color:${muted};line-height:1.5;">
      ${escapeHtml(LEGAL_FOOTER)}
    </p>`);

  const text = [
    greeting,
    "",
    "Thank you for your order. We'll notify you when it ships.",
    "",
    `Order number: ${order.orderId}`,
    `Order date: ${orderDate}`,
    "",
    ...order.items.map((it) => {
      const sku = getCatalogProductByHandle(it.handle)?.sku ?? it.handle;
      return `- ${it.name} (${sku}, ${it.strength || "—"}) x${it.quantity} @ ${money(it.unitPrice)} = ${money(it.lineTotal)}`;
    }),
    "",
    `Subtotal: ${money(order.subtotal)}`,
    ...(order.discountAmount > 0
      ? [
          `${order.discountCode === "BITCOIN" || order.paymentMethod === "bitcoin" ? "Bitcoin discount (5%)" : `Discount (${order.discountCode || "Promo"})`}: -${money(order.discountAmount)}`,
        ]
      : []),
    `Shipping: ${shippingLabel(order.shippingCost)}`,
    `Order total: ${money(order.total)}`,
    ...(discountLine ? ["", discountLine] : []),
    "",
    "Ship to:",
    shipSummary,
    "",
    "Batch documentation is available in your account area / COA lookup. Track your order anytime at psllabs.org/track.",
    "",
    `Questions? Reply to this email or contact ${SUPPORT_EMAIL}.`,
    "",
    LEGAL_FOOTER,
  ].join("\n");

  const transporter = createSmtpTransport();
  await transporter.sendMail({
    from: FROM_EMAIL,
    to,
    replyTo: SUPPORT_EMAIL,
    subject: `Your PSL Labs order #${order.orderId} is confirmed`,
    text,
    html,
  });
}
