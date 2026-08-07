import { NextResponse } from "next/server";

import { fulfillPaidOrder } from "@/lib/orders/fulfill-paid-order";
import {
  getOrder,
  setInvoiceId,
  setPaymentMethod,
} from "@/lib/orders/store";
import { isTagadaConfigured } from "@/lib/tagada";

export const runtime = "nodejs";

type CardFulfillBody = {
  orderId?: unknown;
  checkoutSessionId?: unknown;
  paymentId?: unknown;
  tagadaOrderId?: unknown;
};

const str = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

/**
 * Fulfill a locally reserved order after Tagada reports a successful
 * browser-side processPayment. Does not charge the card.
 */
export async function POST(request: Request) {
  if (!isTagadaConfigured()) {
    return NextResponse.json(
      { error: "Card checkout is not available." },
      { status: 503 }
    );
  }

  let body: CardFulfillBody;
  try {
    body = (await request.json()) as CardFulfillBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid request format." },
      { status: 400 }
    );
  }

  const orderId = str(body.orderId);
  if (!orderId) {
    return NextResponse.json({ error: "Missing order id." }, { status: 400 });
  }

  const paymentRef =
    str(body.paymentId) ||
    str(body.tagadaOrderId) ||
    str(body.checkoutSessionId) ||
    orderId;

  try {
    const order = await getOrder(orderId);
    if (!order) {
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }

    if (order.status === "paid") {
      return NextResponse.json({
        orderId,
        redirectTo: `/success?orderId=${orderId}`,
        alreadyPaid: true,
      });
    }

    if (order.status !== "pending") {
      return NextResponse.json(
        { error: "This order can no longer be paid." },
        { status: 409 }
      );
    }

    await setPaymentMethod(orderId, "card");
    if (!order.invoiceId) {
      await setInvoiceId(orderId, paymentRef);
    }

    const fulfilled = await fulfillPaidOrder(
      orderId,
      order.invoiceId ?? paymentRef,
      "[checkout/card]"
    );

    if (!fulfilled.ok) {
      return NextResponse.json(
        {
          error:
            "Payment was received but order fulfillment failed. Contact support with your order ID.",
          orderId,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      orderId,
      redirectTo: `/success?orderId=${orderId}`,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Card fulfillment failed.";
    console.error("[checkout/card] fulfill failed:", message);
    return NextResponse.json(
      { error: "We couldn't finish your order. Please contact support." },
      { status: 500 }
    );
  }
}
