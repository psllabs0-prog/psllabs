import { NextResponse } from "next/server";

import { safeRecordPaidOrderFinance } from "@/lib/finance/record";
import { safeTrackVerifiedPurchase } from "@/lib/openai-ads/delivery";
import { fulfillPaidOrder } from "@/lib/orders/fulfill-paid-order";
import { getOrder } from "@/lib/orders/store";
import { isTagadaConfigured } from "@/lib/tagada";
import { verifyTagadaCardPayment } from "@/lib/tagada/verify-payment";

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
 * Confirm an existing payment with Tagada before fulfilling its reserved order.
 * Browser references are lookup hints; this endpoint never charges a card.
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
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("Invalid body");
    }
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

  try {
    const order = await getOrder(orderId);
    if (!order) {
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }

    if (order.status === "paid" || order.status === "shipped") {
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

    const verification = await verifyTagadaCardPayment(order, {
      paymentId: str(body.paymentId) || undefined,
      tagadaOrderId: str(body.tagadaOrderId) || undefined,
      checkoutSessionId: str(body.checkoutSessionId) || undefined,
    });
    if (!verification.ok) {
      return NextResponse.json(
        {
          error: verification.retryable
            ? "Payment confirmation is still pending. Please retry confirmation; do not pay again."
            : "We couldn't verify this payment for your order. Contact support before paying again.",
          orderId,
          pendingConfirmation: verification.retryable,
        },
        { status: verification.retryable ? 202 : 409 }
      );
    }

    const paymentRef = verification.paymentId;
    const fulfilled = await fulfillPaidOrder(
      orderId,
      order.invoiceId!,
      "[checkout/card]",
      { paymentMethod: "card", total: order.total, currency: order.currency }
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

    const paidOrder = await getOrder(orderId);
    if (paidOrder?.status === "paid" || paidOrder?.status === "shipped") {
      await safeRecordPaidOrderFinance(paidOrder, {
        provider: "tagada",
        providerPaymentId: paymentRef,
        syntheticEvent: {
          provider: "tagada",
          providerEventId: `checkout_card:${orderId}:${paymentRef}`,
          eventType: "checkout/card_fulfilled",
          rawEvent: {
            source: "checkout_card",
            orderId,
            paymentRef,
          },
          providerPaymentId: paymentRef,
          providerOrderId: verification.providerOrderId,
          amount: verification.amountCents / 100,
          currency: verification.currency,
          pslOrderId: orderId,
          paymentStatus: "succeeded",
          paymentMethod: "card",
          processingStatus: "processed",
        },
      });
      // A later order edit must not change the amount/token verified above.
      if (paidOrder.paymentMethod === "card" && paidOrder.invoiceId === order.invoiceId &&
          paidOrder.total === order.total && paidOrder.currency === order.currency) {
        await safeTrackVerifiedPurchase(paidOrder, {
          provider: "tagada", paymentId: paymentRef,
        });
      }
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
