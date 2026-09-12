import { NextResponse } from "next/server";

import { verifyCronRequest } from "@/lib/cron/auth";
import { runCustomerIntelligenceScan } from "@/lib/customer-intelligence/scan";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Weekly customer intelligence — Sunday 10:00 UTC (before Monday CEO brief). */
export async function GET(request: Request) {
  const authError = verifyCronRequest(request);
  if (authError) return authError;

  try {
    const result = await runCustomerIntelligenceScan();
    return NextResponse.json(result);
  } catch (error) {
    console.error("[cron/customer-intelligence]", error);
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Customer intelligence scan failed",
      },
      { status: 500 }
    );
  }
}
