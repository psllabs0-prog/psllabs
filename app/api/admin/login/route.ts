import { NextResponse } from "next/server";

import {
  adminSessionCookie,
  createAdminSessionToken,
  isAdminPasswordConfigured,
  isValidAdminPassword,
} from "@/lib/admin/auth";
import { isSameOriginMutation } from "@/lib/security/request-origin";
import { consumeRequestLimit } from "@/lib/security/request-rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ error: "Same-origin admin request required." }, { status: 403 });
  }
  if (!isAdminPasswordConfigured()) {
    return NextResponse.json({ error: "Admin auth is not configured." }, { status: 503 });
  }

  const blocked = await consumeRequestLimit(request, "admin-login", 10, 900);
  if (blocked) return blocked;

  let body: { password?: unknown };
  try {
    body = (await request.json()) as { password?: unknown };
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid body");
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const password = typeof body.password === "string" ? body.password : "";
  if (!isValidAdminPassword(password)) {
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  }

  const token = createAdminSessionToken();
  if (!token) {
    return NextResponse.json({ error: "Unable to create session." }, { status: 500 });
  }

  const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  response.cookies.set(adminSessionCookie(token));
  return response;
}
