import { createHmac, timingSafeEqual } from "node:crypto";
import type { OrderItem, OrderShippingAddress } from "@/lib/orders/types";
import { getPriorityShippingConfig, priorityCardRateConfigured, type PriorityShippingConfig } from "./config";
import { getPriorityShippingPriceUsd, PRIORITY_PACKAGE, PRIORITY_QUOTE_TTL_MS, priorityCostCovered, readPriorityTransitDays, readShippingSelection } from "./policy";
import type { ShippingSelection } from "./types";
import { isPhysicalUSShippingAddress } from "./request";

/** Quote namespace only, never a claim of identity or account authentication.
 * The signed email, address, cart, discount and payment context still bind a
 * quote to the exact guest checkout that requested it. */
export const GUEST_SHIPPING_ACCOUNT_ID = "guest-checkout-v1";

export type PriorityQuoteContext = {
  accountId: string;
  email: string;
  shipping: OrderShippingAddress;
  items: OrderItem[];
  subtotalCents: number;
  discountCents: number;
  discountCode: string | null;
  paymentMethod: "bitcoin" | "card" | null;
};

const canonicalText = (value: string) => value.trim().replace(/\s+/g, " ").toUpperCase();

/** No names, email, street address or cart details are exposed in the token payload. */
function contextBinding(context: PriorityQuoteContext, secret: string): string {
  const s = context.shipping;
  return createHmac("sha256", secret).update("psl-shipping-context:v1:").update(JSON.stringify({
    accountId: context.accountId, email: context.email.trim().toLowerCase(),
    address: [s.firstName, s.lastName, s.address, s.city, s.state, s.zip, s.country].map(canonicalText),
    items: context.items.map(item => ({ handle: item.handle, quantity: item.quantity, unitPriceCents: Math.round(item.unitPrice * 100) }))
      .sort((a, b) => a.handle.localeCompare(b.handle)),
    subtotalCents: context.subtotalCents, discountCents: context.discountCents,
    discountCode: context.discountCode?.trim().toLowerCase() ?? null, paymentMethod: context.paymentMethod,
  })).digest("hex");
}

function validContext(context: PriorityQuoteContext, config: PriorityShippingConfig): boolean {
  return context.accountId === GUEST_SHIPPING_ACCOUNT_ID && !!context.email && isPhysicalUSShippingAddress(context.shipping) &&
    Number.isSafeInteger(context.subtotalCents) && context.subtotalCents > 0 &&
    Number.isSafeInteger(context.discountCents) && context.discountCents >= 0 && context.discountCents <= context.subtotalCents &&
    context.items.length > 0 && context.items.every(item => Number.isSafeInteger(item.quantity) && item.quantity > 0) &&
    context.items.reduce((sum, item) => sum + item.quantity, 0) <= config.maxUnits;
}

function hasDeliveryEstimate(selection: ShippingSelection): boolean {
  return typeof selection.transitDays === "number" && readPriorityTransitDays(selection.transitDays) !== null &&
    typeof selection.deliveryEstimate === "string" && selection.deliveryEstimate.trim().length > 0;
}

export function issuePriorityShippingQuote(context: PriorityQuoteContext, selection: ShippingSelection,
  config: PriorityShippingConfig, now = Date.now()): { quoteToken: string; expiresAt: string } {
  const priceUsd = getPriorityShippingPriceUsd(context.subtotalCents - context.discountCents);
  if (!validContext(context, config) || !readShippingSelection(selection) || selection.method !== "priority" || !hasDeliveryEstimate(selection) ||
      selection.providerServiceCode !== config.serviceCode || !priorityCostCovered(selection.quotedPostageUsd!, priceUsd, config.extraCostReserveUsd)) {
    throw new Error("A verified, covered Priority Mail quote is required.");
  }
  const expiresAt = now + PRIORITY_QUOTE_TTL_MS;
  const payload = Buffer.from(JSON.stringify({ version: 1, binding: contextBinding(context, config.signingSecret),
    priceCents: Math.round(priceUsd * 100), issuedAt: now, expiresAt, selection })).toString("base64url");
  const signature = createHmac("sha256", config.signingSecret).update(`psl-shipping-quote:v1:${payload}`).digest("base64url");
  return { quoteToken: `${payload}.${signature}`, expiresAt: new Date(expiresAt).toISOString() };
}

/** Revalidates the current kill switch, pack limits, discount tier and cost coverage. */
export function validatePriorityShippingQuote(token: unknown, context: PriorityQuoteContext,
  options: { config?: PriorityShippingConfig | null; now?: number; cardRateConfigured?: (priceUsd: number) => boolean } = {}): ShippingSelection | null {
  const config = options.config === undefined ? getPriorityShippingConfig() : options.config;
  const now = options.now ?? Date.now();
  if (!config || !validContext(context, config) || typeof token !== "string" || token.length > 8000) return null;
  const parts = token.split(".");
  if (parts.length !== 2 || !parts.every(part => /^[A-Za-z0-9_-]+$/.test(part))) return null;
  const expected = createHmac("sha256", config.signingSecret).update(`psl-shipping-quote:v1:${parts[0]}`).digest();
  const signature = Buffer.from(parts[1], "base64url");
  if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    const priceUsd = getPriorityShippingPriceUsd(context.subtotalCents - context.discountCents);
    const selection = readShippingSelection(payload.selection);
    if (payload.version !== 1 || payload.binding !== contextBinding(context, config.signingSecret) || payload.priceCents !== Math.round(priceUsd * 100) ||
        !Number.isSafeInteger(payload.issuedAt) || !Number.isSafeInteger(payload.expiresAt) || payload.issuedAt > now + 1000 ||
        payload.expiresAt <= now || payload.expiresAt - payload.issuedAt !== PRIORITY_QUOTE_TTL_MS ||
        !selection || selection.method !== "priority" || !hasDeliveryEstimate(selection) || selection.carrier !== "USPS" || selection.providerServiceCode !== config.serviceCode ||
        selection.quotedAt !== new Date(payload.issuedAt).toISOString() || selection.quoteExpiresAt !== new Date(payload.expiresAt).toISOString() ||
        JSON.stringify(selection.package) !== JSON.stringify(PRIORITY_PACKAGE) ||
        !priorityCostCovered(selection.quotedPostageUsd!, priceUsd, config.extraCostReserveUsd) ||
        context.paymentMethod === "card" && !(options.cardRateConfigured ?? priorityCardRateConfigured)(priceUsd)) return null;
    return selection;
  } catch { return null; }
}
