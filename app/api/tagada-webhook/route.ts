import { NextResponse } from "next/server";

import {
  recordProviderEvent,
  safeRecordPaidOrderFinance,
} from "@/lib/finance/record";
import { markPaymentEventProcessed } from "@/lib/finance/store";
import { verifyTagadaWebhookSignature } from "@/lib/finance/webhook-verify";
import { fulfillPaidOrder } from "@/lib/orders/fulfill-paid-order";
import { safeTrackVerifiedPurchase } from "@/lib/openai-ads/delivery";
import { trackPlausiblePurchase } from "@/lib/plausible";
import { getTagadaServerClient } from "@/lib/tagada/server";
import { verifyTagadaCardPayment } from "@/lib/tagada/verify-payment";
import {
  claimTagadaWebhook,
  getOrder,
  getOrderByInvoice,
  markTagadaWebhookSent,
  releaseTagadaWebhookClaim,
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
 * Optional TagadaPay signed webhook receiver (backup path).
 *
 * Primary Tagada finance capture is the successful checkout fulfill path.
 * Daily reconciliation uses the authenticated Tagada API + pay_/ord_ ids.
 *
 * TAGADA_WEBHOOK_SECRET is optional for launch — when absent this endpoint
 * rejects all deliveries (never accepts unsigned payloads). Configuring a
 * webhook later is additive, not required for Phase 1.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature =
    request.headers.get("x-tagadapay-signature") ??
    request.headers.get("X-TagadaPay-Signature");
  const secret = process.env.TAGADA_WEBHOOK_SECRET?.trim();
  const headerEventId = request.headers.get("x-tagadapay-event-id");

  if (!secret) {
    console.warn(
      "[tagada-webhook] TAGADA_WEBHOOK_SECRET not set — webhook optional; rejecting delivery (unsigned not accepted)"
    );
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
    if (!event || typeof event !== "object" || Array.isArray(event)) {
      throw new Error("Invalid event");
    }
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
      // Preserve metadata in the raw event, but do not link a financial event
      // to a local order until authenticated evidence establishes ownership.
      pslOrderId: null,
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
  if (isFailed) {
    // A failed attempt must not cancel a reservation identified only by
    // customer-editable metadata. Keep it pending for a possible retry.
    if (paymentEventId) await markPaymentEventProcessed(paymentEventId, "processed");
    return NextResponse.json({ received: true });
  }

  const orderId =
    event.data?.metadata?.orderId ??
    event.data?.order?.metadata?.orderId ??
    event.metadata?.orderId ??
    (typeof event.data?.orderId === "string" &&
    /^(?:ord|order)_/.test(event.data.orderId)
      ? undefined
      : event.data?.orderId);

  const invoiceHint =
    event.data?.checkoutSessionId ??
    event.data?.paymentId ??
    event.data?.payment?.id ??
    event.data?.order?.id ??
    "";

  try {
    const paymentHint = event.data?.paymentId ?? event.data?.payment?.id;
    const providerOrderHint = event.data?.order?.id ??
      (/^(?:ord|order)_/.test(event.data?.orderId ?? "") ? event.data?.orderId : undefined);
    // Resolve the local order through the provider's original checkout token.
    // Event metadata remains a hint and never authorizes fulfillment.
    const tagada = getTagadaServerClient();
    let boundCheckoutToken = "";
    let linkedProviderOrderId = providerOrderHint;
    if (!linkedProviderOrderId && paymentHint && /^pay(?:ment)?_[A-Za-z0-9_-]+$/.test(paymentHint)) {
      const payment = await tagada.payments.retrieve(paymentHint, { timeout: 4000 });
      linkedProviderOrderId = payment.orderId;
    }
    if (linkedProviderOrderId && /^(?:ord|order)_[A-Za-z0-9_-]+$/.test(linkedProviderOrderId)) {
      const provider = await tagada.orders.retrieve(linkedProviderOrderId, { timeout: 4000 });
      const session = provider.order.checkoutSession;
      if (session && typeof session === "object" && "checkoutToken" in session &&
          typeof session.checkoutToken === "string") {
        boundCheckoutToken = session.checkoutToken;
      }
    }
    const order =
      (boundCheckoutToken ? await getOrderByInvoice(boundCheckoutToken) : null) ??
      (orderId ? await getOrder(orderId) : null) ??
      (invoiceHint ? await getOrderByInvoice(invoiceHint) : null);

    if (!order) {
      console.warn(
        `[tagada-webhook] order not found (type=${type})`
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

    const verification = await verifyTagadaCardPayment(order, {
      paymentId: paymentHint,
      tagadaOrderId: providerOrderHint,
    });
    if (!verification.ok) {
      if (paymentEventId) {
        await markPaymentEventProcessed(paymentEventId, "failed", verification.reason);
      }
      return NextResponse.json(
        { error: "Payment confirmation pending" },
        { status: verification.retryable ? 503 : 409 }
      );
    }
    if (order.status === "paid" || order.status === "shipped") {
      await markTagadaWebhookSent(order.orderId);
      await safeRecordPaidOrderFinance(order, {
        provider: "tagada",
        providerPaymentId: verification.paymentId,
        sourcePaymentEventId: paymentEventId,
      });
      await safeTrackVerifiedPurchase(order, {
        provider: "tagada", paymentId: verification.paymentId,
      });
      return NextResponse.json({ received: true, alreadyPaid: true });
    }
    if (order.status !== "pending") {
      return NextResponse.json({ error: "Order is no longer pending" }, { status: 409 });
    }

    const claimed = await claimTagadaWebhook(order.orderId);
    if (!claimed) {
      return NextResponse.json({ received: true, claimed: false });
    }

    try {
      const fulfilled = await fulfillPaidOrder(
        order.orderId,
        order.invoiceId!,
        "[tagada-webhook]",
        { paymentMethod: "card", total: order.total, currency: order.currency }
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
          providerPaymentId: verification.paymentId,
          sourcePaymentEventId: paymentEventId,
        });
        if (paidOrder.paymentMethod === "card" && paidOrder.invoiceId === order.invoiceId &&
            paidOrder.total === order.total && paidOrder.currency === order.currency) {
          await safeTrackVerifiedPurchase(paidOrder, {
            provider: "tagada", paymentId: verification.paymentId,
          });
        }
      }

      return NextResponse.json({ received: true });
    } catch (error) {
      await releaseTagadaWebhookClaim(order.orderId);
      throw error;
    }
  } catch (error) {
    // SDK error objects may contain tokens or customer response bodies.
    console.error("[tagada-webhook] processing error:", error instanceof Error ? error.name : "unknown");
    if (paymentEventId) {
      try {
        await markPaymentEventProcessed(
          paymentEventId,
          "failed",
          "provider verification or fulfillment failed"
        );
      } catch {
        /* ignore */
      }
    }
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
