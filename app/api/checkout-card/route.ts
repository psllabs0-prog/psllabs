import { NextResponse } from "next/server";

import {
  prepareReservedOrder,
  type CheckoutBody,
} from "@/lib/checkout/prepare-order";
import { fulfillPaidOrder } from "@/lib/orders/fulfill-paid-order";
import { markStatusIfPending } from "@/lib/orders/store";
import { getPaymentProcessor } from "@/lib/payments";
import { isCardCheckoutEnabled } from "@/lib/payments/authnet";

export const runtime = "nodejs";

type CardBody = CheckoutBody & {
  opaqueDataDescriptor?: unknown;
  opaqueDataValue?: unknown;
};

const str = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

export async function POST(request: Request) {
  // Hard sandbox gate — refuse before touching orders or Auth.net.
  if (!isCardCheckoutEnabled()) {
    return NextResponse.json(
      { error: "Card checkout is not available." },
      { status: 503 }
    );
  }

  let body: CardBody;
  try {
    body = (await request.json()) as CardBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid request format." },
      { status: 400 }
    );
  }

  const opaqueDataDescriptor = str(body.opaqueDataDescriptor);
  const opaqueDataValue = str(body.opaqueDataValue);
  if (!opaqueDataDescriptor || !opaqueDataValue) {
    return NextResponse.json(
      { error: "Missing tokenized payment data." },
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
  const processor = getPaymentProcessor("card");
  if (!processor.chargeCard) {
    return NextResponse.json(
      { error: "Card processor is misconfigured." },
      { status: 500 }
    );
  }

  try {
    const charge = await processor.chargeCard({
      amount: order.total,
      currency: order.currency,
      orderId: order.orderId,
      opaqueDataDescriptor,
      opaqueDataValue,
      buyerEmail: order.email,
      billTo: order.shipping,
    });

    const fulfilled = await fulfillPaidOrder(
      order.orderId,
      charge.transactionId,
      "[checkout-card]"
    );

    if (!fulfilled.ok) {
      console.error(
        `[checkout-card] charged ${charge.transactionId} but fulfill failed for ${order.orderId}`
      );
      return NextResponse.json(
        {
          error:
            "Payment was received but order fulfillment failed. Contact support with your order ID.",
          orderId: order.orderId,
          transactionId: charge.transactionId,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      orderId: order.orderId,
      transactionId: charge.transactionId,
      redirectTo: `/success?orderId=${order.orderId}`,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Card payment failed.";
    console.error("[checkout-card] charge failed:", message);

    try {
      await markStatusIfPending(order.orderId, "failed");
    } catch (markError) {
      console.error("[checkout-card] failed to mark order failed:", markError);
    }

    return NextResponse.json({ error: message }, { status: 402 });
  }
}
