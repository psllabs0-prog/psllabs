import { NextResponse } from "next/server";

import { getAuthNetPublicConfig } from "@/lib/payments/authnet";

export const runtime = "nodejs";

/**
 * Public Accept UI credentials only (API Login ID + Client Key).
 * Transaction key never leaves the server.
 */
export async function GET() {
  return NextResponse.json(getAuthNetPublicConfig());
}
