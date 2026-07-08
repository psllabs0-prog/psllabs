import { NextResponse } from "next/server";

import { getOrder } from "@/lib/orders/store";
import { toPublicOrder } from "@/lib/orders/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const orderId = new URL(request.url).searchParams.get("orderId");
  if (!orderId) {
    return NextResponse.json({ error: "Missing orderId" }, { status: 400 });
  }

  try {
    const order = await getOrder(orderId);
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    return NextResponse.json(
      { order: toPublicOrder(order) },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("[order-status] lookup failed:", error);
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
}
