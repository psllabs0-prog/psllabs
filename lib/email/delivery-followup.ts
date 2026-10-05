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

const SUBJECT = "Following up on your order — PSL Labs";
const TRUSTPILOT_URL = "https://www.trustpilot.com/review/psllabs.org";
const LEGAL_FOOTER = `${LEGAL_ENTITY_NAME} — Phoenix, AZ. All products are for laboratory research use only. Not for human or animal consumption.`;

export function buildDeliveryFollowupEmail(order: Order) {
  const trackingNumber = order.trackingNumber?.trim() ?? "";
  const trackingUrl = customerTrackingUrl(order);
  const documentation = buildOrderDocumentation();
  const { muted, accent } = EMAIL_COLORS;

  const text = [
    "We're checking in on your recent order.",
    "",
    `If your package has not arrived, anything is missing or damaged, or you need help with the documentation, reply with your order number or contact ${SUPPORT_EMAIL}.`,
    "",
    `Check shipment updates: ${trackingUrl}`,
    `Order status: ${ORDER_TRACKING_URL} (enter your order number and checkout email).`,
    "",
    documentation.text,
    "",
    "You're welcome to share an honest review of your experience:",
    TRUSTPILOT_URL,
    "",
    "Your feedback helps us understand what worked and what needs attention.",
    "",
    `Order #${order.orderId}`,
    trackingNumber ? `Tracking: ${trackingNumber}` : "",
    "",
    LEGAL_FOOTER,
  ]
    .join("\n");

  const html = emailPageWrapper(`
    <p style="margin:0 0 16px;">
      We&apos;re checking in on your recent order.
    </p>
    <p style="margin:0 0 16px;font-size:14px;color:${muted};line-height:1.6;">
      If your package has not arrived, anything is missing or damaged, or you need help
      with the documentation, reply with your order number or contact
      <a href="mailto:${SUPPORT_EMAIL}" style="color:${accent};">${SUPPORT_EMAIL}</a>.
    </p>
    <p style="margin:0 0 8px;">
      <a href="${escapeHtml(trackingUrl)}" style="color:${accent};">Check shipment updates</a>
    </p>
    <p style="margin:0 0 20px;font-size:14px;color:${muted};">
      For <a href="${escapeHtml(ORDER_TRACKING_URL)}" style="color:${accent};">order status</a>,
      enter your order number and the email address used at checkout.
    </p>
    ${documentation.html}
    <p style="margin:0 0 8px;font-size:14px;line-height:1.6;">
      You&apos;re welcome to share an honest review of your experience:
    </p>
    <p style="margin:0 0 16px;">
      <a href="${TRUSTPILOT_URL}" style="color:${accent};">Share your experience on Trustpilot</a>
    </p>
    <p style="margin:0 0 20px;font-size:14px;color:${muted};line-height:1.6;">
      Your feedback helps us understand what worked and what needs attention.
    </p>
    <p style="margin:0 0 8px;font-size:13px;color:${muted};">
      Order
      <span style="font-family:monospace;color:${accent};overflow-wrap:anywhere;word-break:break-word;">${escapeHtml(order.orderId)}</span>
    </p>
    ${
      trackingNumber
        ? `<p style="margin:0 0 20px;font-size:13px;color:${muted};">
            Tracking:
            <span style="font-family:monospace;color:${accent};overflow-wrap:anywhere;word-break:break-word;">${escapeHtml(trackingNumber)}</span>
          </p>`
        : ""
    }
    <p style="margin:0 0 16px;font-size:13px;color:${muted};line-height:1.6;">
      ${escapeHtml(LEGAL_FOOTER)}
    </p>`);

  return { subject: SUBJECT, text, html };
}

export async function sendDeliveryFollowupEmail(order: Order): Promise<void> {
  const to = order.email.trim();
  if (!to) throw new Error("Order has no customer email for delivery follow-up.");
  const built = buildDeliveryFollowupEmail(order);
  const transporter = createSmtpTransport();
  await transporter.sendMail({
    from: FROM_EMAIL,
    to,
    replyTo: SUPPORT_EMAIL,
    ...built,
  });
}
