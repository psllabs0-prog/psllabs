import { NextResponse } from "next/server";
import { isSameOriginMutation } from "@/lib/security/request-origin";
import { consumeRequestLimit } from "@/lib/security/request-rate-limit";
import { isDesignPreview } from "@/lib/design-preview";
import { PartnerInputError } from "@/lib/partners/logic";
import { validateReferralApplication } from "@/lib/partners/referral-logic";
import { assertPartnersAvailable, createPartner, PartnersUnavailableError } from "@/lib/partners/store";
import { assertReferralPilotAvailable } from "@/lib/partners/referral-store";

export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };
const success = () => NextResponse.json({ success: true, message: "Application received. We’ll review it before issuing a code." }, { headers });
export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: "Same-origin request required." }, { status: 403, headers });
  if (!/^application\/json(?:;|$)/i.test(request.headers.get("content-type") ?? "")) return NextResponse.json({ error: "JSON required." }, { status: 415, headers });
  if (isDesignPreview()) return NextResponse.json({ error: "Applications are available on the live site." }, { status: 503, headers });
  if (Number(request.headers.get("content-length")) > 6000) return NextResponse.json({ error: "Application is too large." }, { status: 413, headers });
  try {
    const text = await request.text();
    if (text.length > 6000) return NextResponse.json({ error: "Application is too large." }, { status: 413, headers });
    const body = JSON.parse(text) as Record<string, unknown>;
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new PartnerInputError("Invalid application.");
    if (typeof body.websiteUrl === "string" && body.websiteUrl.trim()) return success();
    const input = validateReferralApplication(body);
    const rateLimit = await consumeRequestLimit(request, "partner-application", 5, 3600);
    if (rateLimit) return rateLimit;
    await assertPartnersAvailable();
    await assertReferralPilotAvailable();
    await createPartner(input);
    return success();
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof PartnerInputError) return NextResponse.json({ error: error instanceof PartnerInputError ? error.message : "Invalid JSON." }, { status: 400, headers });
    // The same response prevents public contact enumeration and duplicate enrollment.
    if (error && typeof error === "object" && "code" in error && error.code === "23505") return success();
    if (error instanceof PartnersUnavailableError) return NextResponse.json({ error: "Applications are temporarily unavailable. Please try again later." }, { status: 503, headers });
    console.error("[partners/apply] Application could not be saved.");
    return NextResponse.json({ error: "Unable to save your application. Please try again later." }, { status: 500, headers });
  }
}
