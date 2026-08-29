import { NextResponse } from "next/server";

import { getOrderByEmailAndId } from "@/lib/orders/store";
import { toTrackedOrder } from "@/lib/orders/tracking";
import { trackShipment } from "@/lib/shippo";

export const runtime = "nodejs";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  let body: {
    email?: unknown;
    orderId?: unknown;
    trackingNumber?: unknown;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const trackingNumber =
    typeof body.trackingNumber === "string" ? body.trackingNumber.trim() : "";

  if (trackingNumber) {
    try {
      const shipment = await trackShipment(trackingNumber);
      return NextResponse.json({
        mode: "tracking",
        shipment,
      });
    } catch (error) {
      console.error("[track] shippo lookup failed:", error);
      return NextResponse.json(
        { error: "Unable to find tracking information for that number." },
        { status: 404 }
      );
    }
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const orderId = typeof body.orderId === "string" ? body.orderId.trim() : "";

  if (!email || !orderId || email.length > 254 || !EMAIL_PATTERN.test(email)) {
    return NextResponse.json({ found: false });
  }

  if (orderId.length > 128) {
    return NextResponse.json({ found: false });
  }

  try {
    const order = await getOrderByEmailAndId(email, orderId);
    if (!order) {
      return NextResponse.json({ found: false });
    }

    const tracked = toTrackedOrder(order);
    let shipment = null;

    if (order.trackingNumber) {
      try {
        shipment = await trackShipment(
          order.trackingNumber,
          order.trackingCarrier ?? "usps"
        );
      } catch (error) {
        console.warn("[track] shippo lookup for order failed:", error);
      }
    }

    return NextResponse.json(
      {
        found: true,
        mode: "order",
        order: tracked,
        shipment,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("[track] lookup failed:", error);
    return NextResponse.json({ error: "Lookup failed." }, { status: 500 });
  }
}
