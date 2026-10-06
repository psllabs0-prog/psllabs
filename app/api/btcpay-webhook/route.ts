import { NextResponse } from "next/server";

import { recordProviderEvent, safeRecordPaidOrderFinance } from "@/lib/finance/record";
import { verifyBtcpayWebhookSignature } from "@/lib/finance/webhook-verify";
import { markPaymentEventProcessed } from "@/lib/finance/store";
import { fulfillPaidOrder } from "@/lib/orders/fulfill-paid-order";
import { safeTrackVerifiedPurchase } from "@/lib/openai-ads/delivery";
import { safeRecordVerifiedGooglePurchase } from "@/lib/google-ads/purchase";
import { verifyBtcpayInvoice, type BtcpayTerminalStatus } from "@/lib/payments/btcpay-verify";
import { trackPlausiblePurchase } from "@/lib/plausible";
import { getOrder, getOrderByInvoice, markStatusIfPending } from "@/lib/orders/store";

export const runtime = "nodejs";

const BTCPAY_WEBHOOK_URL = "https://psllabs.org/api/btcpay-webhook";
const MAX_WEBHOOK_BYTES = 128 * 1024;

type BtcpayWebhookEvent = {
  deliveryId?: string;
  originalDeliveryId?: string;
  type?: string;
  timestamp?: number;
  storeId?: string;
  invoiceId?: string;
};

export async function POST(request: Request) {
  const secret = process.env.BTCPAY_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  const signature = request.headers.get("btcpay-sig") ?? "";
  if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 401 });
  if (Number(request.headers.get("content-length")) > MAX_WEBHOOK_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_WEBHOOK_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }
  if (!verifyBtcpayWebhookSignature(rawBody, secret, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: BtcpayWebhookEvent;
  try {
    const parsed: unknown = JSON.parse(rawBody);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid payload");
    event = parsed as BtcpayWebhookEvent;
    for (const field of ["deliveryId", "originalDeliveryId", "type", "storeId", "invoiceId"] as const) {
      if (event[field] !== undefined && (typeof event[field] !== "string" || event[field]!.length > 256)) {
        throw new Error("Invalid payload");
      }
    }
    if (event.timestamp !== undefined && (typeof event.timestamp !== "number" || !Number.isFinite(new Date(event.timestamp * 1000).getTime()))) {
      throw new Error("Invalid payload");
    }
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const expectedStatuses: Record<string, BtcpayTerminalStatus> = {
    InvoiceSettled: "Settled", InvoiceExpired: "Expired", InvoiceInvalid: "Invalid",
  };
  const type = event.type ?? "";
  const expectedStatus = expectedStatuses[type];
  if (!expectedStatus) return NextResponse.json({ received: true, ignored: type });

  const storeId = process.env.BTCPAY_STORE_ID?.trim();
  if (!storeId) return NextResponse.json({ error: "Provider not configured" }, { status: 503 });
  const invoiceId = event.invoiceId ?? "";
  if (!invoiceId || event.storeId !== storeId) {
    return NextResponse.json({ error: "Invoice binding mismatch" }, { status: 409 });
  }

  let paymentEventId: number | null = null;
  try {
    // Webhook metadata is never authority for selecting an order.
    const order = await getOrderByInvoice(invoiceId);
    if (!order) return NextResponse.json({ received: true, ignored: "unknown_invoice" });

    const verified = await verifyBtcpayInvoice(order, invoiceId, expectedStatus);
    if (!verified.ok) {
      return NextResponse.json({ error: "Unable to verify invoice", reason: verified.reason }, { status: verified.status });
    }
    const binding = { paymentMethod: "bitcoin" as const, total: verified.total, currency: verified.currency };
    const isSettled = expectedStatus === "Settled";
    // All local payment/order/finance mutations follow authenticated provider proof.
    try {
      const recorded = await recordProviderEvent({
        provider: "btcpay",
        providerEventId: event.deliveryId || event.originalDeliveryId || `${type}:${invoiceId}:${event.timestamp ?? "na"}`,
        eventType: type, rawEvent: event, providerPaymentId: invoiceId,
        pslOrderId: order.orderId,
        eventTimestamp: event.timestamp !== undefined ? new Date(event.timestamp * 1000).toISOString() : new Date().toISOString(),
        paymentStatus: expectedStatus.toLowerCase(), paymentMethod: "bitcoin", processingStatus: "received",
      });
      paymentEventId = recorded.eventId;
    } catch {
      console.error("[btcpay-webhook] verified payment event persistence failed");
    }

    if (!isSettled) {
      await markStatusIfPending(order.orderId, expectedStatus === "Expired" ? "cancelled" : "failed", { ...binding, invoiceId });
      if (paymentEventId) await markPaymentEventProcessed(paymentEventId, "processed");
      return NextResponse.json({ received: true });
    }

    const wasAlreadyPaid = order.status === "paid" || order.status === "shipped";
    const fulfilled = await fulfillPaidOrder(order.orderId, invoiceId, "[btcpay-webhook]", binding);
    if (!fulfilled.ok) {
      if (paymentEventId) await markPaymentEventProcessed(paymentEventId, "failed", "verified invoice snapshot changed or fulfillment failed");
      return NextResponse.json({ error: "Unable to fulfill verified invoice" }, { status: 503 });
    }

    const paidOrder = await getOrder(order.orderId);
    if (paidOrder && ["paid", "shipped"].includes(paidOrder.status) &&
        paidOrder.paymentMethod === binding.paymentMethod && paidOrder.invoiceId === invoiceId &&
        paidOrder.total === binding.total && paidOrder.currency === binding.currency) {
      if (!wasAlreadyPaid) await trackPlausiblePurchase(paidOrder, "bitcoin", BTCPAY_WEBHOOK_URL);
      await safeRecordPaidOrderFinance(paidOrder, {
        provider: "btcpay", providerPaymentId: invoiceId, sourcePaymentEventId: paymentEventId,
      });
      await safeTrackVerifiedPurchase(paidOrder, { provider: "btcpay", paymentId: invoiceId });
      await safeRecordVerifiedGooglePurchase(paidOrder, { provider: "btcpay", paymentId: invoiceId });
      if (paymentEventId) await markPaymentEventProcessed(paymentEventId, "processed");
    }
    return NextResponse.json({ received: true });
  } catch {
    console.error("[btcpay-webhook] verified invoice processing failed");
    if (paymentEventId) {
      try { await markPaymentEventProcessed(paymentEventId, "failed", "processing failed"); } catch { /* retry */ }
    }
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
