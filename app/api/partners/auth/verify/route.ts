import { NextResponse } from "next/server";
import { isSameOriginMutation } from "@/lib/security/request-origin";
import { consumeRequestLimit } from "@/lib/security/request-rate-limit";
import { PARTNER_SESSION_COOKIE, PARTNER_SESSION_SECONDS, redeemPartnerSignIn } from "@/lib/partners/auth";

export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'" };
/** Email security scanners often follow GET links. Only a user-initiated POST consumes the token. */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  if (!/^[0-9a-f]{64}$/.test(token)) return new NextResponse("This sign-in link is invalid. Request a new link on PSL Labs.", { status: 400, headers });
  return new NextResponse(`<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PSL Labs partner sign-in</title><style>body{background:#090c0e;color:#e9f1f5;font:16px system-ui;margin:0;padding:24px}main{max-width:440px;margin:15vh auto;border:1px solid #26333b;padding:28px}h1{font-size:26px}p{line-height:1.6;color:#a1afb7}button{background:#2fb6e0;border:0;color:#07171b;padding:15px 22px;font:600 16px system-ui;cursor:pointer}button:focus-visible{outline:3px solid white;outline-offset:4px}</style><main><h1>Sign in to PSL Labs</h1><p>Continue to your private partner account. This link expires after 15 minutes and can be used once.</p><form method="post" action="/api/partners/auth/verify"><input type="hidden" name="token" value="${token}"><button type="submit">Continue to partner account</button></form></main></html>`, { headers: { ...headers, "Content-Type": "text/html; charset=utf-8" } });
}
export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return new NextResponse("Same-origin request required.", { status: 403, headers });
  if (!/^application\/x-www-form-urlencoded(?:;|$)/i.test(request.headers.get("content-type") ?? "")) return new NextResponse("Invalid request.", { status: 415, headers });
  try {
    const text = await request.text();
    if (text.length > 256) return new NextResponse("Invalid request.", { status: 400, headers });
    const rateLimit = await consumeRequestLimit(request, "partner-sign-in-verify", 10, 900);
    if (rateLimit) return rateLimit;
    const session = await redeemPartnerSignIn(new URLSearchParams(text).get("token"));
    if (!session) return NextResponse.redirect(new URL("/partners/account?signin=expired", request.url), { status: 303, headers });
    const response = NextResponse.redirect(new URL("/partners/account", request.url), { status: 303, headers });
    response.cookies.set(PARTNER_SESSION_COOKIE, session, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: PARTNER_SESSION_SECONDS });
    return response;
  } catch { return new NextResponse("Sign-in is temporarily unavailable. Request a new link and try again later.", { status: 503, headers }); }
}
