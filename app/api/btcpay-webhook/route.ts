import crypto from "crypto";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("btcpay-sig") ?? "";
  const secret = process.env.BTCPAY_WEBHOOK_SECRET;

  if (!secret) {
    console.error("[btcpay-webhook] BTCPAY_WEBHOOK_SECRET is not set");
    return NextResponse.json(
      { error: "Webhook not configured" },
      { status: 500 }
    );
  }

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 401 });
  }

  const expected =
    "sha256=" +
    crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (
    sigBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(sigBuffer, expectedBuffer)
  ) {
    console.warn("[btcpay-webhook] Invalid signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: { type?: string; invoiceId?: string };
  try {
    event = JSON.parse(rawBody) as { type?: string; invoiceId?: string };
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  console.log(
    `[btcpay-webhook] event=${event.type ?? "unknown"} invoice=${event.invoiceId ?? "unknown"}`
  );

  // TODO: Once orders are persisted, on "InvoiceSettled" mark the order paid,
  // send the receipt, and trigger fulfillment. Not wired up yet.

  return NextResponse.json({ received: true });
}
