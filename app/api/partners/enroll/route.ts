import { NextResponse } from "next/server";
import { isSameOriginMutation } from "@/lib/security/request-origin";
import { consumeRequestLimit } from "@/lib/security/request-rate-limit";
import { authenticatedPartnerId } from "@/lib/partners/auth";
import { getPartner } from "@/lib/partners/store";
import { PartnerInputError } from "@/lib/partners/logic";
import { validatePartnerRegistration } from "@/lib/partners/registration-logic";
import { acceptAuthenticatedPartnerTerms } from "@/lib/partners/registration-store";

const headers = { "Cache-Control": "no-store, private", "X-Robots-Tag": "noindex, nofollow" };
export const runtime = "nodejs";
export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: "Same-origin request required." }, { status: 403, headers });
  if (!/^application\/json(?:;|$)/i.test(request.headers.get("content-type") ?? "")) return NextResponse.json({ error: "JSON required." }, { status: 415, headers });
  const id = await authenticatedPartnerId(request);
  if (!id) return NextResponse.json({ error: "Sign in before accepting partner terms." }, { status: 401, headers });
  try {
    const text = await request.text();
    if (text.length > 1500) return NextResponse.json({ error: "Request is too large." }, { status: 413, headers });
    const body = JSON.parse(text) as Record<string, unknown>;
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new PartnerInputError("Invalid request.");
    const limited = await consumeRequestLimit(request, "partner-terms-acceptance", 5, 3600);
    if (limited) return limited;
    const partner = await getPartner(id);
    if (!partner) return NextResponse.json({ error: "Sign in again." }, { status: 401, headers });
    const input = validatePartnerRegistration({ name: partner.businessName, email: partner.email,
      acceptTerms: body.acceptTerms, payoutMethod: body.payoutMethod, payoutContact: body.payoutContact });
    await acceptAuthenticatedPartnerTerms(id, input);
    return NextResponse.json({ success: true, message: "Your current partner terms and payout contact are saved." }, { headers });
  } catch (error) {
    return NextResponse.json({ error: error instanceof PartnerInputError ? error.message : "Partner enrollment is temporarily unavailable." }, { status: error instanceof PartnerInputError ? 400 : 503, headers });
  }
}
