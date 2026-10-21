import { NextResponse } from "next/server";
import { readRequestPrivacyConsent } from "@/lib/privacy/server";
import { consumeRequestLimit } from "@/lib/security/request-rate-limit";
import { getPriorityShippingConfig } from "@/lib/shipping/config";
import { getShippingOptionsForCheckout } from "@/lib/shipping/options";
import { GUEST_SHIPPING_ACCOUNT_ID } from "@/lib/shipping/quote";

export const runtime = "nodejs";
export const maxDuration = 30;
const headers = { "Cache-Control": "private, no-store" };

/** Read-only carrier quotation. Never reserves inventory, buys postage, or creates a payment. */
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (request.headers.get("sec-fetch-site") === "cross-site" || origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Use the checkout page to request shipping options." }, { status: 403, headers });
  }
  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 16_384) throw new Error("Request too large");
    body = JSON.parse(raw);
  } catch { return NextResponse.json({ error: "Invalid shipping request." }, { status: 400, headers }); }
  const config = getPriorityShippingConfig();
  if (config) {
    const limited = await consumeRequestLimit(request, "priority-shipping-quotes", 12, 60);
    if (limited) return limited;
  }
  try {
    const privacy = await readRequestPrivacyConsent(request).catch(() => null);
    // Empty fallback requires a valid email in this request, without an account
    // cookie or a caller-supplied account identifier.
    const result = await getShippingOptionsForCheckout(body, { id: GUEST_SHIPPING_ACCOUNT_ID, email: "" },
      { config, admin: privacy?.consent.admin === true });
    return result.ok ? NextResponse.json(result.data, { headers })
      : NextResponse.json({ error: result.error }, { status: result.status, headers });
  } catch {
    return NextResponse.json({ error: "Shipping options could not be checked. You can continue with standard shipping." }, { status: 503, headers });
  }
}
