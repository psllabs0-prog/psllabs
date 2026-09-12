import { NextResponse } from "next/server";

import { requireAdminAuth } from "@/lib/admin/require-auth";
import { buildPackingSlipHtml } from "@/lib/fulfillment/packing-slip";
import { ensureFulfillmentSchema } from "@/lib/fulfillment/schema";
import {
  collectFulfillmentBoard,
  markPacked,
  placeManualHold,
  removeManualHold,
  startPacking,
} from "@/lib/fulfillment/store";
import { getOrder } from "@/lib/orders/store";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const authError = await requireAdminAuth();
  if (authError) return authError;

  try {
    await ensureFulfillmentSchema();
    const url = new URL(request.url);
    const slipOrderId = url.searchParams.get("packingSlip");
    if (slipOrderId) {
      const order = await getOrder(slipOrderId);
      if (!order) {
        return NextResponse.json({ error: "Order not found" }, { status: 404 });
      }
      return new NextResponse(buildPackingSlipHtml(order), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    const board = await collectFulfillmentBoard();
    return NextResponse.json({
      summary: board.summary,
      pickList: board.pickList,
      ready: board.ready.map(sanitizeCard),
      hold: board.hold.map(sanitizeCard),
      packed: board.packed.map(sanitizeCard),
    });
  } catch (error) {
    console.error("[admin/fulfillment] GET", error);
    return NextResponse.json(
      { error: "Unable to load fulfillment board." },
      { status: 500 }
    );
  }
}

function sanitizeCard<T extends { email: string }>(card: T): T {
  // Admin-only route; keep email for ops but never send to analytics.
  return card;
}

export async function POST(request: Request) {
  const authError = await requireAdminAuth();
  if (authError) return authError;

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const action = typeof body.action === "string" ? body.action : "";
  const orderId = typeof body.orderId === "string" ? body.orderId : "";

  try {
    if (!orderId && action !== "refresh") {
      return NextResponse.json({ error: "orderId required" }, { status: 400 });
    }

    if (action === "start_packing") {
      const ok = await startPacking(orderId);
      return NextResponse.json({ ok });
    }
    if (action === "mark_packed") {
      const ok = await markPacked(orderId);
      return NextResponse.json({ ok });
    }
    if (action === "place_hold") {
      const reason =
        typeof body.reason === "string" ? body.reason : "Manual hold";
      const ok = await placeManualHold(orderId, reason);
      return NextResponse.json({ ok });
    }
    if (action === "remove_hold") {
      const ok = await removeManualHold(orderId);
      return NextResponse.json({ ok });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("[admin/fulfillment] POST", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Action failed",
      },
      { status: 500 }
    );
  }
}
