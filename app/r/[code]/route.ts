import { NextResponse } from "next/server";
import { partnerDestination, validPartnerCode } from "@/lib/partners/logic";
import { assertPartnersAvailable, getActivePartnerByCode } from "@/lib/partners/store";

export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" };
export async function GET(_request: Request, context: { params: Promise<{ code: string }> }) {
  const { code } = await context.params;
  if (!validPartnerCode(code)) return new NextResponse("Partner link unavailable.", { status: 404, headers });
  try {
    await assertPartnersAvailable();
    const partner = await getActivePartnerByCode(code);
    const destination = partner && partnerDestination(partner);
    if (!destination) return new NextResponse("Partner link unavailable.", { status: 404, headers });
    return NextResponse.redirect(destination, { status: 307, headers });
  } catch {
    return new NextResponse("Partner links are temporarily unavailable.", { status: 503, headers });
  }
}
