import { isIP } from "node:net";
import { NextResponse } from "next/server";
import { readMetaServerConfig } from "@/lib/meta-ads/config";
import { isMetaPurchaseOrderId, sendVerifiedMetaPurchase } from "@/lib/meta-ads/purchase";
import { readRequestPrivacyConsent, requestCookie } from "@/lib/privacy/server";
import { isSameOriginMutation } from "@/lib/security/request-origin";
import { consumeRequestLimit } from "@/lib/security/request-rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie, Sec-GPC" };

/** Same-origin receipt action; never a public lookup or a browser pixel on a private receipt. */
export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ purchase: null }, { status: 403, headers });
  // Hard-off integration never reads receipts/orders, writes counters, or calls a provider.
  if (!readMetaServerConfig()) return NextResponse.json({ purchase: null }, { headers });
  try {
    if (new URL(request.url).origin !== "https://www.psllabs.org") return NextResponse.json({ purchase: null }, { headers });
    const privacy = await readRequestPrivacyConsent(request);
    if (!privacy.binding || privacy.consent.admin || privacy.consent.gpc ||
        !privacy.consent.measurement || !privacy.consent.personalization ||
        !privacy.consent.capabilities.metaMeasurement || !privacy.consent.capabilities.metaPersonalization) {
      return NextResponse.json({ purchase: null }, { headers });
    }
    if (Number(request.headers.get("content-length") ?? 0) > 512) throw new Error("invalid");
    const raw = await request.text();
    if (raw.length > 512) throw new Error("invalid");
    const body = JSON.parse(raw);
    if (!body || Array.isArray(body) || typeof body !== "object" ||
        Object.keys(body).length !== 1 || !isMetaPurchaseOrderId(body.orderId)) throw new Error("invalid");
    const referrer = new URL(request.headers.get("referer") ?? "");
    if (referrer.origin !== "https://www.psllabs.org" || referrer.pathname !== "/success" ||
        referrer.username || referrer.password || referrer.hash ||
        [...referrer.searchParams.keys()].some(key => key !== "orderId") ||
        referrer.searchParams.getAll("orderId").length !== 1 ||
        referrer.searchParams.get("orderId") !== body.orderId) throw new Error("invalid");
    const address = process.env.VERCEL === "1"
      ? request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() : null;
    const agent = request.headers.get("user-agent");
    if (!address || !isIP(address) || !agent) return NextResponse.json({ purchase: null }, { headers });
    const limited = await consumeRequestLimit(request, "meta-purchase", 12, 60);
    if (limited) return limited;
    const result = await sendVerifiedMetaPurchase({ orderId: body.orderId, binding: privacy.binding,
      // This is the actual receipt path. Only the private order query is omitted.
      sourceUrl: `${referrer.origin}${referrer.pathname}`,
      technical: { client_ip_address: address, client_user_agent: agent, fbp: requestCookie(request, "_fbp") } });
    return NextResponse.json({ purchase: result.ok ? "received" : null }, { headers });
  } catch { return NextResponse.json({ purchase: null }, { headers }); }
}
