import { NextResponse } from "next/server";

import { computeTotals } from "@/lib/checkout/totals";
import { US_COUNTRY, US_STATES } from "@/lib/checkout/us-states";
import { checkoutWithStockCheck } from "@/lib/inventory/store";
import { setInvoiceId } from "@/lib/orders/store";
import type { Order, OrderItem } from "@/lib/orders/types";
import { getPaymentProcessor } from "@/lib/payments";
import { getCheckoutProduct } from "@/lib/payments/products";
import { getCatalogProductByHandle } from "@/lib/products/catalog";

export const runtime = "nodejs";

const MAX_QUANTITY = 10;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_STATES = new Set<string>(US_STATES.map((s) => s.value));

type RawItem = { handle?: unknown; quantity?: unknown };
type RawShipping = {
  firstName?: unknown;
  lastName?: unknown;
  address?: unknown;
  city?: unknown;
  state?: unknown;
  zip?: unknown;
};
type Body = {
  items?: unknown;
  email?: unknown;
  shipping?: unknown;
  currency?: unknown;
};

const bad = (message: string) =>
  NextResponse.json({ error: message }, { status: 400 });
const str = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return bad("Invalid request format.");
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return bad("Cart is empty.");
  }

  const email = str(body.email);
  if (!email || email.length > 254 || !EMAIL_PATTERN.test(email)) {
    return bad("A valid email address is required.");
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
    return bad("Complete shipping details are required.");
  }
  if (!VALID_STATES.has(shipping.state)) {
    return bad("A valid U.S. state is required.");
  }

  const currency =
    typeof body.currency === "string" && body.currency.trim()
      ? body.currency.trim().toUpperCase()
      : "USD";

  // Prices are computed server-side from the catalog. Client-supplied amounts
  // are never trusted — only product handles and quantities are read.
  const items: OrderItem[] = [];
  let subtotalRaw = 0;

  for (const raw of body.items as RawItem[]) {
    const handle = str(raw?.handle);
    const quantity = raw?.quantity;

    if (!handle) return bad("Each item requires a product handle.");
    if (
      !Number.isInteger(quantity) ||
      (quantity as number) < 1 ||
      (quantity as number) > MAX_QUANTITY
    ) {
      return bad(
        `Quantity for "${handle}" must be between 1 and ${MAX_QUANTITY}.`
      );
    }

    const product = getCheckoutProduct(handle);
    if (!product) {
      return NextResponse.json(
        { error: `Unknown product: ${handle}` },
        { status: 404 }
      );
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
    return bad("Order total must be greater than zero.");
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
      return NextResponse.json({ error: stockCheck.error }, { status: 409 });
    }
  } catch (error) {
    console.error("[checkout] Failed to persist order:", error);
    return NextResponse.json(
      { error: "Unable to start checkout. Please try again." },
      { status: 500 }
    );
  }

  try {
    const processor = getPaymentProcessor();
    const session = await processor.createInvoice({
      amount: totals.total,
      currency,
      orderId,
      redirectPath: `/success?orderId=${orderId}`,
      buyerEmail: email,
      items: items.map((it) => ({
        productId: it.handle,
        name: it.name,
        quantity: it.quantity,
      })),
    });

    await setInvoiceId(orderId, session.id);

    return NextResponse.json({ checkoutLink: session.url, orderId });
  } catch (error) {
    console.error("[checkout] Failed to create BTCPay invoice:", error);
    return NextResponse.json(
      { error: "Unable to start checkout. Please try again." },
      { status: 502 }
    );
  }
}
