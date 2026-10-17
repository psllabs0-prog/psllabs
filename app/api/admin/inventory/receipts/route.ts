import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin/require-auth";
import { isSameOriginMutation } from "@/lib/security/request-origin";
import { getInventoryReceiptSnapshot, recordInventoryReceipt } from "@/lib/inventory/receipts";
import { InventoryReceiptError } from "@/lib/inventory/receipt-validation";

export const runtime = "nodejs";

function reply(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function GET(request: Request) {
  const authError = await requireAdminAuth();
  if (authError) { authError.headers.set("Cache-Control", "private, no-store"); return authError; }
  try {
    return reply(await getInventoryReceiptSnapshot(new URL(request.url).searchParams.get("reference") ?? undefined));
  } catch (error) {
    if (error instanceof InventoryReceiptError) return reply({ error: error.message }, error.status);
    return reply({ error: "Inventory receipts could not be loaded. Refresh before recording a shipment." }, 503);
  }
}

export async function POST(request: Request) {
  const authError = await requireAdminAuth();
  if (authError) { authError.headers.set("Cache-Control", "private, no-store"); return authError; }
  if (!isSameOriginMutation(request)) return reply({ error: "Same-origin admin request required." }, 403);
  let input: unknown;
  try {
    const text = await request.text();
    if (text.length > 16_000) return reply({ error: "Receipt request is too large." }, 413);
    input = JSON.parse(text);
  } catch { return reply({ error: "Invalid receipt JSON." }, 400); }
  try {
    return reply(await recordInventoryReceipt(input));
  } catch (error) {
    if (error instanceof InventoryReceiptError) return reply({ error: error.message }, error.status);
    // A network failure may follow a committed transaction. Reconcile by reference; never auto-resubmit.
    return reply({ error: "Receipt outcome is uncertain. Refresh this reference to check its saved receipt before retrying.", checkReferenceFirst: true }, 503);
  }
}
