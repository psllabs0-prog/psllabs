import { getAllCheckoutProducts, getCheckoutProduct } from "@/lib/payments/products";
import { getCatalogProductByHandle } from "@/lib/products/catalog";
import { normalizeCountryCode, US_STATES } from "@/lib/checkout/us-states";
import type { OrderItem, OrderShippingAddress } from "@/lib/orders/types";

const states = new Set<string>(US_STATES.map(state => state.value));
const object = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

export function isPhysicalUSShippingAddress(shipping: OrderShippingAddress): boolean {
  // Format/range and policy validation is not a claim that USPS verified delivery.
  const zip = /^\d{5}(?:-\d{4})?$/.test(shipping.zip) ? Number(shipping.zip.slice(0, 5)) : 0;
  const lines = typeof shipping.address === "string" ? shipping.address.split(/\r?\n/) : [];
  return shipping.country === "US" && states.has(shipping.state) && zip >= 501 && zip <= 99950 &&
    [shipping.firstName, shipping.lastName, shipping.city].every(value => typeof value === "string" && value.trim().length > 0 && value.length <= 200 && !/[\u0000-\u001f\u007f]/.test(value)) &&
    typeof shipping.address === "string" && shipping.address.length <= 200 && lines.length >= 1 && lines.length <= 2 && lines.every(line => line.trim().length > 0) &&
    !/[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f]|\r(?!\n)/.test(shipping.address) &&
    !/^(?:APO|FPO|DPO)$/i.test(shipping.city) &&
    !/\b(?:P\.?\s*O\.?\s*(?:BOX|B\.?\s*X\.?)|POST\s+OFFICE\s+BOX|GENERAL\s+DELIVERY|APO|FPO|DPO)\b/i.test(shipping.address);
}

/** Reprice from the active server catalog; ignore every client-supplied amount. */
export function parseShippingQuoteRequest(raw: unknown, accountEmail: string) {
  const body = object(raw);
  const address = object(body?.shipping);
  if (!body || !address || !Array.isArray(body.items) || !body.items.length || body.items.length > getAllCheckoutProducts().length) return null;
  const shipping: OrderShippingAddress = { firstName: text(address.firstName), lastName: text(address.lastName),
    address: text(address.address), city: text(address.city), state: text(address.state).toUpperCase(),
    zip: text(address.zip), country: normalizeCountryCode(text(address.country) || "US") };
  if (!isPhysicalUSShippingAddress(shipping)) return null;
  const email = text(body.email) || accountEmail;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return null;
  const rawMethod = body.paymentMethod;
  if (rawMethod != null && !["card", "bitcoin", "btcpay"].includes(String(rawMethod))) return null;
  const paymentMethod = rawMethod === "bitcoin" || rawMethod === "btcpay" ? "bitcoin" as const : rawMethod === "card" ? "card" as const : null;
  const items: OrderItem[] = [];
  const seen = new Set<string>();
  for (const value of body.items) {
    const row = object(value);
    const handle = text(row?.handle).toLowerCase();
    const product = getCheckoutProduct(handle);
    if (!row || !product || seen.has(handle) || !Number.isSafeInteger(row.quantity) || Number(row.quantity) < 1 || Number(row.quantity) > 10) return null;
    seen.add(handle);
    const quantity = Number(row.quantity);
    items.push({ handle, name: product.name, strength: getCatalogProductByHandle(handle)?.strength ?? "",
      quantity, unitPrice: product.priceUsd, lineTotal: Math.round(product.priceUsd * quantity * 100) / 100 });
  }
  const requestedCode = text(body.discountCode);
  if (requestedCode.length > 100 || body.currency != null && text(body.currency).toUpperCase() !== "USD") return null;
  return { shipping, email, items, paymentMethod, requestedCode,
    subtotalCents: items.reduce((sum, item) => sum + Math.round(item.lineTotal * 100), 0) };
}
