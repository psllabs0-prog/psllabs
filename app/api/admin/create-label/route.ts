import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/admin/auth";
import { getOrder, markOrderShipped } from "@/lib/orders/store";
import { createLabel } from "@/lib/shippo";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: { orderId?: unknown };
  try {
    body = (await request.json()) as { orderId?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const orderId = typeof body.orderId === "string" ? body.orderId.trim() : "";
  if (!orderId) {
    return NextResponse.json({ error: "Order ID is required." }, { status: 400 });
  }

  try {
    const order = await getOrder(orderId);
    if (!order) {
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }

    if (order.status !== "paid" && order.status !== "shipped") {
      return NextResponse.json(
        { error: "Labels can only be created for paid orders." },
        { status: 409 }
      );
    }

    const label = await createLabel(order);
    await markOrderShipped(orderId, label.trackingNumber, label.carrier);

    return NextResponse.json({
      ok: true,
      trackingNumber: label.trackingNumber,
      trackingCarrier: label.carrier,
      labelUrl: label.labelUrl,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to create shipping label.";
    console.error("[admin/create-label]", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
