import {
  createSmtpTransport,
  EMAIL_COLORS,
  escapeHtml,
  FROM_EMAIL,
  emailPageWrapper,
  SUPPORT_EMAIL,
} from "@/lib/email/shared";
import { LEGAL_ENTITY_NAME } from "@/lib/content/testing-scope";
import type { Order } from "@/lib/orders/types";

const SUBJECT = "Following up on your order — PSL Labs";
const TRUSTPILOT_URL = "https://www.trustpilot.com/review/psllabs.org";
const LEGAL_FOOTER = `${LEGAL_ENTITY_NAME} — Phoenix, AZ. All products are for laboratory research use only. Not for human or animal consumption.`;

export async function sendDeliveryFollowupEmail(order: Order): Promise<void> {
  const to = order.email.trim();
  const trackingNumber = order.trackingNumber?.trim() ?? "";

  if (!to) {
    throw new Error("Order has no customer email for delivery follow-up.");
  }

  const { muted, accent } = EMAIL_COLORS;

  const text = [
    "We're following up on your recent order. We hope everything arrived as expected.",
    "",
    "If you have any questions about your order, the batch documentation, or anything else, simply reply to this email. We respond to every inquiry personally.",
    "",
    "If you found our documentation and service helpful, you can share your experience at:",
    TRUSTPILOT_URL,
    "",
    "Your feedback helps other researchers make informed decisions about their supply chain.",
    "",
    `Order #${order.orderId}`,
    trackingNumber ? `Tracking: ${trackingNumber}` : "",
    "",
    LEGAL_FOOTER,
  ]
    .filter(Boolean)
    .join("\n");

  const html = emailPageWrapper(`
    <p style="margin:0 0 16px;">
      We&apos;re following up on your recent order. We hope everything arrived as expected.
    </p>
    <p style="margin:0 0 16px;font-size:14px;color:${muted};line-height:1.6;">
      If you have any questions about your order, the batch documentation, or anything else,
      simply reply to this email. We respond to every inquiry personally.
    </p>
    <p style="margin:0 0 8px;font-size:14px;line-height:1.6;">
      If you found our documentation and service helpful, you can share your experience at:
    </p>
    <p style="margin:0 0 16px;">
      <a href="${TRUSTPILOT_URL}" style="color:${accent};">${TRUSTPILOT_URL}</a>
    </p>
    <p style="margin:0 0 20px;font-size:14px;color:${muted};line-height:1.6;">
      Your feedback helps other researchers make informed decisions about their supply chain.
    </p>
    <p style="margin:0 0 8px;font-size:13px;color:${muted};">
      Order
      <span style="font-family:monospace;color:${accent};">${escapeHtml(order.orderId)}</span>
    </p>
    ${
      trackingNumber
        ? `<p style="margin:0 0 20px;font-size:13px;color:${muted};">
            Tracking:
            <span style="font-family:monospace;color:${accent};">${escapeHtml(trackingNumber)}</span>
          </p>`
        : ""
    }
    <p style="margin:0 0 16px;font-size:13px;color:${muted};line-height:1.6;">
      ${escapeHtml(LEGAL_FOOTER)}
    </p>`);

  const transporter = createSmtpTransport();
  await transporter.sendMail({
    from: FROM_EMAIL,
    to,
    replyTo: SUPPORT_EMAIL,
    subject: SUBJECT,
    text,
    html,
  });
}
