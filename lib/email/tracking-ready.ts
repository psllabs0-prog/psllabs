import { createSmtpTransport, emailPageWrapper, escapeHtml, FROM_EMAIL, SUPPORT_EMAIL } from "./shared";
import { customerTrackingUrl } from "./order-documentation";
import type { Order } from "@/lib/orders/types";

export function buildTrackingReadyEmail(order: Order) {
  if (!order.trackingNumber?.trim()) throw new Error("Saved tracking is required before notifying a customer.");
  const url = customerTrackingUrl(order);
  const subject = "Your tracking number is ready — PSL Labs";
  const text = [`Your shipping label is ready.`, `Order #${order.orderId}`, `Tracking: ${order.trackingNumber}`,
    `Carrier: ${order.trackingCarrier || "USPS"}`, `Service: ${order.shipping.selection?.serviceDisplayName || "USPS"}`, `Track your package: ${url}`,
    "Your package is being prepared for carrier handoff. Tracking updates begin when the carrier scans it.",
    `Questions? Reply to this email or contact ${SUPPORT_EMAIL}.`,
    "For laboratory research only. Not for human or animal use."].join("\n\n");
  const html = emailPageWrapper(`<p>Your shipping label is ready.</p><p>Order #${escapeHtml(order.orderId)}</p>
    <p><strong>Tracking:</strong> ${escapeHtml(order.trackingNumber)}<br><strong>Carrier:</strong> ${escapeHtml(order.trackingCarrier || "USPS")}<br><strong>Service:</strong> ${escapeHtml(order.shipping.selection?.serviceDisplayName || "USPS")}</p>
    <p><a href="${escapeHtml(url)}">Track your package</a></p>
    <p>Your package is being prepared for carrier handoff. Tracking updates begin when the carrier scans it.</p>
    <p>Questions? Reply to this email or contact ${escapeHtml(SUPPORT_EMAIL)}.</p>
    <p>For laboratory research only. Not for human or animal use.</p>`);
  return { subject, text, html };
}

export async function sendTrackingReadyEmail(order: Order, messageId: string) {
  const transport = createSmtpTransport({ connectionTimeout: 15_000, greetingTimeout: 15_000, socketTimeout: 30_000 });
  await transport.sendMail({ from: FROM_EMAIL, to: order.email, replyTo: SUPPORT_EMAIL, messageId, ...buildTrackingReadyEmail(order) });
}
