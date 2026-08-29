import { NextResponse } from "next/server";

import { getOrderByEmailAndId } from "@/lib/orders/store";
import { toTrackedOrder } from "@/lib/orders/tracking";

export const runtime = "nodejs";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  let body: { email?: unknown; orderId?: unknown };
  try {
    body = (await request.json()) as { email?: unknown; orderId?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
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

    return NextResponse.json(
      { found: true, order: toTrackedOrder(order) },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("[track] lookup failed:", error);
    return NextResponse.json({ error: "Lookup failed." }, { status: 500 });
  }
}
