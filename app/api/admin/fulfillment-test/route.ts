import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin/require-auth";

export const runtime = "nodejs";
const retired = {
  error: "This test workflow has been retired. Use Fulfillment for paid orders.",
  path: "/admin-fulfillment",
};
const reply = (value: unknown, status = 410) => NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
async function authenticate() {
  const error = await requireAdminAuth();
  if (error) error.headers.set("Cache-Control", "private, no-store");
  return error;
}
export async function GET() {
  const denied = await authenticate(); if (denied) return denied;
  return reply(retired);
}
export async function POST(request: Request) {
  const denied = await authenticate(); if (denied) return denied;
  if (request.headers.get("origin") !== new URL(request.url).origin) return reply({ error: "Same-origin request required." }, 403);
  return reply(retired);
}
