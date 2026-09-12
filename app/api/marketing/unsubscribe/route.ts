import { NextResponse } from "next/server";

import { verifyUnsubscribeToken } from "@/lib/retention/config";
import { markMarketingUnsubscribed } from "@/lib/retention/store";

export const runtime = "nodejs";

/**
 * GET must NOT unsubscribe — scanners/previews may fetch links.
 * Redirect to the human confirmation page (token preserved when valid).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  const verified = verifyUnsubscribeToken(token);
  if (!verified.ok) {
    return NextResponse.redirect(new URL("/unsubscribe?error=1", url.origin));
  }
  return NextResponse.redirect(
    new URL(`/unsubscribe?token=${encodeURIComponent(token)}`, url.origin)
  );
}

/**
 * One-click / confirmed unsubscribe.
 * Token from QUERY STRING. Accepts application/x-www-form-urlencoded
 * body `List-Unsubscribe=One-Click` (JSON not required).
 * Marketing only — transactional mail unaffected. Idempotent.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  const verified = verifyUnsubscribeToken(token);
  if (!verified.ok) {
    return new NextResponse("Invalid token", { status: 400 });
  }

  // Consume body when present (RFC 8058); do not require a specific value.
  const contentType = request.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/x-www-form-urlencoded")) {
      await request.text();
    } else if (contentType.includes("application/json")) {
      await request.text();
    } else {
      await request.text().catch(() => "");
    }
  } catch {
    // empty body is fine
  }

  await markMarketingUnsubscribed(verified.email);

  const wantsRedirect =
    url.searchParams.get("redirect") === "1" ||
    (request.headers.get("accept") ?? "").includes("text/html");

  if (wantsRedirect) {
    return NextResponse.redirect(new URL("/unsubscribe?done=1", url.origin));
  }

  return new NextResponse("OK", {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
