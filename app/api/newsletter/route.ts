import { NextResponse } from "next/server";

import { subscribeNewsletterEmail } from "@/lib/newsletter/store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: { email?: unknown };
  try {
    body = (await request.json()) as { email?: unknown };
  } catch {
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 400 }
    );
  }

  const email = typeof body.email === "string" ? body.email : "";
  const result = await subscribeNewsletterEmail(email);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    message:
      "Thank you. You'll receive updates on new batch documentation and product availability.",
  });
}
