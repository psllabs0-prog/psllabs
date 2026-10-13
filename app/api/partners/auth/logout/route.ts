import { NextResponse } from "next/server";
import { isSameOriginMutation } from "@/lib/security/request-origin";
import { PARTNER_SESSION_COOKIE, revokePartnerSession } from "@/lib/partners/auth";

export const runtime = "nodejs";
export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: "Same-origin request required." }, { status: 403, headers: { "Cache-Control": "no-store" } });
  try { await revokePartnerSession(request); }
  catch { return NextResponse.json({ error: "Could not revoke your session. Try again." }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
  const response = NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
  response.cookies.set(PARTNER_SESSION_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
  return response;
}
