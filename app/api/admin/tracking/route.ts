import { NextResponse } from "next/server";

import { requireAdminAuth } from "@/lib/admin/require-auth";
import { ensureBtcpostageSchema } from "@/lib/btcpostage/schema";
import { getSuggestedTrackingForPaidOrders } from "@/lib/btcpostage/store";
import { dispatchTrackingNotification } from "@/lib/fulfillment/tracking-notification";
import { privateDigest, saveTrackingAndQueue, shippingPaymentBlocked } from "@/lib/fulfillment/shipping-flow-store";
import {
  getOrder,
  getOrdersNeedingTracking,
} from "@/lib/orders/store";

export const runtime = "nodejs";
export const maxDuration = 90;

export async function GET() {
  const authError = await requireAdminAuth();
  if (authError) return authError;

  try {
    await ensureBtcpostageSchema();
    const orders = await getOrdersNeedingTracking();
    const suggestedTracking = await getSuggestedTrackingForPaidOrders(
      orders.map((o) => o.orderId)
    );
    return NextResponse.json({ orders, suggestedTracking });
  } catch (error) {
    console.error("[admin/tracking GET]", error);
    return NextResponse.json(
      { error: "Unable to load orders." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const authError = await requireAdminAuth();
  if (authError) return authError;

  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Same-origin request required." }, { status: 403 });
  }

  let body: { orderId?: unknown; trackingNumber?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const orderId = typeof body.orderId === "string" ? body.orderId.trim() : "";
  const trackingNumber =
    typeof body.trackingNumber === "string" ? body.trackingNumber.trim() : "";

  if (!orderId) {
    return NextResponse.json({ error: "Order ID is required." }, { status: 400 });
  }

  if (!trackingNumber || trackingNumber.length > 64) {
    return NextResponse.json(
      { error: "A valid tracking number is required." },
      { status: 400 }
    );
  }

  try {
    const order = await getOrder(orderId);
    if (!order || !["paid", "shipped"].includes(order.status)) {
      return NextResponse.json(
        { error: "Order not found or not eligible for tracking." },
        { status: 404 }
      );
    }

    if (await shippingPaymentBlocked(orderId)) {
      return NextResponse.json({ error: "Payment reconciliation needs review before carrier handoff." }, { status: 409 });
    }

    await saveTrackingAndQueue({
      orderId,
      trackingNumber,
      carrier: "USPS",
      recipientHash: privateDigest(order.email.trim().toLowerCase()),
      recipientEmail: order.email,
      markShipped: true,
    });
    // Manual mark-shipped retains its existing send behavior, while sharing the
    // same claim as label-ready notifications to prevent duplicate delivery.
    const notification = await dispatchTrackingNotification(orderId, true);
    const shippingEmailSent = notification?.status === "sent";
    const shippingEmailError = shippingEmailSent
      ? null
      : notification?.lastError ?? "Tracking saved; the notification is pending.";

    return NextResponse.json({
      ok: true,
      orderId,
      trackingNumber,
      trackingCarrier: "USPS",
      shippingEmailSent,
      shippingEmailError,
    });
  } catch (error) {
    console.error("[admin/tracking POST]", error);
    return NextResponse.json(
      { error: "Unable to save tracking number." },
      { status: 500 }
    );
  }
}
