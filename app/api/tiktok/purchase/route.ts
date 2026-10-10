import { isIP } from "node:net";
import { NextResponse } from "next/server";
import { readTikTokServerConfig } from "@/lib/tiktok-ads/config";
import { isTikTokPurchaseOrderId, sendVerifiedTikTokPurchase } from "@/lib/tiktok-ads/purchase";
import { readRequestPrivacyConsent, requestCookie } from "@/lib/privacy/server";
import { isSameOriginMutation } from "@/lib/security/request-origin";
import { consumeRequestLimit } from "@/lib/security/request-rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie, Sec-GPC" };
export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ purchase: null }, { status: 403, headers });
  if (!readTikTokServerConfig()) return NextResponse.json({ purchase: null }, { headers });
  try {
    if (new URL(request.url).origin !== "https://www.psllabs.org") return NextResponse.json({ purchase: null }, { headers });
    const privacy = await readRequestPrivacyConsent(request);
    if (!privacy.binding || privacy.consent.admin || privacy.consent.gpc ||
        !privacy.consent.measurement || !privacy.consent.personalization ||
        !privacy.consent.capabilities.tiktokMeasurement || !privacy.consent.capabilities.tiktokPersonalization) {
      return NextResponse.json({ purchase: null }, { headers });
    }
    if (Number(request.headers.get("content-length") ?? 0) > 512) throw new Error("invalid");
    const raw = await request.text();
    if (raw.length > 512) throw new Error("invalid");
    const body = JSON.parse(raw);
    if (!body || Array.isArray(body) || typeof body !== "object" || Object.keys(body).length !== 1 ||
        !isTikTokPurchaseOrderId(body.orderId)) throw new Error("invalid");
    const referrer = new URL(request.headers.get("referer") ?? "");
    if (referrer.origin !== "https://www.psllabs.org" || referrer.pathname !== "/success" ||
        referrer.username || referrer.password || referrer.hash ||
        [...referrer.searchParams.keys()].some((key) => key !== "orderId") ||
        referrer.searchParams.getAll("orderId").length !== 1 || referrer.searchParams.get("orderId") !== body.orderId) throw new Error("invalid");
    const address = process.env.VERCEL === "1" ? request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() : null;
    const agent = request.headers.get("user-agent");
    if (!address || !isIP(address) || !agent) return NextResponse.json({ purchase: null }, { headers });
    const limited = await consumeRequestLimit(request, "tiktok-purchase", 12, 60);
    if (limited) return limited;
    const result = await sendVerifiedTikTokPurchase({ orderId: body.orderId, binding: privacy.binding,
      // Actual receipt page; remove only the private order identifier, never hide the purchase context.
      sourceUrl: `${referrer.origin}${referrer.pathname}`,
      technical: { ip: address, user_agent: agent, ttp: requestCookie(request, "_ttp") } });
    return NextResponse.json({ purchase: result.ok ? "accepted" : null }, { headers });
  } catch { return NextResponse.json({ purchase: null }, { headers }); }
}
