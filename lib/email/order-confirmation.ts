import { LEGAL_ENTITY_NAME } from "@/lib/content/testing-scope";
import { formatDiscountEmailLine } from "@/lib/email/discount-line";
import { buildOrderDocumentation, ORDER_TRACKING_URL } from "@/lib/email/order-documentation";
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
const TRACK_URL = ORDER_TRACKING_URL;

/**
 * Customer-facing order confirmation.
 * Pure preview of the customer confirmation sent after verified paid-order fulfillment.
 */
export function buildCustomerOrderConfirmationEmail(order: Order) {
  const { border, surface, muted, accent } = EMAIL_COLORS;
  const name = `${order.shipping.firstName} ${order.shipping.lastName}`.trim();
  const greeting = name ? `Hi ${name},` : "Hi,";
  const orderDate = formatOrderDate(order.createdAt);
  const shipSummary = formatPartialShippingAddress(order.shipping);
  const documentation = buildOrderDocumentation();

  const itemRows = order.items
    .map((it) => {
      const sku = getCatalogProductByHandle(it.handle)?.sku ?? it.handle;
      return `
      <tr>
        <td style="padding:8px;border-bottom:1px solid ${border};vertical-align:top;">
          <strong>${escapeHtml(it.name)}</strong><br/>
          <span style="font-size:12px;color:${muted};">Strength: ${escapeHtml(it.strength || "—")}<br/>
          SKU: ${escapeHtml(sku)}<br/>
          Unit: ${money(it.unitPrice)}</span>
        </td>
        <td style="padding:8px 4px;border-bottom:1px solid ${border};text-align:center;vertical-align:top;">${it.quantity}</td>
        <td style="padding:8px 4px;border-bottom:1px solid ${border};text-align:right;vertical-align:top;font-family:monospace;">${money(it.lineTotal)}</td>
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
      <p style="margin:0 0 12px;font-family:monospace;font-size:15px;overflow-wrap:anywhere;word-break:break-word;">${escapeHtml(order.orderId)}</p>
      <p style="margin:0 0 4px;font-size:13px;color:${muted};">Order date</p>
      <p style="margin:0;font-size:15px;">${escapeHtml(orderDate)}</p>
    </div>
    <table style="border-collapse:collapse;table-layout:fixed;width:100%;font-size:14px;margin-bottom:16px;overflow-wrap:anywhere;word-break:break-word;">
      <thead><tr style="background:${surface};">
        <th scope="col" style="width:60%;padding:8px;text-align:left;border-bottom:1px solid ${border};">Product</th>
        <th scope="col" style="width:12%;padding:8px 4px;text-align:center;border-bottom:1px solid ${border};">Qty</th>
        <th scope="col" style="width:28%;padding:8px 4px;text-align:right;border-bottom:1px solid ${border};">Total</th>
      </tr></thead>
      <tbody>${itemRows}</tbody>
      <tfoot>
        <tr><td colspan="2" style="padding:6px 8px;text-align:right;color:${muted};">Subtotal</td><td style="padding:6px 4px;text-align:right;font-family:monospace;">${money(order.subtotal)}</td></tr>
        ${
          order.discountAmount > 0
            ? `<tr><td colspan="2" style="padding:6px 8px;text-align:right;color:${accent};">${order.discountCode === "BITCOIN" || order.paymentMethod === "bitcoin" ? "Bitcoin discount (5%)" : `Discount (${escapeHtml(order.discountCode || "Promo")})`}</td><td style="padding:6px 4px;text-align:right;font-family:monospace;color:${accent};">-${money(order.discountAmount)}</td></tr>`
            : ""
        }
        <tr><td colspan="2" style="padding:6px 8px;text-align:right;color:${muted};">Shipping</td><td style="padding:6px 4px;text-align:right;font-family:monospace;">${shippingLabel(order.shippingCost)}</td></tr>
        <tr><td colspan="2" style="padding:10px 8px;text-align:right;font-weight:bold;">Order total</td><td style="padding:10px 4px;text-align:right;font-weight:bold;font-family:monospace;">${money(order.total)}</td></tr>
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
      <a href="${escapeHtml(TRACK_URL)}" style="color:${accent};">Check your order status</a>
      using your order number and the email address used at checkout.
    </p>
    ${documentation.html}
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
    `Check your order status: ${TRACK_URL}`,
    "Use your order number and the email address used at checkout.",
    "",
    documentation.text,
    "",
    `Questions? Reply to this email or contact ${SUPPORT_EMAIL}.`,
    "",
    LEGAL_FOOTER,
  ].join("\n");

  return { subject: `Your PSL Labs order #${order.orderId} is confirmed`, text, html };
}

/** Throws on failure so verified fulfillment can record the error and allow a retry. */
export async function sendCustomerOrderConfirmation(order: Order): Promise<void> {
  const to = order.email.trim();
  if (!to) throw new Error("Order has no customer email for confirmation.");
  const built = buildCustomerOrderConfirmationEmail(order);
  const transporter = createSmtpTransport();
  await transporter.sendMail({
    from: FROM_EMAIL,
    to,
    replyTo: SUPPORT_EMAIL,
    ...built,
  });
}
