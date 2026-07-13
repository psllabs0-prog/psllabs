import { computeTotals } from "@/lib/checkout/totals";
import { US_COUNTRY, US_STATES } from "@/lib/checkout/us-states";
import { checkoutWithStockCheck } from "@/lib/inventory/store";
import type { Order, OrderItem } from "@/lib/orders/types";
import { getCheckoutProduct } from "@/lib/payments/products";
import { getCatalogProductByHandle } from "@/lib/products/catalog";

const MAX_QUANTITY = 10;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_STATES = new Set<string>(US_STATES.map((s) => s.value));

export type CheckoutBody = {
  items?: unknown;
  email?: unknown;
  shipping?: unknown;
  currency?: unknown;
};

type RawItem = { handle?: unknown; quantity?: unknown };
type RawShipping = {
  firstName?: unknown;
  lastName?: unknown;
  address?: unknown;
  city?: unknown;
  state?: unknown;
  zip?: unknown;
};

export type PrepareOrderResult =
  | { ok: true; order: Order }
  | { ok: false; error: string; status: number };

const str = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

/**
 * Validate checkout payload, price from the server catalog, compute totals,
 * persist a pending order, and reserve inventory. Shared by BTCPay and card paths.
 */
export async function prepareReservedOrder(
  body: CheckoutBody
): Promise<PrepareOrderResult> {
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return { ok: false, error: "Cart is empty.", status: 400 };
  }

  const email = str(body.email);
  if (!email || email.length > 254 || !EMAIL_PATTERN.test(email)) {
    return {
      ok: false,
      error: "A valid email address is required.",
      status: 400,
    };
  }

  const rawShipping = (body.shipping ?? {}) as RawShipping;
  const shipping = {
    firstName: str(rawShipping.firstName),
    lastName: str(rawShipping.lastName),
    address: str(rawShipping.address),
    city: str(rawShipping.city),
    state: str(rawShipping.state).toUpperCase(),
    zip: str(rawShipping.zip),
    country: US_COUNTRY,
  };
  if (
    !shipping.firstName ||
    !shipping.lastName ||
    !shipping.address ||
    !shipping.city ||
    !shipping.zip
  ) {
    return {
      ok: false,
      error: "Complete shipping details are required.",
      status: 400,
    };
  }
  if (!VALID_STATES.has(shipping.state)) {
    return {
      ok: false,
      error: "A valid U.S. state is required.",
      status: 400,
    };
  }

  const currency =
    typeof body.currency === "string" && body.currency.trim()
      ? body.currency.trim().toUpperCase()
      : "USD";

  const items: OrderItem[] = [];
  let subtotalRaw = 0;

  for (const raw of body.items as RawItem[]) {
    const handle = str(raw?.handle);
    const quantity = raw?.quantity;

    if (!handle) {
      return {
        ok: false,
        error: "Each item requires a product handle.",
        status: 400,
      };
    }
    if (
      !Number.isInteger(quantity) ||
      (quantity as number) < 1 ||
      (quantity as number) > MAX_QUANTITY
    ) {
      return {
        ok: false,
        error: `Quantity for "${handle}" must be between 1 and ${MAX_QUANTITY}.`,
        status: 400,
      };
    }

    const product = getCheckoutProduct(handle);
    if (!product) {
      return {
        ok: false,
        error: `Unknown product: ${handle}`,
        status: 404,
      };
    }

    const qty = quantity as number;
    const lineTotal = Math.round(product.priceUsd * qty * 100) / 100;
    subtotalRaw += lineTotal;
    items.push({
      handle,
      name: product.name,
      strength: getCatalogProductByHandle(handle)?.strength ?? "",
      quantity: qty,
      unitPrice: product.priceUsd,
      lineTotal,
    });
  }

  const totals = computeTotals(subtotalRaw, shipping.state);
  if (totals.total <= 0) {
    return {
      ok: false,
      error: "Order total must be greater than zero.",
      status: 400,
    };
  }

  const orderId = `psl_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const now = new Date().toISOString();
  const order: Order = {
    orderId,
    createdAt: now,
    updatedAt: now,
    status: "pending",
    currency,
    email,
    shipping,
    items,
    subtotal: totals.subtotal,
    taxRate: totals.taxRate,
    tax: totals.tax,
    shippingCost: totals.shipping,
    total: totals.total,
    invoiceId: null,
    invoiceCreatedAt: null,
    paidAt: null,
    emailSent: false,
    emailError: null,
    customerEmailSent: false,
    customerEmailError: null,
    stockDecremented: false,
  };

  try {
    const stockCheck = await checkoutWithStockCheck(order);
    if (!stockCheck.ok) {
      return { ok: false, error: stockCheck.error, status: 409 };
    }
  } catch (error) {
    console.error("[checkout] Failed to persist order:", error);
    return {
      ok: false,
      error: "Unable to start checkout. Please try again.",
      status: 500,
    };
  }

  return { ok: true, order };
}
