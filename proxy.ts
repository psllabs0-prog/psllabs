import { NextResponse, type NextRequest } from "next/server";
import { isSameOriginMutation } from "@/lib/security/request-origin";
import { consumeRequestLimit } from "@/lib/security/request-rate-limit";

const PUBLIC_LIMITS: Record<string, { scope: string; limit: number; seconds: number }> = {
  "/api/checkout": { scope: "checkout-create", limit: 20, seconds: 3600 },
  "/api/checkout/card/session": { scope: "checkout-create", limit: 20, seconds: 3600 },
  "/api/contact": { scope: "contact", limit: 10, seconds: 3600 },
  "/api/newsletter": { scope: "newsletter", limit: 20, seconds: 3600 },
  "/api/track": { scope: "order-tracking", limit: 30, seconds: 900 },
};

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname.replace(/\/$/, "");
  if (path.startsWith("/api/admin/") && !isSameOriginMutation(request)) {
    return NextResponse.json({ error: "Same-origin admin request required." },
      { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  const limit = PUBLIC_LIMITS[path];
  if (request.method === "POST" && limit) {
    const blocked = await consumeRequestLimit(request, limit.scope, limit.limit, limit.seconds);
    if (blocked) return blocked;
  }
  return NextResponse.next();
}

// Webhooks, payment confirmation, cron jobs and advertising receipt callbacks
// deliberately do not pass through interactive-form throttles.
export const config = {
  matcher: ["/api/admin/:path*", "/api/checkout", "/api/checkout/card/session", "/api/contact", "/api/newsletter", "/api/track"],
};
