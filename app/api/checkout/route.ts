import { NextResponse } from "next/server";

import {
  prepareReservedOrder,
  type CheckoutBody,
} from "@/lib/checkout/prepare-order";
import { setInvoiceId } from "@/lib/orders/store";
import { getPaymentProcessor } from "@/lib/payments";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: CheckoutBody;
  try {
    body = (await request.json()) as CheckoutBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid request format." },
      { status: 400 }
    );
  }

  const prepared = await prepareReservedOrder(body);
  if (!prepared.ok) {
    return NextResponse.json(
      { error: prepared.error },
      { status: prepared.status }
    );
  }

  const { order } = prepared;

  try {
    const processor = getPaymentProcessor("btcpay");
    const session = await processor.createInvoice({
      amount: order.total,
      currency: order.currency,
      orderId: order.orderId,
      redirectPath: `/success?orderId=${order.orderId}`,
      buyerEmail: order.email,
      items: order.items.map((it) => ({
        productId: it.handle,
        name: it.name,
        quantity: it.quantity,
      })),
    });

    await setInvoiceId(order.orderId, session.id);

    return NextResponse.json({
      checkoutLink: session.url,
      orderId: order.orderId,
    });
  } catch (error) {
    console.error("[checkout] Failed to create BTCPay invoice:", error);
    return NextResponse.json(
      { error: "Unable to start checkout. Please try again." },
      { status: 502 }
    );
  }
}
