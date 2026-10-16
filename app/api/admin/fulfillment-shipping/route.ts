import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin/require-auth";
import { completeFulfillmentTracking, getFulfillmentShippingStatus, prepareFulfillmentLabel, purchaseFulfillmentLabel, recordExternalFulfillmentTrackingEmail } from "@/lib/fulfillment/shipping-flow";

export const runtime = "nodejs";
export const maxDuration = 90;
const reply = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
export async function GET(request: Request) {
  const authError = await requireAdminAuth();
  if (authError) {
    authError.headers.set("Cache-Control", "private, no-store");
    return authError;
  }
  const orderId = new URL(request.url).searchParams.get("orderId")?.trim();
  if (!orderId || orderId.length > 150) return reply({ error: "A valid order ID is required." }, 400);
  try { return reply(await getFulfillmentShippingStatus(orderId)); }
  catch { return reply({ error: "Shipping status could not be loaded. No purchase was attempted." }, 409); }
}
export async function POST(request: Request) {
  const authError = await requireAdminAuth();
  if (authError) {
    authError.headers.set("Cache-Control", "private, no-store");
    return authError;
  }
  if (request.headers.get("origin") !== new URL(request.url).origin) return reply({ error: "Same-origin request required." }, 403);
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return reply({ error: "Invalid request." }, 400); }
  const orderId = typeof body?.orderId === "string" ? body.orderId.trim() : "";
  if (!orderId || orderId.length > 150) return reply({ error: "A valid order ID is required." }, 400);
  try {
    if (body.action === "prepare") return reply(await prepareFulfillmentLabel(orderId));
    if (body.action === "purchase") return reply(await purchaseFulfillmentLabel({ orderId,
      previewToken: typeof body.previewToken === "string" ? body.previewToken : "", confirmPurchase: body.confirmPurchase === true }));
    if (body.action === "complete_tracking") return reply(await completeFulfillmentTracking(orderId));
    if (body.action === "record_external_email") return reply(await recordExternalFulfillmentTrackingEmail({ orderId,
      externalReceipt: typeof body.externalReceipt === "string" ? body.externalReceipt : "", confirmRecorded: body.confirmRecorded === true }));
    return reply({ error: "Unknown shipping action." }, 400);
  } catch {
    // Provider errors can contain response bodies or customer details. Status is
    // the safe recovery action whether failure preceded or followed purchase.
    return reply({ ok: false, error: "Shipping could not be completed. Check status before trying again; an existing purchase must be retrieved instead of purchased again.", checkStatusFirst: true }, 409);
  }
}
