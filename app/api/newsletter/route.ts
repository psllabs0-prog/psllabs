import { NextResponse } from "next/server";

import { handleNewsletterSignup, isSameOriginSignup, newsletterContext } from "@/lib/newsletter/service";

export const runtime = "nodejs";
export const maxDuration = 60;

function clientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || null;
  return request.headers.get("x-real-ip");
}

export async function POST(request: Request) {
  let body: { email?: unknown; placement?: unknown; signupCopyVersion?: unknown; website?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 400 }
    );
  }

  try {
    const ctx = newsletterContext();
    const result = await handleNewsletterSignup(
      {
        email: body.email,
        placement: body.placement,
        signupCopyVersion: body.signupCopyVersion,
        honeypot: body.website,
        ip: clientIp(request),
        sameOrigin: isSameOriginSignup(
          { contentType: request.headers.get("content-type"), origin: request.headers.get("origin") },
          new URL(request.url).origin,
          ctx.siteUrl
        ),
      },
      ctx
    );
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    console.error("[newsletter] signup failed:", error instanceof Error ? error.message : "unknown");
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
