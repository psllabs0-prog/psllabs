import { NextResponse } from "next/server";

import { getPaymentProcessor } from "@/lib/payments";
import { getCheckoutProduct } from "@/lib/payments/products";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      productId?: string;
      quantity?: number;
    };

    const { productId, quantity = 1 } = body;

    if (!productId || typeof productId !== "string") {
      return NextResponse.json(
        { error: "productId is required" },
        { status: 400 }
      );
    }

    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
      return NextResponse.json(
        { error: "quantity must be an integer between 1 and 10" },
        { status: 400 }
      );
    }

    const product = getCheckoutProduct(productId);
    if (!product) {
      return NextResponse.json(
        { error: `Unknown product: ${productId}` },
        { status: 404 }
      );
    }

    const processor = getPaymentProcessor();
    const session = await processor.createCheckoutSession(productId, quantity);

    return NextResponse.json({
      url: session.url,
      invoiceId: session.id,
      processor: session.processor,
    });
  } catch (error) {
    console.error("[checkout] Error creating invoice:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to create checkout session",
      },
      { status: 500 }
    );
  }
}
