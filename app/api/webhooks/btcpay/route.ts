import { NextResponse } from "next/server";

import { getPaymentProcessor } from "@/lib/payments";

export async function POST(request: Request) {
  try {
    const payload = await request.text();
    const signature =
      request.headers.get("btcpay-sig") ?? "";

    if (!signature) {
      return NextResponse.json(
        { error: "Missing webhook signature" },
        { status: 401 }
      );
    }

    const processor = getPaymentProcessor();
    const event = await processor.verifyWebhook(payload, signature);

    console.log(
      `[webhook/btcpay] ${event.type} — invoice ${event.invoiceId} → ${event.status}`
    );

    switch (event.status) {
      case "settled":
        // TODO: fulfill order — update database, send confirmation email,
        // trigger shipping workflow
        console.log(
          `[webhook/btcpay] Invoice settled: ${event.invoiceId}`
        );
        break;

      case "processing":
        // Payment received, waiting for confirmations
        console.log(
          `[webhook/btcpay] Invoice processing: ${event.invoiceId}`
        );
        break;

      case "expired":
        // TODO: mark order as expired, release inventory
        console.log(
          `[webhook/btcpay] Invoice expired: ${event.invoiceId}`
        );
        break;

      case "invalid":
        // TODO: flag for manual review
        console.log(
          `[webhook/btcpay] Invoice invalid: ${event.invoiceId}`
        );
        break;

      case "new":
        console.log(
          `[webhook/btcpay] Invoice created: ${event.invoiceId}`
        );
        break;
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("[webhook/btcpay] Error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Webhook processing failed",
      },
      { status: 400 }
    );
  }
}
