import { NextResponse } from "next/server";
import { isSameOriginMutation } from "@/lib/security/request-origin";
import { consumeRequestLimit } from "@/lib/security/request-rate-limit";
import { privacyService, readRequestPrivacyConsent, requestCookie, requestPrivacyContext } from "@/lib/privacy/server";
import { PRIVACY_CONSENT_COOKIE, PRIVACY_CONSENT_TTL_MS, PRIVACY_CONSENT_VERSION } from "@/lib/privacy/types";
import { consentDigest, ConsentConflictError, createConsentToken } from "@/lib/privacy/service";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie, Sec-GPC" };
export async function GET(request: Request) {
  const { consent } = await readRequestPrivacyConsent(request);
  const response = NextResponse.json({ consent }, { headers });
  if (!consentDigest(requestCookie(request, PRIVACY_CONSENT_COOKIE))) {
    response.cookies.set(PRIVACY_CONSENT_COOKIE, createConsentToken(), { httpOnly: true,
      secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/",
      maxAge: PRIVACY_CONSENT_TTL_MS / 1000 });
  }
  return response;
}
export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: "Same-origin request required" }, { status: 403, headers });
  if (Number(request.headers.get("content-length") ?? 0) > 1024) {
    return NextResponse.json({ error: "Invalid preference" }, { status: 400, headers });
  }
  let body: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (raw.length > 1024) throw new Error("too large");
    body = JSON.parse(raw);
    if (!body || Array.isArray(body) || typeof body !== "object" ||
        Object.keys(body).some((key) => !["version", "measurement", "personalization", "verifiedAdult", "expectedRevision"].includes(key)) ||
        body.version !== PRIVACY_CONSENT_VERSION || body.verifiedAdult !== true ||
        !Number.isSafeInteger(body.expectedRevision) || (body.expectedRevision as number) < 0 ||
        typeof body.measurement !== "boolean" || typeof body.personalization !== "boolean" ||
        (body.personalization && !body.measurement)) throw new Error("invalid");
  } catch { return NextResponse.json({ error: "Invalid preference" }, { status: 400, headers }); }
  const token = requestCookie(request, PRIVACY_CONSENT_COOKIE);
  if (!consentDigest(token)) return NextResponse.json({ error: "Please reload cookie preferences and try again." }, { status: 409, headers });
  const context = requestPrivacyContext(request);
  // Revoking permission remains possible even after the grant rate limit is reached.
  if (body.measurement && !context.gpc && !context.admin) {
    const limited = await consumeRequestLimit(request, "privacy-choice", 30, 3600);
    if (limited) return limited;
  }
  try {
    const result = await privacyService.save(token, {
      measurement: body.measurement as boolean, personalization: body.personalization as boolean,
    }, context, body.expectedRevision as number);
    const response = NextResponse.json({ consent: result.consent }, { headers });
    // POST never replaces the identity cookie: a late grant response cannot undo a newer decline.
    return response;
  } catch (error) {
    if (error instanceof ConsentConflictError) return NextResponse.json({ error: error.message }, { status: 409, headers });
    return NextResponse.json({ error: "Your preference could not be saved. Optional tracking remains off in this browser; please retry." }, { status: 503, headers });
  }
}
