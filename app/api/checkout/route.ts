import { NextResponse } from "next/server";

import { getPaymentProcessor } from "@/lib/payments";
import { getCheckoutProduct } from "@/lib/payments/products";

export const runtime = "nodejs";

const MAX_QUANTITY = 10;

type CheckoutItem = { handle?: unknown; quantity?: unknown };
type CheckoutBody = { items?: unknown; currency?: unknown };

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function POST(request: Request) {
  let body: CheckoutBody;
  try {
    body = (await request.json()) as CheckoutBody;
  } catch {
    return badRequest("Invalid request format.");
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return badRequest("Cart is empty.");
  }

  const currency =
    typeof body.currency === "string" && body.currency.trim()
      ? body.currency.trim().toUpperCase()
      : "USD";

  // Prices are derived server-side from the catalog. Any client-supplied
  // price is ignored — we only trust product handles and quantities.
  const resolvedItems: { productId: string; name: string; quantity: number }[] =
    [];
  let amount = 0;

  for (const raw of body.items as CheckoutItem[]) {
    const handle = typeof raw?.handle === "string" ? raw.handle : "";
    const quantity = raw?.quantity;

    if (!handle) {
      return badRequest("Each item requires a product handle.");
    }

    if (
      !Number.isInteger(quantity) ||
      (quantity as number) < 1 ||
      (quantity as number) > MAX_QUANTITY
    ) {
      return badRequest(
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

    amount += product.priceUsd * (quantity as number);
    resolvedItems.push({
      productId: product.id,
      name: product.name,
      quantity: quantity as number,
    });
  }

  amount = Number(amount.toFixed(2));
  if (amount <= 0) {
    return badRequest("Order total must be greater than zero.");
  }

  const orderId = `psl_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  try {
    const processor = getPaymentProcessor();
    const session = await processor.createInvoice({
      amount,
      currency,
      orderId,
      redirectPath: "/success",
      items: resolvedItems,
    });

    return NextResponse.json({
      checkoutLink: session.url,
      invoiceId: session.id,
      orderId,
    });
  } catch (error) {
    console.error("[checkout] Failed to create BTCPay invoice:", error);
    return NextResponse.json(
      { error: "Unable to start checkout. Please try again." },
      { status: 502 }
    );
  }
}
