import {
  createSmtpTransport,
  EMAIL_COLORS,
  escapeHtml,
  FROM_EMAIL,
  emailPageWrapper,
  SUPPORT_EMAIL,
} from "@/lib/email/shared";
import { LEGAL_ENTITY_NAME } from "@/lib/content/testing-scope";
import { buildOrderDocumentation, customerTrackingUrl, ORDER_TRACKING_URL } from "@/lib/email/order-documentation";
import type { Order } from "@/lib/orders/types";

const SUBJECT = "Your Order Has Shipped — PSL Labs";
const TRACK_PAGE_URL = ORDER_TRACKING_URL;
const LEGAL_FOOTER = `${LEGAL_ENTITY_NAME} — Phoenix, AZ. All products are for laboratory research use only. Not for human or animal consumption.`;

export function buildOrderShippedEmail(order: Order) {
  const trackingNumber = order.trackingNumber?.trim() ?? "";
  const carrier = order.trackingCarrier?.trim() || "Not recorded";
  if (!trackingNumber) {
    throw new Error("Order has no tracking number for shipping confirmation.");
  }

  const trackingUrl = customerTrackingUrl(order);
  const documentation = buildOrderDocumentation();
  const { muted, accent } = EMAIL_COLORS;

  const text = [
    "Your order has shipped.",
    "",
    `Order #${order.orderId}`,
    "",
    `Tracking Number: ${trackingNumber}`,
    `Carrier: ${carrier}`,
    "",
    `Track your package: ${trackingUrl}`,
    `Or visit ${TRACK_PAGE_URL.replace("https://www.", "")} and enter your order number and email.`,
    "",
    "Carrier scans may take time to appear. Check tracking for the latest shipment updates.",
    "",
    documentation.text,
    "",
    `Questions about the shipment? Reply to this email or contact ${SUPPORT_EMAIL} with your order number.`,
    "",
    LEGAL_FOOTER,
  ].join("\n");

  const html = emailPageWrapper(`
    <p style="margin:0 0 16px;">Your order has shipped.</p>
    <p style="margin:0 0 16px;font-size:13px;color:${muted};">
      Order
      <span style="font-family:monospace;color:${accent};overflow-wrap:anywhere;word-break:break-word;">${escapeHtml(order.orderId)}</span>
    </p>
    <p style="margin:0 0 8px;">
      <strong>Tracking Number:</strong>
      <span style="font-family:monospace;overflow-wrap:anywhere;word-break:break-word;">${escapeHtml(trackingNumber)}</span>
    </p>
    <p style="margin:0 0 20px;"><strong>Carrier:</strong> ${escapeHtml(carrier)}</p>
    <p style="margin:0 0 8px;">
      Track your package:
      <a href="${escapeHtml(trackingUrl)}" style="color:${accent};">View shipment tracking</a>
    </p>
    <p style="margin:0 0 20px;font-size:14px;color:${muted};">
      Or
      <a href="${escapeHtml(TRACK_PAGE_URL)}" style="color:${accent};">check your order status</a>
      and enter your order number and email.
    </p>
    <p style="margin:0 0 16px;font-size:14px;color:${muted};line-height:1.6;">
      Carrier scans may take time to appear. Check tracking for the latest shipment updates.
    </p>
    ${documentation.html}
    <p style="margin:0 0 16px;font-size:14px;line-height:1.6;">
      Questions about the shipment? Reply to this email or contact
      <a href="mailto:${SUPPORT_EMAIL}" style="color:${accent};">${SUPPORT_EMAIL}</a>
      with your order number.
    </p>
    <p style="margin:0 0 16px;font-size:13px;color:${muted};line-height:1.6;">
      ${escapeHtml(LEGAL_FOOTER)}
    </p>`);

  return { subject: SUBJECT, text, html };
}

export async function sendOrderShippedEmail(order: Order): Promise<void> {
  const to = order.email.trim();
  if (!to) throw new Error("Order has no customer email for shipping confirmation.");
  const built = buildOrderShippedEmail(order);
  const transporter = createSmtpTransport();
  await transporter.sendMail({
    from: FROM_EMAIL,
    to,
    replyTo: SUPPORT_EMAIL,
    ...built,
  });
}
