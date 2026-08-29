import { NextResponse } from "next/server";

import { requireAdminAuth } from "@/lib/admin/require-auth";
import { sendOrderShippedEmail } from "@/lib/email/order-shipped";
import {
  getOrder,
  getOrdersNeedingTracking,
  markTrackingEmailSent,
  setOrderTracking,
} from "@/lib/orders/store";

export const runtime = "nodejs";

export async function GET() {
  const authError = await requireAdminAuth();
  if (authError) return authError;

  try {
    const orders = await getOrdersNeedingTracking();
    return NextResponse.json({ orders });
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
    const updated = await setOrderTracking(orderId, trackingNumber, "USPS");
    if (!updated) {
      return NextResponse.json(
        { error: "Order not found or not eligible for tracking." },
        { status: 404 }
      );
    }

    const order = await getOrder(orderId);
    let shippingEmailSent = false;
    let shippingEmailError: string | null = null;

    if (order && !order.trackingEmailSent) {
      try {
        await sendOrderShippedEmail(order);
        await markTrackingEmailSent(orderId);
        shippingEmailSent = true;
      } catch (error) {
        shippingEmailError =
          error instanceof Error
            ? error.message
            : "Unable to send shipping confirmation email.";
        console.error("[admin/tracking POST] shipping email failed:", error);
      }
    } else if (order?.trackingEmailSent) {
      shippingEmailSent = true;
    }

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
