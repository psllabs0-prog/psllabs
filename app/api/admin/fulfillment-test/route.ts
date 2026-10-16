import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin/require-auth";
import { manualTestAction, manualTestStatus } from "@/lib/fulfillment/manual-test";
import { ManualFixtureError } from "@/lib/fulfillment/manual-test-diagnostics";
import { parseManualTestAddress } from "@/lib/fulfillment/manual-test-address";

export const runtime = "nodejs";
export const maxDuration = 90;
const reply = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
async function authenticate() {
  const error = await requireAdminAuth();
  if (error) error.headers.set("Cache-Control", "private, no-store");
  return error;
}
export async function GET() {
  const denied = await authenticate(); if (denied) return denied;
  try { return reply(await manualTestStatus()); }
  catch { return reply({ error: "The private test fixture could not be loaded. No label or email was requested." }, 409); }
}
export async function POST(request: Request) {
  const denied = await authenticate(); if (denied) return denied;
  if (request.headers.get("origin") !== new URL(request.url).origin) return reply({ error: "Same-origin request required." }, 403);
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return reply({ error: "Invalid request." }, 400); }
  if (!body || !["create_test_order", "prepare", "purchase", "retrieve", "send_test_email", "update_test_address"].includes(String(body.action))) return reply({ error: "Unknown test action." }, 400);
  const testAddress = body.action === "update_test_address" ? parseManualTestAddress({ address: body.address, street2: body.street2, city: body.city, state: body.state, zip: body.zip }) : null;
  if (body.action === "update_test_address" && !testAddress) return reply({ error: "Enter a valid physical U.S. test address. No label or email was requested." }, 400);
  try { return reply(await manualTestAction(String(body.action), { previewToken: typeof body.previewToken === "string" ? body.previewToken : undefined, confirmPurchase: body.confirmPurchase === true,
    ...(testAddress ? { testAddress } : {}) })); }
  catch (error) {
    if (error instanceof ManualFixtureError) return reply({ error: error.message, stage: error.stage, operatorErrorCode: error.operatorErrorCode }, 409);
    return reply({ error: "The test action needs review. Refresh its saved status before another attempt; no blind purchase or email retry is allowed." }, 409);
  }
}
