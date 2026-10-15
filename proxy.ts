import { NextResponse, type NextRequest } from "next/server";
import { isSameOriginMutation } from "@/lib/security/request-origin";
import { consumeRequestLimit } from "@/lib/security/request-rate-limit";
import { isDesignPreview } from "@/lib/design-preview";
import { createResearchRequestGuard } from "@/lib/research-auth/guard";
import { isResearchAuthApiPath } from "@/lib/research-auth/paths";

const researchRequestGuard = createResearchRequestGuard();

const PUBLIC_LIMITS: Record<string, { scope: string; limit: number; seconds: number }> = {
  "/api/checkout": { scope: "checkout-create", limit: 20, seconds: 3600 },
  "/api/checkout/card/session": { scope: "checkout-create", limit: 20, seconds: 3600 },
  "/api/contact": { scope: "contact", limit: 10, seconds: 3600 },
  "/api/newsletter": { scope: "newsletter", limit: 20, seconds: 3600 },
  "/api/track": { scope: "order-tracking", limit: 30, seconds: 900 },
};

export async function proxy(request: NextRequest) {
  // Verify the actual customer session before metadata, SSR, RSC or catalog APIs.
  // An unsigned, expired or revoked cookie never unlocks the storefront.
  const researchResponse = await researchRequestGuard(request);
  if (researchResponse.headers.get("x-middleware-next") !== "1") return researchResponse;
  const path = request.nextUrl.pathname.replace(/\/$/, "");
  if (isDesignPreview()) {
    const consent = path === "/api/privacy/consent" && ["GET", "POST"].includes(request.method);
    const inventory = path === "/api/inventory/availability" && ["GET", "HEAD"].includes(request.method);
    // Auth handler separately fails closed in design previews before DB or mail.
    const researchAuth = isResearchAuthApiPath(path) && ["GET", "POST"].includes(request.method);
    if ((path.startsWith("/api/") && !consent && !inventory && !researchAuth) || /^\/admin/i.test(path) ||
        ["/success", "/unsubscribe"].includes(path)) {
      return NextResponse.json({ error: "Design preview only. Orders, messages, private data and advertising are disabled." },
        { status: 403, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } });
    }
    const response = researchResponse;
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
  return researchResponse;
}

// Webhooks, payment confirmation, cron jobs and advertising receipt callbacks
// deliberately do not pass through interactive-form throttles.
export const config = {
  matcher: ["/api/:path*", "/admin(.*)", "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|webp|avif|svg|woff2)$).*)"],
};
