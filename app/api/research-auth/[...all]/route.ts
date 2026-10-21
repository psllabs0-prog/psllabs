import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Retired account endpoints never access credentials, account data or mail.
// Historical records are retained; public catalog access no longer needs them.
function handler() {
  return NextResponse.json({ error: "Research-account sign-in has been retired. Continue to the PSL Labs catalog." }, {
    status: 410,
    headers: { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" },
  });
}

export { handler as GET, handler as POST };
