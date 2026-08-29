import { NextResponse } from "next/server";

/** Verify Vercel Cron or manual invocation with CRON_SECRET. */
export function verifyCronRequest(request: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    console.error("[cron] CRON_SECRET is not configured.");
    return NextResponse.json({ error: "Cron not configured." }, { status: 503 });
  }

  const auth = request.headers.get("authorization")?.trim() ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const headerSecret = request.headers.get("x-cron-secret")?.trim() ?? "";

  if (bearer !== secret && headerSecret !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}
