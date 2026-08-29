import {
  createSmtpTransport,
  escapeHtml,
  FROM_EMAIL,
  SUPPORT_EMAIL,
  emailPageWrapper,
  EMAIL_COLORS,
} from "@/lib/email/shared";
import type { Order } from "@/lib/orders/types";

const SUBJECT = "Order follow-up — PSL Labs";

const BODY =
  "We're following up on your recent order. Did your order arrive as expected? Reply to this email if anything was wrong with packaging, documentation, or delivery. We respond to every inquiry personally.";

export async function sendOrderFeedbackEmail(order: Order): Promise<void> {
  const to = order.email.trim();
  if (!to) {
    throw new Error("Order has no customer email for feedback follow-up.");
  }

  const { muted, accent } = EMAIL_COLORS;
  const html = emailPageWrapper(`
    <p style="margin:0 0 16px;">${escapeHtml(BODY)}</p>
    <p style="margin:0;font-size:13px;color:${muted};">
      Order reference:
      <span style="font-family:monospace;color:${accent};">${escapeHtml(order.orderId)}</span>
    </p>`);

  const transporter = createSmtpTransport();
  await transporter.sendMail({
    from: FROM_EMAIL,
    to,
    replyTo: SUPPORT_EMAIL,
    subject: SUBJECT,
    text: `${BODY}\n\nOrder reference: ${order.orderId}`,
    html,
  });
}
