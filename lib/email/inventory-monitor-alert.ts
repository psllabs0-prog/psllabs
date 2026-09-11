import {
  createSmtpTransport,
  escapeHtml,
  emailPageWrapper,
  EMAIL_COLORS,
} from "@/lib/email/shared";

import type { AlertKey } from "@/lib/inventory/monitor/alerts";

const DEFAULT_TO = "support@psllabs.org";

function labelFor(key: AlertKey): string {
  switch (key) {
    case "absolute_low_stock":
      return "ABSOLUTE LOW STOCK";
    case "reorder_review":
      return "REORDER REVIEW";
    case "depletion_watch":
      return "DEPLETION WATCH";
  }
}

export async function sendInventoryMonitorAlertEmail(input: {
  sku: string;
  productName: string;
  alertKey: AlertKey;
  sellableStock: number;
  monitorStatus: string;
  details?: string;
}): Promise<void> {
  const to = process.env.ORDER_NOTIFICATION_EMAIL?.trim() || DEFAULT_TO;
  const label = labelFor(input.alertKey);
  const subject = `Inventory monitor — ${label} — ${input.productName}`;
  const { muted, accent, border, surface } = EMAIL_COLORS;

  const html = emailPageWrapper(`
    <h2 style="margin:0 0 12px;font-size:18px;">Inventory monitor alert</h2>
    <div style="background:${surface};border:1px solid ${border};border-radius:8px;padding:16px;">
      <p style="margin:0 0 8px;font-size:13px;color:${muted};">State</p>
      <p style="margin:0 0 12px;font-size:18px;color:${accent};font-weight:600;">${escapeHtml(label)}</p>
      <p style="margin:0 0 4px;font-size:13px;color:${muted};">Product</p>
      <p style="margin:0 0 12px;"><strong>${escapeHtml(input.productName)}</strong></p>
      <p style="margin:0 0 4px;font-size:13px;color:${muted};">SKU</p>
      <p style="margin:0 0 12px;font-family:monospace;">${escapeHtml(input.sku)}</p>
      <p style="margin:0 0 4px;font-size:13px;color:${muted};">Sellable stock</p>
      <p style="margin:0 0 12px;font-family:monospace;">${input.sellableStock}</p>
      <p style="margin:0 0 4px;font-size:13px;color:${muted};">Monitor status</p>
      <p style="margin:0 0 12px;">${escapeHtml(input.monitorStatus)}</p>
      ${
        input.details
          ? `<p style="margin:0;font-size:13px;color:${muted};">${escapeHtml(input.details)}</p>`
          : ""
      }
      <p style="margin:16px 0 0;font-size:12px;color:${muted};">
        This is a review signal only. It does not place a supplier order, send crypto, or release inventory.
      </p>
    </div>`);

  const text = [
    "Inventory monitor alert",
    "",
    `State: ${label}`,
    `Product: ${input.productName}`,
    `SKU: ${input.sku}`,
    `Sellable stock: ${input.sellableStock}`,
    `Monitor status: ${input.monitorStatus}`,
    input.details ?? "",
    "",
    "Review signal only — no automatic purchase or release.",
  ]
    .filter(Boolean)
    .join("\n");

  const transporter = createSmtpTransport();
  await transporter.sendMail({
    from: `PSL Labs Inventory <${DEFAULT_TO}>`,
    to,
    subject,
    text,
    html,
  });
}
