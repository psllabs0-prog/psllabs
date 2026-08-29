import {
  createSmtpTransport,
  escapeHtml,
  emailPageWrapper,
  EMAIL_COLORS,
} from "@/lib/email/shared";
import { getCatalogProductByHandle } from "@/lib/products/catalog";

const DEFAULT_TO = "support@psllabs.org";

export async function sendLowStockAlertEmail(
  handle: string,
  name: string,
  stock: number
): Promise<void> {
  const to = process.env.ORDER_NOTIFICATION_EMAIL?.trim() || DEFAULT_TO;
  const catalog = getCatalogProductByHandle(handle);
  const productLabel = catalog
    ? `${catalog.name} ${catalog.strength}`.trim()
    : name;
  const sku = catalog?.sku ?? handle;

  const subject = `Low stock alert — ${productLabel} has ${stock} units remaining.`;
  const { muted, accent, border, surface } = EMAIL_COLORS;

  const html = emailPageWrapper(`
    <h2 style="margin:0 0 12px;font-size:18px;">Low stock alert</h2>
    <div style="background:${surface};border:1px solid ${border};border-radius:8px;padding:16px;">
      <p style="margin:0 0 8px;"><strong>${escapeHtml(productLabel)}</strong></p>
      <p style="margin:0 0 4px;font-size:13px;color:${muted};">Handle</p>
      <p style="margin:0 0 12px;font-family:monospace;">${escapeHtml(handle)}</p>
      <p style="margin:0 0 4px;font-size:13px;color:${muted};">SKU</p>
      <p style="margin:0 0 12px;font-family:monospace;">${escapeHtml(sku)}</p>
      <p style="margin:0;font-size:20px;font-family:monospace;color:${accent};">${stock} units remaining</p>
    </div>`);

  const text = [
    "Low stock alert",
    "",
    `Product: ${productLabel}`,
    `Handle: ${handle}`,
    `SKU: ${sku}`,
    `Stock remaining: ${stock}`,
  ].join("\n");

  const transporter = createSmtpTransport();
  await transporter.sendMail({
    from: `PSL Labs Inventory <${DEFAULT_TO}>`,
    to,
    subject,
    text,
    html,
  });
}
