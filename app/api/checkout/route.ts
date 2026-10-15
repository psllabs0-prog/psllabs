import { NextResponse } from "next/server";

import {
  prepareReservedOrder,
  type CheckoutBody,
} from "@/lib/checkout/prepare-order";
import { setInvoiceId, setPaymentMethod } from "@/lib/orders/store";
import { getPaymentProcessor } from "@/lib/payments";
import { readRequestPrivacyConsent } from "@/lib/privacy/server";
import { getResearchAccount } from "@/lib/research-auth/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const researchAccount = await getResearchAccount(request);
  if (!researchAccount) return NextResponse.json({ error: "Sign in to your research account to continue." }, { status: 401 });
  let body: CheckoutBody;
  try {
    body = (await request.json()) as CheckoutBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid request format." },
      { status: 400 }
    );
  }

  const privacyConsent = await readRequestPrivacyConsent(request).catch(() => null);
  const prepared = await prepareReservedOrder(body, { paymentMethod: "bitcoin", privacyConsent, researchAccount });
  if (!prepared.ok) {
    return NextResponse.json(
      { error: prepared.error },
      { status: prepared.status }
    );
  }

  const { order } = prepared;

  try {
    await setPaymentMethod(order.orderId, "bitcoin");
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
