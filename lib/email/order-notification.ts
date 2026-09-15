import nodemailer from "nodemailer";

import { LEGAL_ENTITY_NAME } from "@/lib/content/testing-scope";
import { formatDiscountEmailLine } from "@/lib/email/discount-line";
import { getStockLevels } from "@/lib/inventory/store";
import type { Order, PaymentMethod } from "@/lib/orders/types";
import { SITE_URL } from "@/lib/seo";

const FROM_EMAIL = "PSL Labs Orders <support@psllabs.org>";
const DEFAULT_TO = "support@psllabs.org";
const LEGAL_FOOTER = `${LEGAL_ENTITY_NAME} — Phoenix, AZ. All products are for laboratory research use only. Not for human or animal consumption.`;

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

export type MerchantPaymentNotificationFields = {
  paymentMethodDisplay: string;
  paymentIdLabel: string;
  paymentIdValue: string;
  showBtcpayLink: boolean;
};

/**
 * Payment-provider-aware labels for the internal merchant notification.
 * Bitcoin uses BTCPay terminology; card (and non-bitcoin) uses a generic ID label.
 */
export function buildMerchantPaymentNotificationFields(
  order: Pick<Order, "paymentMethod" | "invoiceId">
): MerchantPaymentNotificationFields {
  const method = order.paymentMethod;
  const isBitcoin = method === "bitcoin";
  return {
    paymentMethodDisplay:
      method === "bitcoin" ? "Bitcoin" : method === "card" ? "Card" : "—",
    paymentIdLabel: isBitcoin
      ? "BTCPay invoice ID"
      : "Payment / transaction ID",
    paymentIdValue: order.invoiceId ?? "—",
    showBtcpayLink: isBitcoin,
  };
}

/**
 * Merchant-only links for the internal paid-order notification.
 * Never constructs BTCPay `/invoices/{id}` (requires store permission; 403 in practice).
 * Never embeds customer PII in URLs.
 * BTCPay root link is only offered for Bitcoin orders.
 */
export function buildMerchantOrderNotificationLinks(input?: {
  btcpayUrl?: string | null;
  siteUrl?: string;
  paymentMethod?: PaymentMethod | null;
}): {
  adminLedgerUrl: string;
  btcpayRootUrl: string | null;
} {
  const site = (input?.siteUrl ?? SITE_URL).replace(/\/+$/, "");
  const rawBtcpay = (input?.btcpayUrl ?? process.env.BTCPAY_URL ?? "").trim();
  const btcpayRoot =
    rawBtcpay && input?.paymentMethod === "bitcoin"
      ? rawBtcpay.replace(/\/+$/, "")
      : null;
  return {
    adminLedgerUrl: `${site}/admin-ledger`,
    btcpayRootUrl: btcpayRoot,
  };
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
  const paymentFields = buildMerchantPaymentNotificationFields(order);
  const { adminLedgerUrl, btcpayRootUrl } = buildMerchantOrderNotificationLinks({
    paymentMethod: order.paymentMethod,
  });
  const showBtcpay =
    paymentFields.showBtcpayLink && Boolean(btcpayRootUrl);
  const placedAt = new Date(order.paidAt ?? order.createdAt).toUTCString();
  const name = `${order.shipping.firstName} ${order.shipping.lastName}`.trim();
  const stockLevels = await getStockLevels(order.items.map((it) => it.handle));
  const discountLine = formatDiscountEmailLine(order);

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
        ${
          order.discountAmount > 0
            ? `<tr><td colspan="4" style="padding:4px 8px;text-align:right;color:#059669;">${order.discountCode === "BITCOIN" || order.paymentMethod === "bitcoin" ? "Bitcoin discount (5%)" : `Discount (${escapeHtml(order.discountCode || "Promo")})`}</td><td style="padding:4px 8px;text-align:right;color:#059669;">-${money(order.discountAmount)}</td></tr>`
            : ""
        }
        <tr><td colspan="4" style="padding:4px 8px;text-align:right;">Shipping</td><td style="padding:4px 8px;text-align:right;">${shippingLabel(order.shippingCost)}</td></tr>
        <tr><td colspan="4" style="padding:8px;text-align:right;font-weight:bold;">Order total</td><td style="padding:8px;text-align:right;font-weight:bold;">${money(order.total)}</td></tr>
      </tfoot>
    </table>
    ${
      discountLine
        ? `<p style="margin:12px 0 4px;"><strong>${escapeHtml(discountLine)}</strong></p>`
        : ""
    }
    <p style="margin:12px 0 4px;"><strong>Payment method:</strong> ${escapeHtml(paymentFields.paymentMethodDisplay)}</p>
    <p style="margin:0 0 4px;"><strong>PSL order ID:</strong> ${escapeHtml(order.orderId)}</p>
    <p style="margin:0 0 4px;"><strong>${escapeHtml(paymentFields.paymentIdLabel)}:</strong> ${escapeHtml(paymentFields.paymentIdValue)}</p>
    <p style="margin:12px 0 4px;"><a href="${escapeHtml(adminLedgerUrl)}">Open admin ledger</a> — review this order in PSL Labs.</p>
    ${
      showBtcpay && btcpayRootUrl
        ? `<p style="margin:0 0 4px;"><a href="${escapeHtml(btcpayRootUrl)}">Open BTCPay</a> — server root (sign in to locate the invoice by ID above).</p>`
        : ""
    }
    <p style="margin:16px 0 0;font-size:12px;color:#64748b;line-height:1.5;">${escapeHtml(LEGAL_FOOTER)}</p>
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
    ...(order.discountAmount > 0
      ? [
          `${order.discountCode === "BITCOIN" || order.paymentMethod === "bitcoin" ? "Bitcoin discount (5%)" : `Discount (${order.discountCode || "Promo"})`}: -${money(order.discountAmount)}`,
        ]
      : []),
    `Shipping: ${shippingLabel(order.shippingCost)}`,
    `Order total: ${money(order.total)}`,
    "",
    ...(discountLine ? [discountLine, ""] : []),
    `Payment method: ${paymentFields.paymentMethodDisplay}`,
    `PSL order ID: ${order.orderId}`,
    `${paymentFields.paymentIdLabel}: ${paymentFields.paymentIdValue}`,
    `Open admin ledger: ${adminLedgerUrl}`,
    ...(showBtcpay && btcpayRootUrl
      ? [`Open BTCPay: ${btcpayRootUrl}`]
      : []),
    "",
    LEGAL_FOOTER,
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
