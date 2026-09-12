import { LEGAL_ENTITY_NAME } from "@/lib/content/testing-scope";
import { SUPPORT_EMAIL } from "@/lib/email/shared";
import type { Order } from "@/lib/orders/types";
import { getCatalogProductByHandle } from "@/lib/products/catalog";

/** Printable packing slip — operational only, no use/dosing language. */
export function buildPackingSlipHtml(order: Order): string {
  const name = `${order.shipping.firstName} ${order.shipping.lastName}`.trim();
  const dest = [
    name,
    order.shipping.address,
    `${order.shipping.city}, ${order.shipping.state} ${order.shipping.zip}`,
    order.shipping.country,
  ]
    .filter(Boolean)
    .join("<br/>");

  const rows = order.items
    .map((it) => {
      const sku = getCatalogProductByHandle(it.handle)?.sku ?? "—";
      return `<tr>
        <td style="padding:6px;border-bottom:1px solid #ddd;">${escape(it.name)} ${escape(it.strength)}</td>
        <td style="padding:6px;border-bottom:1px solid #ddd;">${escape(sku)}</td>
        <td style="padding:6px;border-bottom:1px solid #ddd;text-align:right;">${it.quantity}</td>
      </tr>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html><head><title>Packing slip ${escape(order.orderId)}</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 24px; }
  h1 { font-size: 18px; margin: 0 0 8px; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; }
  .muted { color: #555; font-size: 12px; }
  @media print { body { margin: 12px; } }
</style></head><body>
  <h1>PSL Labs packing slip</h1>
  <p><strong>Order:</strong> ${escape(order.orderId)}</p>
  <p><strong>Date:</strong> ${escape(order.paidAt ?? order.createdAt)}</p>
  <p><strong>Ship to:</strong><br/>${dest}</p>
  <table>
    <thead><tr>
      <th style="text-align:left;padding:6px;">Item</th>
      <th style="text-align:left;padding:6px;">SKU</th>
      <th style="text-align:right;padding:6px;">Qty</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <p class="muted" style="margin-top:24px;">
    ${escape(LEGAL_ENTITY_NAME)} — Support: ${escape(SUPPORT_EMAIL)}<br/>
    All products are for laboratory research use only. Not for human or animal consumption.
  </p>
</body></html>`;
}

function escape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
