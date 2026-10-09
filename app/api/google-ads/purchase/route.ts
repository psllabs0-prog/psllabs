import { NextResponse } from "next/server";
import { getVerifiedGooglePurchaseReceipt, isGooglePurchaseOrderId } from "@/lib/google-ads/purchase";
import { readRequestPrivacyConsent } from "@/lib/privacy/server";

export const runtime = "nodejs";

/** A receipt is proof of a verified payment, not a public order/customer record. */
export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store, max-age=0", "Vary": "Cookie, Sec-GPC" };
  try {
    const orderId = new URL(request.url).searchParams.get("orderId");
    if (request.headers.get("Sec-GPC") === "1" || !isGooglePurchaseOrderId(orderId)) {
      return NextResponse.json({ purchase: null }, { headers });
    }
    const privacy = await readRequestPrivacyConsent(request);
    if (!privacy.binding || !privacy.consent.measurement || !privacy.consent.capabilities.googleMeasurement ||
        privacy.consent.admin || privacy.consent.gpc) {
      return NextResponse.json({ purchase: null }, { headers });
    }
    return NextResponse.json({ purchase: await getVerifiedGooglePurchaseReceipt(orderId, privacy.binding) }, { headers });
  } catch {
    return NextResponse.json({ purchase: null }, { headers });
  }
}
