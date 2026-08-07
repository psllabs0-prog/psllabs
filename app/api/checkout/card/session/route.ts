import { NextResponse } from "next/server";

import {
  prepareReservedOrder,
  type CheckoutBody,
} from "@/lib/checkout/prepare-order";
import { setInvoiceId, setPaymentMethod } from "@/lib/orders/store";
import { getTagadaIdsForHandle, isTagadaConfigured } from "@/lib/tagada";
import { createTagadaCheckoutSession } from "@/lib/tagada/server";

export const runtime = "nodejs";

/**
 * Reserve inventory, create a Tagada checkout session, and return tokens for
 * the browser headless SDK (tokenize + processPayment).
 */
export async function POST(request: Request) {
  if (!isTagadaConfigured()) {
    return NextResponse.json(
      { error: "Card checkout is not available." },
      { status: 503 }
    );
  }

  let body: CheckoutBody;
  try {
    body = (await request.json()) as CheckoutBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid request format." },
      { status: 400 }
    );
  }

  const prepared = await prepareReservedOrder(body);
  if (!prepared.ok) {
    return NextResponse.json(
      { error: prepared.error },
      { status: prepared.status }
    );
  }

  const { order } = prepared;

  try {
    await setPaymentMethod(order.orderId, "card");

    const sessionItems: Array<{ variantId: string; quantity: number }> = [];
    for (const item of order.items) {
      const ids = await getTagadaIdsForHandle(item.handle);
      if (!ids) {
        return NextResponse.json(
          {
            error:
              "This product is not synced for card checkout yet. Please pay with Bitcoin or contact support.",
            orderId: order.orderId,
          },
          { status: 409 }
        );
      }
      sessionItems.push({
        variantId: ids.tagadaVariantId,
        quantity: item.quantity,
      });
    }

    const session = await createTagadaCheckoutSession({
      items: sessionItems,
      email: order.email,
      firstName: order.shipping.firstName,
      lastName: order.shipping.lastName,
      orderId: order.orderId,
    });

    // Persist Token for webhook / fulfill correlation
    await setInvoiceId(order.orderId, session.checkoutToken);

    return NextResponse.json({
      orderId: order.orderId,
      checkoutToken: session.checkoutToken,
      sessionToken: session.sessionToken,
      storeId: process.env.TAGADA_STORE_ID,
      customer: {
        email: order.email,
        firstName: order.shipping.firstName,
        lastName: order.shipping.lastName,
      },
      shippingAddress: {
        line1: order.shipping.address,
        city: order.shipping.city,
        state: order.shipping.state,
        postalCode: order.shipping.zip,
        country: order.shipping.country || "US",
      },
      items: sessionItems,
      total: order.total,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to start card checkout.";
    console.error("[checkout/card/session]", message);
    return NextResponse.json(
      {
        error:
          "We couldn't start card payment. Please try again or use Bitcoin.",
        orderId: order.orderId,
      },
      { status: 502 }
    );
  }
}
