import { NextResponse } from "next/server";
import { getResearchAuth, researchAuthConfigured } from "@/lib/research-auth/auth";
import { isSameOriginMutation } from "@/lib/security/request-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handler(request: Request) {
  const headers = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" };
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: "Same-origin request required." }, { status: 403, headers });
  if (Number(request.headers.get("content-length") || 0) > 16000) return NextResponse.json({ error: "Request is too large." }, { status: 413, headers });
  if (!researchAuthConfigured()) return NextResponse.json({ error: "Research-account sign-in is temporarily unavailable. Please contact support@psllabs.org." }, { status: 503, headers });
  try {
    const response = await getResearchAuth().handler(request);
    for (const [key,value] of Object.entries(headers)) response.headers.set(key, value);
    return response;
  } catch {
    return NextResponse.json({ error: "Account service is temporarily unavailable. Please try again later." }, { status: 503, headers });
  }
}

export { handler as GET, handler as POST };
