import crypto from "crypto";
import { NextResponse } from "next/server";

import { fulfillPaidOrder } from "@/lib/orders/fulfill-paid-order";
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

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function verifyTagadaWebhook(
  rawBody: string,
  secret: string,
  signatureHeader: string | null
): boolean {
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const expected = signatureHeader.slice("sha256=".length);
  const hmac = crypto
    .createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("hex");
  try {
    return safeEqual(expected, hmac);
  } catch {
    return false;
  }
}

type TagadaWebhookEvent = {
  type?: string;
  eventType?: string;
  data?: {
    orderId?: string;
    checkoutSessionId?: string;
    paymentId?: string;
    metadata?: { orderId?: string };
    order?: { id?: string; metadata?: { orderId?: string } };
    payment?: { id?: string; status?: string };
  };
  metadata?: { orderId?: string };
};

/**
 * Backup receiver when the browser never calls /api/checkout/card after pay.
 * Mirrors BTCPay webhook: verify HMAC, fulfill idempotently, return 500 to retry.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature =
    request.headers.get("x-tagadapay-signature") ??
    request.headers.get("X-TagadaPay-Signature");
  const secret = process.env.TAGADA_WEBHOOK_SECRET?.trim();

  if (secret) {
    if (!signature) {
      return NextResponse.json({ error: "Missing signature" }, { status: 401 });
    }
    if (!verifyTagadaWebhook(rawBody, secret, signature)) {
      console.warn("[tagada-webhook] Invalid signature");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  } else {
    console.warn(
      "[tagada-webhook] TAGADA_WEBHOOK_SECRET not set — accepting unverified payload (configure in production)"
    );
  }

  let event: TagadaWebhookEvent;
  try {
    event = JSON.parse(rawBody) as TagadaWebhookEvent;
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const type = event.type ?? event.eventType ?? "";
  const isPaid =
    type === "order/paid" ||
    type === "payment/succeeded" ||
    type === "payment.succeeded";
  const isFailed =
    type === "order/failed" ||
    type === "payment/failed" ||
    type === "payment/rejected";

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
      return NextResponse.json({ received: true });
    }

    if (isFailed) {
      await markStatusIfPending(order.orderId, "failed");
      return NextResponse.json({ received: true });
    }

    if (order.status === "paid") {
      await markTagadaWebhookSent(order.orderId);
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
      return NextResponse.json({ received: true });
    } catch (error) {
      await releaseTagadaWebhookClaim(order.orderId);
      throw error;
    }
  } catch (error) {
    console.error("[tagada-webhook] processing error:", error);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
