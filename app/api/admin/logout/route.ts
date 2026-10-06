import { NextResponse } from "next/server";

import { clearAdminSessionCookie } from "@/lib/admin/auth";
import { isSameOriginMutation } from "@/lib/security/request-origin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ error: "Same-origin admin request required." }, { status: 403 });
  }
  const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  response.cookies.set(clearAdminSessionCookie());
  return response;
}
