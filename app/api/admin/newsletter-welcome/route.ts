import { NextResponse } from "next/server";

import { requireAdminAuth } from "@/lib/admin/require-auth";
import { readNewsletterWelcomeAdmin } from "@/lib/newsletter/admin";

export const runtime = "nodejs";

/** Read-only status, counts, and previews. No actions: activation is by environment flag only. */
export async function GET() {
  const authError = await requireAdminAuth();
  if (authError) return authError;

  try {
    return NextResponse.json(await readNewsletterWelcomeAdmin(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[admin/newsletter-welcome] GET", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Unable to load newsletter status." }, { status: 500 });
  }
}
