import { EMAIL_COLORS, escapeHtml } from "@/lib/email/shared";
import { upsTrackingUrl, uspsTrackingUrl } from "@/lib/orders/tracking";
import type { Order } from "@/lib/orders/types";
import { SITE_URL } from "@/lib/seo";

export const ORDER_TRACKING_URL = new URL("/track", SITE_URL).toString();

export const ORDER_DOCUMENTATION_LINKS = [
  { label: "Find a batch report", path: "/coa" },
  { label: "How to verify a laboratory report", path: "/guides/verify-peptide-laboratory-report" },
  { label: "Purity and content: reading the difference", path: "/guides/peptide-purity-vs-content" },
] as const;

/** Orders do not record the shipped lot. Never substitute today's catalog report. */
export function buildOrderDocumentation(): { text: string; html: string } {
  const instruction = "Match the batch or lot identifier on each received label to the original laboratory report. A report for a different lot does not document your shipment.";
  const help = "If you cannot find the matching report, reply with your order number and the identifier on the label so we can help locate it.";
  const links = ORDER_DOCUMENTATION_LINKS.map((link) => ({
    label: link.label,
    url: new URL(link.path, SITE_URL).toString(),
  }));
  return {
    text: ["Your batch documentation", instruction, ...links.map((link) => `${link.label}: ${link.url}`), help].join("\n"),
    html: `<div style="margin:0 0 20px;font-size:14px;line-height:1.6;">
      <p style="margin:0 0 8px;font-weight:bold;">Your batch documentation</p>
      <p style="margin:0 0 8px;color:${EMAIL_COLORS.muted};">${escapeHtml(instruction)}</p>
      <ul style="margin:0 0 8px;padding-left:20px;">${links.map((link) => `<li><a href="${escapeHtml(link.url)}" style="color:${EMAIL_COLORS.accent};">${escapeHtml(link.label)}</a></li>`).join("")}</ul>
      <p style="margin:0;color:${EMAIL_COLORS.muted};">${escapeHtml(help)}</p>
    </div>`,
  };
}

/** Carrier URLs come only from the site's fixed, encoded tracking helpers. */
export function customerTrackingUrl(order: Pick<Order, "trackingNumber" | "trackingCarrier">): string {
  const number = order.trackingNumber?.trim();
  if (!number) return ORDER_TRACKING_URL;
  switch (order.trackingCarrier?.trim().toUpperCase()) {
    case "USPS": return uspsTrackingUrl(number);
    case "UPS": return upsTrackingUrl(number);
    default: return ORDER_TRACKING_URL;
  }
}
