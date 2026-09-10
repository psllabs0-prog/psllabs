import { NextResponse } from "next/server";

import {
  recordProviderEvent,
  safeRecordPaidOrderFinance,
} from "@/lib/finance/record";
import { markPaymentEventProcessed } from "@/lib/finance/store";
import { verifyTagadaWebhookSignature } from "@/lib/finance/webhook-verify";
import { fulfillPaidOrder } from "@/lib/orders/fulfill-paid-order";
import { trackPlausiblePurchase } from "@/lib/plausible";
import {
  claimTagadaWebhook,
  getOrder,
  getOrderByInvoice,
  markStatusIfPending,
  markTagadaWebhookSent,
  releaseTagadaWebhookClaim,
  setPaymentMethod,
} from "@/lib/orders/store";

export const runtime = "nodejs";

const TAGADA_WEBHOOK_URL = "https://psllabs.org/api/tagada-webhook";

type TagadaWebhookEvent = {
  id?: string;
  type?: string;
  eventType?: string;
  createdAt?: string;
  data?: {
    orderId?: string;
    checkoutSessionId?: string;
    paymentId?: string;
    totalAmount?: number;
    amount?: number;
    currency?: string;
    metadata?: { orderId?: string };
    order?: { id?: string; metadata?: { orderId?: string } };
    payment?: { id?: string; status?: string };
  };
  metadata?: { orderId?: string };
};

/**
 * Official TagadaPay signed webhook receiver.
 * Requires TAGADA_WEBHOOK_SECRET — never accepts unverified payloads.
 * @see https://docs.tagada.io/developer-tools/node-sdk/webhooks-events
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature =
    request.headers.get("x-tagadapay-signature") ??
    request.headers.get("X-TagadaPay-Signature");
  const secret = process.env.TAGADA_WEBHOOK_SECRET?.trim();
  const headerEventId = request.headers.get("x-tagadapay-event-id");

  if (!secret) {
    console.error("[tagada-webhook] TAGADA_WEBHOOK_SECRET is not set");
    return NextResponse.json(
      { error: "Webhook not configured" },
      { status: 503 }
    );
  }
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 401 });
  }
  if (!verifyTagadaWebhookSignature(rawBody, secret, signature)) {
    console.warn("[tagada-webhook] Invalid signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: TagadaWebhookEvent;
  try {
    event = JSON.parse(rawBody) as TagadaWebhookEvent;
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const type = event.type ?? event.eventType ?? "";
  const providerEventId =
    event.id ||
    headerEventId ||
    `tagada:${type}:${event.data?.paymentId ?? event.data?.orderId ?? "unknown"}`;

  const isPaid =
    type === "order/paid" ||
    type === "payment/succeeded" ||
    type === "payment.succeeded";
  const isFailed =
    type === "order/failed" ||
    type === "payment/failed" ||
    type === "payment/rejected";

  const amountCents =
    typeof event.data?.totalAmount === "number"
      ? event.data.totalAmount
      : typeof event.data?.amount === "number"
        ? event.data.amount
        : null;

  let paymentEventId: number | null = null;
  try {
    const recorded = await recordProviderEvent({
      provider: "tagada",
      providerEventId,
      eventType: type || "unknown",
      rawEvent: event,
      providerPaymentId:
        event.data?.paymentId ?? event.data?.payment?.id ?? null,
      providerOrderId: event.data?.order?.id ?? event.data?.orderId ?? null,
      pslOrderId:
        event.data?.metadata?.orderId ??
        event.data?.order?.metadata?.orderId ??
        event.metadata?.orderId ??
        null,
      eventTimestamp: event.createdAt ?? new Date().toISOString(),
      amount: amountCents !== null ? amountCents / 100 : null,
      currency: event.data?.currency ?? null,
      paymentStatus: isPaid ? "succeeded" : isFailed ? "failed" : type || null,
      paymentMethod: "card",
      processingStatus: !isPaid && !isFailed ? "ignored" : "received",
    });
    paymentEventId = recorded.eventId;
  } catch (error) {
    console.error("[tagada-webhook] payment_events insert failed:", error);
  }

  if (!isPaid && !isFailed) {
    return NextResponse.json({ received: true, ignored: type });
  }

  const orderId =
    event.data?.metadata?.orderId ??
    event.data?.order?.metadata?.orderId ??
    event.metadata?.orderId ??
    (typeof event.data?.orderId === "string" &&
    event.data.orderId.startsWith("ord_")
      ? undefined
      : event.data?.orderId);

  const invoiceHint =
    event.data?.checkoutSessionId ??
    event.data?.paymentId ??
    event.data?.payment?.id ??
    event.data?.order?.id ??
    "";

  try {
    const order =
      (orderId ? await getOrder(orderId) : null) ??
      (invoiceHint ? await getOrderByInvoice(invoiceHint) : null);

    if (!order) {
      console.warn(
        `[tagada-webhook] order not found (type=${type} invoice=${invoiceHint})`
      );
      if (paymentEventId) {
        await markPaymentEventProcessed(
          paymentEventId,
          "failed",
          "psl order not found"
        );
      }
      return NextResponse.json({ received: true });
    }

    if (isFailed) {
      await markStatusIfPending(order.orderId, "failed");
      if (paymentEventId) {
        await markPaymentEventProcessed(paymentEventId, "processed");
      }
      return NextResponse.json({ received: true });
    }

    if (order.status === "paid" || order.status === "shipped") {
      await markTagadaWebhookSent(order.orderId);
      await safeRecordPaidOrderFinance(order, {
        provider: "tagada",
        providerPaymentId: invoiceHint || order.invoiceId,
        sourcePaymentEventId: paymentEventId,
      });
      return NextResponse.json({ received: true, alreadyPaid: true });
    }

    const claimed = await claimTagadaWebhook(order.orderId);
    if (!claimed) {
      return NextResponse.json({ received: true, claimed: false });
    }

    try {
      await setPaymentMethod(order.orderId, "card");
      const fulfilled = await fulfillPaidOrder(
        order.orderId,
        order.invoiceId ?? invoiceHint ?? order.orderId,
        "[tagada-webhook]"
      );
      if (!fulfilled.ok) {
        await releaseTagadaWebhookClaim(order.orderId);
        return NextResponse.json(
          { error: "Processing failed" },
          { status: 500 }
        );
      }
      await markTagadaWebhookSent(order.orderId);

      const paidOrder = await getOrder(order.orderId);
      if (paidOrder?.status === "paid" || paidOrder?.status === "shipped") {
        await trackPlausiblePurchase(paidOrder, "card", TAGADA_WEBHOOK_URL);
        await safeRecordPaidOrderFinance(paidOrder, {
          provider: "tagada",
          providerPaymentId: invoiceHint || paidOrder.invoiceId,
          sourcePaymentEventId: paymentEventId,
        });
      }

      return NextResponse.json({ received: true });
    } catch (error) {
      await releaseTagadaWebhookClaim(order.orderId);
      throw error;
    }
  } catch (error) {
    console.error("[tagada-webhook] processing error:", error);
    if (paymentEventId) {
      try {
        await markPaymentEventProcessed(
          paymentEventId,
          "failed",
          error instanceof Error ? error.message : "processing failed"
        );
      } catch {
        /* ignore */
      }
    }
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
