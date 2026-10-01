import { NextResponse } from "next/server";

import { getNewsletterWelcomeSchemaState } from "@/lib/newsletter/schema";
import { findSubscriptionEmailByPublicId, markNewsletterUnsubscribed } from "@/lib/newsletter/welcome-store";
import { isNewsletterUnsubscribeTokenShape, verifyNewsletterUnsubscribeToken } from "@/lib/newsletter/tokens";
import { verifyUnsubscribeToken } from "@/lib/retention/config";
import { markMarketingUnsubscribed } from "@/lib/retention/store";

export const runtime = "nodejs";

/** Signature check only — no database access on GET. */
function isSignedToken(token: string): boolean {
  if (isNewsletterUnsubscribeTokenShape(token)) return verifyNewsletterUnsubscribeToken(token).ok;
  return verifyUnsubscribeToken(token).ok;
}

async function resolveEmail(token: string): Promise<string | null> {
  if (isNewsletterUnsubscribeTokenShape(token)) {
    const verified = verifyNewsletterUnsubscribeToken(token);
    if (!verified.ok) return null;
    if (!(await getNewsletterWelcomeSchemaState()).ready) return null;
    return findSubscriptionEmailByPublicId(verified.publicId);
  }
  const verified = verifyUnsubscribeToken(token);
  return verified.ok ? verified.email : null;
}

/**
 * GET must NOT unsubscribe — scanners/previews may fetch links.
 * Redirect to the human confirmation page (token preserved when valid).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  if (!isSignedToken(token)) {
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
  const email = await resolveEmail(token);
  if (!email) {
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

  await markMarketingUnsubscribed(email);

  try {
    if ((await getNewsletterWelcomeSchemaState()).ready) {
      await markNewsletterUnsubscribed(email, new Date());
    }
  } catch (error) {
    // The marketing suppression above is authoritative and is re-checked before every welcome send.
    console.error("[marketing/unsubscribe] newsletter update failed:", error instanceof Error ? error.message : "unknown");
  }

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
