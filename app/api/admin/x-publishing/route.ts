import { NextResponse } from "next/server";

import { requireAdminAuth } from "@/lib/admin/require-auth";
import { handleXAdminGet, handleXAdminPost } from "@/lib/x-publishing/admin-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET() {
  const authError = await requireAdminAuth();
  if (authError) return authError;
  try {
    const { status, body } = await handleXAdminGet();
    return NextResponse.json(body, { status, headers: NO_STORE });
  } catch (error) {
    console.error("[admin/x-publishing] GET", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Unable to load the X post queue." }, { status: 500, headers: NO_STORE });
  }
}

export async function POST(request: Request) {
  const authError = await requireAdminAuth();
  if (authError) return authError;
  try {
    const { status, body } = await handleXAdminPost(request);
    return NextResponse.json(body, { status, headers: NO_STORE });
  } catch (error) {
    console.error("[admin/x-publishing] POST", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Action failed; nothing was confirmed. Reload before retrying." }, { status: 500, headers: NO_STORE });
  }
}
