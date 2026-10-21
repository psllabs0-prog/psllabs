import { NextResponse, type NextRequest } from "next/server";
import { isSameOriginMutation } from "@/lib/security/request-origin";
import { consumeRequestLimit } from "@/lib/security/request-rate-limit";
import { isDesignPreview } from "@/lib/design-preview";

const PUBLIC_LIMITS: Record<string, { scope: string; limit: number; seconds: number }> = {
  "/api/checkout": { scope: "checkout-create", limit: 20, seconds: 3600 },
  "/api/checkout/card/session": { scope: "checkout-create", limit: 20, seconds: 3600 },
  "/api/contact": { scope: "contact", limit: 10, seconds: 3600 },
  "/api/newsletter": { scope: "newsletter", limit: 20, seconds: 3600 },
  "/api/track": { scope: "order-tracking", limit: 30, seconds: 900 },
};

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname.replace(/\/+$/, "") || "/";
  // Keep legacy card recovery in its own document, away from storefront
  // controls and advertising, without requiring a research-account session.
  if (path === "/checkout" && ["GET", "HEAD"].includes(request.method) &&
      request.nextUrl.searchParams.get("paymentAction") === "requireAction") {
    const recovery = request.nextUrl.clone();
    recovery.pathname = "/payment-return";
    return NextResponse.redirect(recovery, { status: 307, headers: {
      "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex, nofollow",
    } });
  }
  if (isDesignPreview()) {
    const consent = path === "/api/privacy/consent" && ["GET", "POST"].includes(request.method);
    const inventory = path === "/api/inventory/availability" && ["GET", "HEAD"].includes(request.method);
    if ((path.startsWith("/api/") && !consent && !inventory) || /^\/admin/i.test(path) ||
        ["/success", "/unsubscribe"].includes(path)) {
      return NextResponse.json({ error: "Design preview only. Orders, messages, private data and advertising are disabled." },
        { status: 403, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } });
    }
    const response = NextResponse.next();
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    return response;
  }
  if (path.startsWith("/api/admin/") && !isSameOriginMutation(request)) {
    return NextResponse.json({ error: "Same-origin admin request required." },
      { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  const limit = PUBLIC_LIMITS[path];
  if (request.method === "POST" && limit) {
    const blocked = await consumeRequestLimit(request, limit.scope, limit.limit, limit.seconds);
    if (blocked) return blocked;
  }
  const response = NextResponse.next();
  // Payment returns and receipts retain their existing private-document headers.
  if (["/payment-return", "/success", "/cancel", "/unsubscribe", "/newsletter/confirm"].includes(path)) {
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  return response;
}

// Webhooks, payment confirmation, cron jobs and advertising receipt callbacks
// deliberately do not pass through interactive-form throttles.
export const config = {
  matcher: ["/api/:path*", "/admin(.*)", "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|webp|avif|svg|woff2)$).*)"],
};
