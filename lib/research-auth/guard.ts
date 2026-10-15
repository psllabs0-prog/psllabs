import { NextResponse, type NextRequest } from "next/server";
import { getResearchAccount, type ResearchAccount } from "./server";
import { RESEARCH_PATH_HEADER, RESEARCH_SIGN_IN_PATH, researchPathRequiresAccount, isResearchRecoveryPage } from "./paths";
import { safeResearchReturnPath } from "./qualification";

type ReadAccount = (request: Request | Headers) => Promise<ResearchAccount | null>;

/** Factory allows actual-library offline tests without a deployable auth-bypass flag. */
export function createResearchRequestGuard(readAccount: ReadAccount = getResearchAccount) {
  return async function guard(request: NextRequest): Promise<NextResponse> {
    const path = request.nextUrl.pathname.replace(/\/+$/, "") || "/";
    const requestHeaders = new Headers(request.headers);
    // Always overwrite the visitor's value before layouts consume it.
    requestHeaders.set(RESEARCH_PATH_HEADER, path);
    if (path === "/checkout" && ["GET", "HEAD"].includes(request.method) && request.nextUrl.searchParams.get("paymentAction") === "requireAction") {
      const recovery = request.nextUrl.clone(); recovery.pathname = "/payment-return";
      // A real new document also gives usePathname the recovery pathname.
      // A rewrite keeps the old /checkout URL during hydration and can mount
      // storefront controls around this otherwise recovery-only child.
      return NextResponse.redirect(recovery, { status: 307,
        headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" } });
    }
    if (researchPathRequiresAccount(path) && !await readAccount(request)) {
      if (path.startsWith("/api/")) return NextResponse.json({ error: "Sign in to your research account to continue." },
        { status: 401, headers: { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" } });
      const login = new URL(RESEARCH_SIGN_IN_PATH, request.url);
      login.searchParams.set("next", safeResearchReturnPath(path));
      return NextResponse.redirect(login, { status: 307,
        headers: { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" } });
    }
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    // Authenticated catalog HTML/RSC must never become a public CDN response.
    if (researchPathRequiresAccount(path)) response.headers.set("Cache-Control", "private, no-store");
    if (path.startsWith("/research-account") || isResearchRecoveryPage(path)) {
      response.headers.set("Cache-Control", "private, no-store");
      response.headers.set("Referrer-Policy", "no-referrer");
      response.headers.set("X-Robots-Tag", "noindex, nofollow");
    }
    return response;
  };
}
