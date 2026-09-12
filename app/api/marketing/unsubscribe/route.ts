import { NextResponse } from "next/server";

import { verifyUnsubscribeToken } from "@/lib/retention/config";
import { markMarketingUnsubscribed } from "@/lib/retention/store";

export const runtime = "nodejs";

/** Marketing unsubscribe — does not affect transactional order/support email. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  const verified = verifyUnsubscribeToken(token);
  if (!verified.ok) {
    return NextResponse.redirect(new URL("/unsubscribe?error=1", url.origin));
  }
  await markMarketingUnsubscribed(verified.email);
  return NextResponse.redirect(new URL("/unsubscribe?done=1", url.origin));
}

export async function POST(request: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  const token = typeof body.token === "string" ? body.token : "";
  const verified = verifyUnsubscribeToken(token);
  if (!verified.ok) {
    return NextResponse.json({ ok: false, error: "Invalid token" }, { status: 400 });
  }
  await markMarketingUnsubscribed(verified.email);
  return NextResponse.json({ ok: true });
}
