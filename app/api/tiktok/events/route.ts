import { NextResponse } from "next/server";
import { isIP } from "node:net";
import { isSameOriginMutation } from "@/lib/security/request-origin";
import { consumeRequestLimit } from "@/lib/security/request-rate-limit";
import { readRequestPrivacyConsent, privacyService, requestCookie } from "@/lib/privacy/server";
import { readTikTokServerConfig } from "@/lib/tiktok-ads/config";
import { prepareTikTokEvent, type TikTokEventName } from "@/lib/tiktok-ads/events";
import { sendPreparedTikTokEvent } from "@/lib/tiktok-ads/transport";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie, Sec-GPC" };
export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ event: null }, { status: 403, headers });
  // Inactive preparation has no receipt reads, rate-counter writes, SDK or provider calls.
  const config = readTikTokServerConfig();
  if (!config) return NextResponse.json({ event: null }, { headers });
  const privacy = await readRequestPrivacyConsent(request);
  if (!privacy.binding || !privacy.consent.measurement || !privacy.consent.personalization ||
      !privacy.consent.capabilities.tiktokMeasurement || !privacy.consent.capabilities.tiktokPersonalization ||
      privacy.consent.gpc || privacy.consent.admin) return NextResponse.json({ event: null }, { headers });
  const limited = await consumeRequestLimit(request, "tiktok-event", 90, 60);
  if (limited) return limited;
  let body: Record<string, unknown>;
  try {
    if (Number(request.headers.get("content-length") ?? 0) > 4096) throw new Error("oversized");
    const raw = await request.text();
    if (raw.length > 4096) throw new Error("oversized");
    body = JSON.parse(raw);
    if (!body || Array.isArray(body) || typeof body !== "object" ||
        Object.keys(body).some((key) => !["name", "eventId", "sourceUrl", "productIds"].includes(key)) ||
        !["Pageview", "ViewContent", "AddToCart", "InitiateCheckout"].includes(String(body.name)) ||
        typeof body.eventId !== "string" || typeof body.sourceUrl !== "string" ||
        (body.productIds !== undefined && (!Array.isArray(body.productIds) || body.productIds.length > 10 ||
          body.productIds.some((id) => typeof id !== "string")))) throw new Error("invalid");
  } catch { return NextResponse.json({ event: null }, { status: 400, headers }); }
  try {
    if (new URL(request.headers.get("referer") ?? "").href !== new URL(body.sourceUrl as string).href) {
      return NextResponse.json({ event: null }, { status: 400, headers });
    }
  } catch { return NextResponse.json({ event: null }, { status: 400, headers }); }
  const prepared = prepareTikTokEvent({ name: body.name as TikTokEventName, eventId: body.eventId as string,
    sourceUrl: body.sourceUrl as string, occurredAt: Date.now(), productIds: body.productIds as string[] | undefined },
    { currentConsent: true });
  if (!prepared.ok) return NextResponse.json({ event: null }, { headers });
  const address = process.env.VERCEL === "1" ? request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() : null;
  const agent = request.headers.get("user-agent");
  if (!address || !isIP(address) || !agent) return NextResponse.json({ event: null }, { headers });
  const clickId = new URL(prepared.event.page.url).searchParams.get("ttclid") ?? undefined;
  const result = await sendPreparedTikTokEvent({ config, event: prepared.event,
    technical: { ip: address, user_agent: agent, ttp: requestCookie(request, "_ttp"), ttclid: clickId },
    currentPermission: () => privacyService.current(privacy.binding, "tiktok", true) });
  if (!result.ok || !await privacyService.current(privacy.binding, "tiktok", true)) return NextResponse.json({ event: null }, { headers });
  return NextResponse.json({ event: prepared.event }, { headers });
}
