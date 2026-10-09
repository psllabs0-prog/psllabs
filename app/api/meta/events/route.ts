import { NextResponse } from "next/server";
import { isSameOriginMutation } from "@/lib/security/request-origin";
import { consumeRequestLimit } from "@/lib/security/request-rate-limit";
import { readRequestPrivacyConsent, privacyService, requestCookie } from "@/lib/privacy/server";
import { readMetaServerConfig } from "@/lib/meta-ads/config";
import { prepareMetaEvent, type MetaEventName } from "@/lib/meta-ads/events";
import { sendPreparedMetaEvent } from "@/lib/meta-ads/transport";
import { isIP } from "node:net";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie, Sec-GPC" };
export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ event: null }, { status: 403, headers });
  // The inactive integration performs no receipt/identifier reads, database writes or network requests.
  const config = readMetaServerConfig();
  if (!config) return NextResponse.json({ event: null }, { headers });
  const privacy = await readRequestPrivacyConsent(request);
  if (!privacy.binding || !privacy.consent.measurement || !privacy.consent.personalization ||
      !privacy.consent.capabilities.metaMeasurement || !privacy.consent.capabilities.metaPersonalization) {
    return NextResponse.json({ event: null }, { headers });
  }
  const limited = await consumeRequestLimit(request, "meta-event", 90, 60);
  if (limited) return limited;
  let body: Record<string, unknown>;
  try {
    if (Number(request.headers.get("content-length") ?? 0) > 4096) throw new Error("oversized");
    const raw = await request.text();
    if (raw.length > 4096) throw new Error("oversized");
    body = JSON.parse(raw);
    if (!body || Array.isArray(body) || typeof body !== "object" ||
        Object.keys(body).some((key) => !["name", "eventId", "sourceUrl", "productIds"].includes(key)) ||
        !["PageView", "ViewContent", "AddToCart", "InitiateCheckout"].includes(String(body.name)) ||
        typeof body.eventId !== "string" || typeof body.sourceUrl !== "string" ||
        (body.productIds !== undefined && (!Array.isArray(body.productIds) || body.productIds.length > 10 ||
          body.productIds.some((id) => typeof id !== "string")))) throw new Error("invalid");
  } catch { return NextResponse.json({ event: null }, { status: 400, headers }); }
  try {
    if (new URL(request.headers.get("referer") ?? "").href !== new URL(body.sourceUrl as string).href) {
      return NextResponse.json({ event: null }, { status: 400, headers });
    }
  } catch { return NextResponse.json({ event: null }, { status: 400, headers }); }
  const prepared = prepareMetaEvent({ name: body.name as MetaEventName, eventId: body.eventId as string,
    sourceUrl: body.sourceUrl as string, occurredAt: Date.now(), productIds: body.productIds as string[] | undefined },
    { currentConsent: true });
  if (!prepared.ok) return NextResponse.json({ event: null }, { headers });
  // Only the hosting provider's trusted header is used, never a client-supplied X-Forwarded-For.
  const address = process.env.VERCEL === "1" ? request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() : null;
  const agent = request.headers.get("user-agent");
  if (!address || !isIP(address) || !agent) return NextResponse.json({ event: null }, { headers });
  const result = await sendPreparedMetaEvent({ config, event: prepared.event,
    technical: { client_ip_address: address, client_user_agent: agent, fbp: requestCookie(request, "_fbp") },
    currentPermission: () => privacyService.current(privacy.binding, "meta", true) });
  if (!result.ok || !await privacyService.current(privacy.binding, "meta", true)) return NextResponse.json({ event: null }, { headers });
  return NextResponse.json({ event: prepared.event }, { headers });
}
