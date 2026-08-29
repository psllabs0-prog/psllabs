import { NextResponse } from "next/server";

import { requireAdminAuth } from "@/lib/admin/require-auth";
import { getLedgerRows } from "@/lib/ledger/store";

export const runtime = "nodejs";

export async function GET() {
  const authError = await requireAdminAuth();
  if (authError) return authError;

  try {
    const rows = await getLedgerRows();
    return NextResponse.json({ rows });
  } catch (error) {
    console.error("[admin/ledger]", error);
    return NextResponse.json(
      { error: "Unable to load ledger." },
      { status: 500 }
    );
  }
}
