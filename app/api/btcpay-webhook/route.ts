import crypto from "crypto";
import { NextResponse } from "next/server";

import { sendOrderEmail } from "@/lib/email/order-notification";
import {
  claimOrderEmail,
  getOrder,
  getOrderByInvoice,
  markEmailSent,
  markPaid,
  markStatusIfPending,
  releaseOrderEmail,
} from "@/lib/orders/store";

export const runtime = "nodejs";

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("btcpay-sig") ?? "";
  const secret = process.env.BTCPAY_WEBHOOK_SECRET;

  // Signature verification runs before any processing.
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

  const expected =
    "sha256=" +
    crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  if (!safeEqual(signature, expected)) {
    console.warn("[btcpay-webhook] Invalid signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: {
    type?: string;
    invoiceId?: string;
    metadata?: { orderId?: string };
  };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const type = event.type ?? "";
  const invoiceId = event.invoiceId ?? "";
  const orderId = event.metadata?.orderId;

  const isSettled = type === "InvoiceSettled";
  const isFailed = type === "InvoiceExpired" || type === "InvoiceInvalid";
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
      return NextResponse.json({ received: true });
    }

    if (isFailed) {
      await markStatusIfPending(
        order.orderId,
        type === "InvoiceExpired" ? "cancelled" : "failed"
      );
      return NextResponse.json({ received: true });
    }

    // InvoiceSettled — mark paid (idempotent), then send exactly one email.
    await markPaid(order.orderId, order.invoiceId ?? invoiceId);

    if (!order.emailSent && (await claimOrderEmail(order.orderId))) {
      // Reload so the email reflects the persisted paid state / invoice id.
      const paidOrder = (await getOrder(order.orderId)) ?? order;
      try {
        await sendOrderEmail(paidOrder);
        await markEmailSent(order.orderId);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "email send failed";
        console.error("[btcpay-webhook] order email failed:", message);
        await releaseOrderEmail(order.orderId, message);
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("[btcpay-webhook] processing error:", error);
    // Return 500 so BTCPay retries — a transient store outage won't drop the event.
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
