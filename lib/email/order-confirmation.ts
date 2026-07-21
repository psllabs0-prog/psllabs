import nodemailer from "nodemailer";

import { formatDiscountEmailLine } from "@/lib/email/discount-line";
import type { Order } from "@/lib/orders/types";

const FROM_EMAIL = "PSL Labs <support@psllabs.org>";
const SUPPORT_EMAIL = "support@psllabs.org";

function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

function shippingLabel(n: number): string {
  return n > 0 ? money(n) : "Free";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function createSmtpTransport() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  if (!host || !user || !pass) {
    throw new Error("SMTP is not configured for order confirmations.");
  }
  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    requireTLS: true,
    auth: { user, pass },
  });
}

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

  const name = `${order.shipping.firstName} ${order.shipping.lastName}`.trim();
  const greeting = name ? `Hi ${name},` : "Hi,";

  const itemRows = order.items
    .map(
      (it) => `
      <tr>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;">${escapeHtml(it.name)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;">${escapeHtml(it.strength || "—")}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:center;">${it.quantity}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:right;">${money(it.unitPrice)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:right;">${money(it.lineTotal)}</td>
      </tr>`
    )
    .join("");

  const taxRow =
    order.tax > 0
      ? `<tr><td colspan="4" style="padding:4px 8px;text-align:right;">Tax</td><td style="padding:4px 8px;text-align:right;">${money(order.tax)}</td></tr>`
      : "";

  const discountLine = formatDiscountEmailLine(order);

  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;color:#0b1220;line-height:1.5;">
    <p style="margin:0 0 12px;">${escapeHtml(greeting)}</p>
    <p style="margin:0 0 16px;">
      Thanks for your order! Here's your confirmation. We'll notify you when it ships.
    </p>
    <h2 style="margin:0 0 12px;font-size:18px;">Order #${escapeHtml(order.orderId)}</h2>
    <p style="margin:12px 0 4px;"><strong>Ship to:</strong></p>
    <p style="margin:0 0 16px;white-space:pre-line;">${escapeHtml(
      `${order.shipping.firstName} ${order.shipping.lastName}\n${order.shipping.address}\n${order.shipping.city}, ${order.shipping.state} ${order.shipping.zip}\n${order.shipping.country}`
    )}</p>
    <table style="border-collapse:collapse;width:100%;font-size:14px;">
      <thead><tr style="background:#f1f5f9;">
        <th style="padding:6px 8px;text-align:left;">Product</th>
        <th style="padding:6px 8px;text-align:left;">Strength</th>
        <th style="padding:6px 8px;text-align:center;">Qty</th>
        <th style="padding:6px 8px;text-align:right;">Unit</th>
        <th style="padding:6px 8px;text-align:right;">Total</th>
      </tr></thead>
      <tbody>${itemRows}</tbody>
      <tfoot>
        <tr><td colspan="4" style="padding:4px 8px;text-align:right;">Subtotal</td><td style="padding:4px 8px;text-align:right;">${money(order.subtotal)}</td></tr>
        <tr><td colspan="4" style="padding:4px 8px;text-align:right;">Shipping</td><td style="padding:4px 8px;text-align:right;">${shippingLabel(order.shippingCost)}</td></tr>
        ${taxRow}
        <tr><td colspan="4" style="padding:8px;text-align:right;font-weight:bold;">Order total</td><td style="padding:8px;text-align:right;font-weight:bold;">${money(order.total)}</td></tr>
      </tfoot>
    </table>
    ${
      discountLine
        ? `<p style="margin:16px 0 0;font-size:14px;"><strong>${escapeHtml(discountLine)}</strong></p>`
        : ""
    }
    <p style="margin:20px 0 0;font-size:13px;color:#475569;">
      Questions about your order? Reply to this email or contact
      <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>.
    </p>
  </div>`;

  const text = [
    greeting,
    "",
    "Thanks for your order! Here's your confirmation. We'll notify you when it ships.",
    "",
    `Order #${order.orderId}`,
    "",
    "Ship to:",
    `${order.shipping.firstName} ${order.shipping.lastName}`,
    order.shipping.address,
    `${order.shipping.city}, ${order.shipping.state} ${order.shipping.zip}`,
    order.shipping.country,
    "",
    ...order.items.map(
      (it) =>
        `- ${it.name} (${it.strength || "—"}) x${it.quantity} @ ${money(it.unitPrice)} = ${money(it.lineTotal)}`
    ),
    "",
    `Subtotal: ${money(order.subtotal)}`,
    `Shipping: ${shippingLabel(order.shippingCost)}`,
    ...(order.tax > 0 ? [`Tax: ${money(order.tax)}`] : []),
    `Order total: ${money(order.total)}`,
    ...(discountLine ? ["", discountLine] : []),
    "",
    `Questions? Reply to this email or contact ${SUPPORT_EMAIL}.`,
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
