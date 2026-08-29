import {
  createSmtpTransport,
  EMAIL_COLORS,
  escapeHtml,
  FROM_EMAIL,
  emailPageWrapper,
  SUPPORT_EMAIL,
} from "@/lib/email/shared";
import type { Order } from "@/lib/orders/types";

const SUBJECT = "Your Order Has Shipped — PSL Labs";
const TRACK_PAGE_URL = "https://www.psllabs.org/track";
const STORAGE_GUIDE_URL =
  "https://www.psllabs.org/guides/peptide-storage-stability";
const RUO_DISCLAIMER =
  "All products are for laboratory research use only. Not for human or animal consumption.";

function uspsTrackUrl(trackingNumber: string): string {
  return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(trackingNumber.trim())}`;
}

export async function sendOrderShippedEmail(order: Order): Promise<void> {
  const to = order.email.trim();
  const trackingNumber = order.trackingNumber?.trim() ?? "";
  const carrier = order.trackingCarrier?.trim() || "USPS";

  if (!to) {
    throw new Error("Order has no customer email for shipping confirmation.");
  }
  if (!trackingNumber) {
    throw new Error("Order has no tracking number for shipping confirmation.");
  }

  const uspsUrl = uspsTrackUrl(trackingNumber);
  const { muted, accent } = EMAIL_COLORS;

  const text = [
    "Your order has shipped.",
    "",
    `Order #${order.orderId}`,
    "",
    `Tracking Number: ${trackingNumber}`,
    `Carrier: ${carrier}`,
    "",
    `Track your package: ${uspsUrl}`,
    `Or visit ${TRACK_PAGE_URL.replace("https://www.", "")} and enter your order number and email.`,
    "",
    "Domestic delivery typically takes 3–5 business days. Tracking updates may take up to 24 hours to appear in the USPS system.",
    "",
    "Storage note: Lyophilized research compounds should be stored in a freezer upon receipt. Refer to our Storage Guide for recommendations.",
    STORAGE_GUIDE_URL,
    "",
    RUO_DISCLAIMER,
    "",
    "— PSL Labs",
  ].join("\n");

  const html = emailPageWrapper(`
    <p style="margin:0 0 16px;">Your order has shipped.</p>
    <p style="margin:0 0 16px;font-size:13px;color:${muted};">
      Order
      <span style="font-family:monospace;color:${accent};">${escapeHtml(order.orderId)}</span>
    </p>
    <p style="margin:0 0 8px;">
      <strong>Tracking Number:</strong>
      <span style="font-family:monospace;">${escapeHtml(trackingNumber)}</span>
    </p>
    <p style="margin:0 0 20px;"><strong>Carrier:</strong> ${escapeHtml(carrier)}</p>
    <p style="margin:0 0 8px;">
      Track your package:
      <a href="${escapeHtml(uspsUrl)}" style="color:${accent};">${escapeHtml(uspsUrl)}</a>
    </p>
    <p style="margin:0 0 20px;font-size:14px;color:${muted};">
      Or visit
      <a href="${TRACK_PAGE_URL}" style="color:${accent};">psllabs.org/track</a>
      and enter your order number and email.
    </p>
    <p style="margin:0 0 16px;font-size:14px;color:${muted};line-height:1.6;">
      Domestic delivery typically takes 3–5 business days. Tracking updates may take up to
      24 hours to appear in the USPS system.
    </p>
    <p style="margin:0 0 16px;font-size:14px;color:${muted};line-height:1.6;">
      <strong>Storage note:</strong> Lyophilized research compounds should be stored in a
      freezer upon receipt. Refer to our
      <a href="${STORAGE_GUIDE_URL}" style="color:${accent};">Storage Guide</a>
      for recommendations.
    </p>
    <p style="margin:0 0 16px;font-size:13px;color:${muted};line-height:1.6;">
      ${escapeHtml(RUO_DISCLAIMER)}
    </p>
    <p style="margin:0;">— PSL Labs</p>`);

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
