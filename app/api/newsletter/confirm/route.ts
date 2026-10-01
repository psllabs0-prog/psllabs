import { NextResponse } from "next/server";

import { handleNewsletterConfirm, newsletterContext } from "@/lib/newsletter/service";

export const runtime = "nodejs";
export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "no-store" };

/** Link scanners and previews issue GETs: they must never confirm anything. */
export async function GET() {
  return NextResponse.json({ error: "Use the confirmation page." }, { status: 405, headers: { Allow: "POST", ...NO_STORE } });
}

/** Deliberate confirmation. The token travels in the JSON body, never in a URL. */
export async function POST(request: Request) {
  let token: unknown = null;
  try {
    const body = (await request.json()) as { token?: unknown };
    token = body.token;
  } catch {
    token = null;
  }
  try {
    const result = await handleNewsletterConfirm({ token }, newsletterContext());
    return NextResponse.json(result.body, { status: result.status, headers: NO_STORE });
  } catch (error) {
    console.error("[newsletter] confirm failed:", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ status: "unavailable" }, { status: 503, headers: NO_STORE });
  }
}
