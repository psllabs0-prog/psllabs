import nodemailer from "nodemailer";

import { getStockLevels } from "@/lib/inventory/store";
import type { Order } from "@/lib/orders/types";

const FROM_EMAIL = "PSL Labs Orders <support@psllabs.org>";
const DEFAULT_TO = "support@psllabs.org";

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

/**
 * Send the internal order notification to support@psllabs.org.
 * Must only be called from the verified webhook handler on InvoiceSettled.
 * Throws on failure so the caller can record the error and allow a retry.
 */
export async function sendOrderEmail(order: Order): Promise<void> {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  if (!host || !user || !pass) {
    throw new Error("SMTP is not configured for order notifications.");
  }

  const to = process.env.ORDER_NOTIFICATION_EMAIL || DEFAULT_TO;
  const btcpayUrl = (process.env.BTCPAY_URL ?? "").replace(/\/+$/, "");
  const invoiceLink =
    btcpayUrl && order.invoiceId
      ? `${btcpayUrl}/invoices/${order.invoiceId}`
      : "";
  const placedAt = new Date(order.paidAt ?? order.createdAt).toUTCString();
  const name = `${order.shipping.firstName} ${order.shipping.lastName}`.trim();
  const stockLevels = await getStockLevels(order.items.map((it) => it.handle));

  const rows = order.items
    .map(
      (it) => {
        const remaining = stockLevels[it.handle];
        const stockNote =
          remaining !== null && remaining !== undefined
            ? `Stock remaining: ${remaining}`
            : "";
        return `
      <tr>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;">${escapeHtml(it.name)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;">${escapeHtml(it.strength || "—")}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:center;">${it.quantity}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:right;">${money(it.unitPrice)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:right;">${money(it.lineTotal)}</td>
      </tr>
      ${stockNote ? `<tr><td colspan="5" style="padding:0 8px 8px;font-size:12px;color:#64748b;">${escapeHtml(stockNote)}</td></tr>` : ""}`;
      }
    )
    .join("");

  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;color:#0b1220;line-height:1.5;">
    <h2 style="margin:0 0 12px;">New paid order #${escapeHtml(order.orderId)}</h2>
    <p style="margin:0 0 4px;"><strong>Placed:</strong> ${escapeHtml(placedAt)}</p>
    <p style="margin:0 0 4px;"><strong>Customer:</strong> ${escapeHtml(name)}</p>
    <p style="margin:0 0 4px;"><strong>Email:</strong> ${escapeHtml(order.email)}</p>
    <p style="margin:12px 0 4px;"><strong>Ship to:</strong></p>
    <p style="margin:0 0 12px;white-space:pre-line;">${escapeHtml(
      `${order.shipping.address}\n${order.shipping.city}, ${order.shipping.state} ${order.shipping.zip}\n${order.shipping.country}`
    )}</p>
    <table style="border-collapse:collapse;width:100%;font-size:14px;">
      <thead><tr style="background:#f1f5f9;">
        <th style="padding:6px 8px;text-align:left;">Product</th>
        <th style="padding:6px 8px;text-align:left;">Strength</th>
        <th style="padding:6px 8px;text-align:center;">Qty</th>
        <th style="padding:6px 8px;text-align:right;">Unit</th>
        <th style="padding:6px 8px;text-align:right;">Total</th>
      </tr></thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr><td colspan="4" style="padding:4px 8px;text-align:right;">Subtotal</td><td style="padding:4px 8px;text-align:right;">${money(order.subtotal)}</td></tr>
        <tr><td colspan="4" style="padding:4px 8px;text-align:right;">Shipping</td><td style="padding:4px 8px;text-align:right;">${shippingLabel(order.shippingCost)}</td></tr>
        <tr><td colspan="4" style="padding:8px;text-align:right;font-weight:bold;">Order total</td><td style="padding:8px;text-align:right;font-weight:bold;">${money(order.total)}</td></tr>
      </tfoot>
    </table>
    <p style="margin:12px 0 4px;"><strong>BTCPay invoice:</strong> ${escapeHtml(order.invoiceId ?? "—")}</p>
    ${invoiceLink ? `<p style="margin:0;"><a href="${invoiceLink}">${escapeHtml(invoiceLink)}</a></p>` : ""}
  </div>`;

  const text = [
    `New paid order #${order.orderId}`,
    `Placed: ${placedAt}`,
    `Customer: ${name}`,
    `Email: ${order.email}`,
    "",
    "Ship to:",
    order.shipping.address,
    `${order.shipping.city}, ${order.shipping.state} ${order.shipping.zip}`,
    order.shipping.country,
    "",
    ...order.items.flatMap((it) => {
      const remaining = stockLevels[it.handle];
      const stockNote =
        remaining !== null && remaining !== undefined
          ? ` (stock remaining: ${remaining})`
          : "";
      return [
        `- ${it.name} (${it.strength || "—"}) x${it.quantity} @ ${money(it.unitPrice)} = ${money(it.lineTotal)}${stockNote}`,
      ];
    }),
    "",
    `Subtotal: ${money(order.subtotal)}`,
    `Shipping: ${shippingLabel(order.shippingCost)}`,
    `Order total: ${money(order.total)}`,
    "",
    `BTCPay invoice: ${order.invoiceId ?? "—"}`,
    ...(invoiceLink ? [invoiceLink] : []),
  ].join("\n");

  const transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    requireTLS: true,
    auth: { user, pass },
  });

  await transporter.sendMail({
    from: FROM_EMAIL,
    to,
    replyTo: order.email,
    subject: `New paid order #${order.orderId} — ${money(order.total)}`,
    text,
    html,
  });
}
