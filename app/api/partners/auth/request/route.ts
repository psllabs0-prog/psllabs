import { NextResponse } from "next/server";
import { isSameOriginMutation } from "@/lib/security/request-origin";
import { consumeRequestLimit } from "@/lib/security/request-rate-limit";
import { requestPartnerSignIn } from "@/lib/partners/auth";

export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };
const success = () => NextResponse.json({ success: true, message: "If we have an application for this email, a sign-in link will arrive shortly." }, { headers });
export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: "Same-origin request required." }, { status: 403, headers });
  if (!/^application\/json(?:;|$)/i.test(request.headers.get("content-type") ?? "")) return NextResponse.json({ error: "JSON required." }, { status: 415, headers });
  try {
    const text = await request.text();
    if (text.length > 1500) return NextResponse.json({ error: "Request is too large." }, { status: 413, headers });
    const body = JSON.parse(text) as Record<string, unknown>;
    if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Invalid request." }, { status: 400, headers });
    if (typeof body.websiteUrl === "string" && body.websiteUrl.trim()) return success();
    const rateLimit = await consumeRequestLimit(request, "partner-sign-in", 5, 3600);
    if (rateLimit) return rateLimit;
    await requestPartnerSignIn(body.email);
    return success();
  } catch {
    return NextResponse.json({ error: "Sign-in is temporarily unavailable. Please try again later." }, { status: 503, headers });
  }
}
