import { NextResponse } from "next/server";

import {
  recordProviderEvent,
  safeRecordPaidOrderFinance,
} from "@/lib/finance/record";
import { verifyBtcpayWebhookSignature } from "@/lib/finance/webhook-verify";
import { markPaymentEventProcessed } from "@/lib/finance/store";
import { fulfillPaidOrder } from "@/lib/orders/fulfill-paid-order";
import { trackPlausiblePurchase } from "@/lib/plausible";
import {
  getOrder,
  getOrderByInvoice,
  markStatusIfPending,
} from "@/lib/orders/store";

export const runtime = "nodejs";

const BTCPAY_WEBHOOK_URL = "https://psllabs.org/api/btcpay-webhook";

type BtcpayWebhookEvent = {
  deliveryId?: string;
  webhookId?: string;
  originalDeliveryId?: string;
  isRedelivery?: boolean;
  type?: string;
  timestamp?: number;
  storeId?: string;
  invoiceId?: string;
  metadata?: { orderId?: string };
};

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("btcpay-sig") ?? "";
  const secret = process.env.BTCPAY_WEBHOOK_SECRET;

  if (!secret) {
    console.error("[btcpay-webhook] BTCPAY_WEBHOOK_SECRET is not set");
    return NextResponse.json(
      { error: "Webhook not configured" },
      { status: 500 }
    );
  }
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 401 });
  }

  if (!verifyBtcpayWebhookSignature(rawBody, secret, signature)) {
    console.warn("[btcpay-webhook] Invalid signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: BtcpayWebhookEvent;
  try {
    event = JSON.parse(rawBody) as BtcpayWebhookEvent;
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const type = event.type ?? "";
  const invoiceId = event.invoiceId ?? "";
  const orderId = event.metadata?.orderId;
  const providerEventId =
    event.deliveryId ||
    event.originalDeliveryId ||
    `${type}:${invoiceId}:${event.timestamp ?? "na"}`;

  const isSettled = type === "InvoiceSettled";
  const isFailed = type === "InvoiceExpired" || type === "InvoiceInvalid";

  let paymentEventId: number | null = null;
  try {
    const recorded = await recordProviderEvent({
      provider: "btcpay",
      providerEventId,
      eventType: type || "unknown",
      rawEvent: event,
      providerPaymentId: invoiceId || null,
      pslOrderId: orderId ?? null,
      eventTimestamp: event.timestamp
        ? new Date(event.timestamp * 1000).toISOString()
        : new Date().toISOString(),
      paymentStatus: isSettled
        ? "settled"
        : isFailed
          ? type === "InvoiceExpired"
            ? "expired"
            : "invalid"
          : type || null,
      paymentMethod: "bitcoin",
      processingStatus: !isSettled && !isFailed ? "ignored" : "received",
    });
    paymentEventId = recorded.eventId;
    if (!recorded.created && isSettled) {
      // Duplicate delivery of a settled event — still ensure finance, but skip re-fulfill noise.
    }
  } catch (error) {
    console.error("[btcpay-webhook] payment_events insert failed:", error);
  }

  if (!isSettled && !isFailed) {
    return NextResponse.json({ received: true, ignored: type });
  }

  try {
    const order =
      (orderId ? await getOrder(orderId) : null) ??
      (invoiceId ? await getOrderByInvoice(invoiceId) : null);

    if (!order) {
      console.warn(
        `[btcpay-webhook] order not found (type=${type} invoice=${invoiceId})`
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
      await markStatusIfPending(
        order.orderId,
        type === "InvoiceExpired" ? "cancelled" : "failed"
      );
      if (paymentEventId) {
        await markPaymentEventProcessed(paymentEventId, "processed");
      }
      return NextResponse.json({ received: true });
    }

    const wasAlreadyPaid =
      order.status === "paid" || order.status === "shipped";

    await fulfillPaidOrder(
      order.orderId,
      order.invoiceId ?? invoiceId,
      "[btcpay-webhook]"
    );

    const paidOrder = await getOrder(order.orderId);
    if (paidOrder?.status === "paid" || paidOrder?.status === "shipped") {
      if (!wasAlreadyPaid) {
        await trackPlausiblePurchase(paidOrder, "bitcoin", BTCPAY_WEBHOOK_URL);
      }
      await safeRecordPaidOrderFinance(paidOrder, {
        provider: "btcpay",
        providerPaymentId: invoiceId || paidOrder.invoiceId,
        sourcePaymentEventId: paymentEventId,
      });
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("[btcpay-webhook] processing error:", error);
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
    // Return 500 so BTCPay retries — a transient store outage won't drop the event.
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
