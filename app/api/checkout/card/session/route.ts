import { NextResponse } from "next/server";

import { normalizeCountryCode } from "@/lib/checkout/us-states";

import {
  prepareReservedOrder,
  type CheckoutBody,
} from "@/lib/checkout/prepare-order";
import { markStatusIfPending, setInvoiceId, setPaymentMethod, setOrderShippingSelection } from "@/lib/orders/store";
import { getTagadaIdsForHandle, isTagadaConfigured } from "@/lib/tagada";
import { createTagadaCheckoutSession } from "@/lib/tagada/server";
import { readRequestPrivacyConsent } from "@/lib/privacy/server";
import { normalizeReferralCode } from "@/lib/partners/referral-logic";
import { configuredReferralPromotionCode, configureAndVerifyCardSession } from "@/lib/tagada/referral-checkout";
import { getResearchAccount } from "@/lib/research-auth/server";

export const runtime = "nodejs";
// Promotion settlement can need read-only confirmation after a provider timeout.
export const maxDuration = 300;

/**
 * Reserve inventory, create a Tagada checkout session, and return tokens for
 * the browser headless SDK (tokenize + processPayment).
 */
export async function POST(request: Request) {
  const researchAccount = await getResearchAccount(request);
  if (!researchAccount) return NextResponse.json({ error: "Sign in to your research account to continue." }, { status: 401 });
  if (process.env.PSL_VISUAL_PREVIEW === "1") return NextResponse.json(
    { error: "Preview only. Payments and order creation are disabled." }, { status: 503 });
  if (!isTagadaConfigured()) {
    return NextResponse.json(
      { error: "Card checkout is not available." },
      { status: 503 }
    );
  }

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
  const referralPromotionCode = configuredReferralPromotionCode();
  const prepared = await prepareReservedOrder(body, { paymentMethod: "card", privacyConsent, researchAccount,
    cardReferralPromotionConfigured: referralPromotionCode !== null });
  if (!prepared.ok) {
    return NextResponse.json(
      { error: prepared.error },
      { status: prepared.status }
    );
  }

  const { order } = prepared;
  let checkoutToken: string | null = null;
  let tokenPersisted = false;
  // This route has not exposed payment tokens. Release only this new pending
  // reservation; a paid order or a different provider session stays untouched.
  const releaseFailedSetup = async () => {
    const binding = { paymentMethod: "card" as const, total: order.total, currency: order.currency };
    try {
      if (checkoutToken) await markStatusIfPending(order.orderId, "cancelled", { ...binding, invoiceId: checkoutToken });
      if (!tokenPersisted) await markStatusIfPending(order.orderId, "cancelled", { ...binding, invoiceId: null });
    } catch {
      console.error("[checkout/card/session] Unable to release the failed pending reservation.");
    }
  };

  try {
    await setPaymentMethod(order.orderId, "card");

    const sessionItems: Array<{ variantId: string; quantity: number }> = [];
    for (const item of order.items) {
      const ids = await getTagadaIdsForHandle(item.handle);
      if (!ids) {
        await releaseFailedSetup();
        return NextResponse.json(
          {
            error:
              "This product is not synced for card checkout yet. Please pay with Bitcoin or contact support.",
            orderId: order.orderId,
          },
          { status: 409 }
        );
      }
      sessionItems.push({
        variantId: ids.tagadaVariantId,
        quantity: item.quantity,
      });
    }

    const session = await createTagadaCheckoutSession({
      items: sessionItems,
      email: order.email,
      firstName: order.shipping.firstName,
      lastName: order.shipping.lastName,
      orderId: order.orderId,
      referralCode: normalizeReferralCode(order.discountCode),
      shippingMethod: order.shipping.selection?.method ?? "standard",
    });

    // Persist Token for webhook / fulfill correlation
    checkoutToken = session.checkoutToken;
    await setInvoiceId(order.orderId, session.checkoutToken);
    tokenPersisted = true;

    const binding = await configureAndVerifyCardSession(order, session, {
      storeId: process.env.TAGADA_STORE_ID!, items: sessionItems,
    }, normalizeReferralCode(order.discountCode) ? referralPromotionCode : null);
    if (!order.shipping.selection) throw new Error("The reserved shipping method is unavailable.");
    const shippingSelection = { ...order.shipping.selection, tagadaShippingRateId: binding.shippingRateId };
    await setOrderShippingSelection(order.orderId, shippingSelection);

    return NextResponse.json({
      orderId: order.orderId,
      checkoutToken: session.checkoutToken,
      sessionToken: session.sessionToken,
      storeId: process.env.TAGADA_STORE_ID,
      customer: {
        email: order.email,
        firstName: order.shipping.firstName,
        lastName: order.shipping.lastName,
      },
      shippingAddress: {
        line1: order.shipping.address,
        city: order.shipping.city,
        state: order.shipping.state,
        postalCode: order.shipping.zip,
        country: normalizeCountryCode(order.shipping.country || "US"),
      },
      items: sessionItems,
      total: order.total,
      shippingCost: order.shippingCost,
      shippingMethod: shippingSelection.method,
      shippingSelection,
      tagadaShippingRateId: binding.shippingRateId,
      ...(shippingSelection.quoteExpiresAt ? { shippingQuoteExpiresAt: shippingSelection.quoteExpiresAt } : {}),
      ...(shippingSelection.method === "priority" && typeof body.shippingQuote === "string" ? {
        shippingQuote: body.shippingQuote,
      } : {}),
      researchAcknowledgementVersion: order.researchAcknowledgement?.version,
      pricing: { subtotal: order.subtotal, discountCode: order.discountCode, discountAmount: order.discountAmount, tax: order.tax },
    });
  } catch (error) {
    await releaseFailedSetup();
    const message =
      error instanceof Error
        ? error.message
        : "Unable to start card checkout.";
    console.error("[checkout/card/session]", message);
    return NextResponse.json(
      {
        error:
          "We couldn't start card payment. Please try again or use Bitcoin.",
        orderId: order.orderId,
      },
      { status: 502 }
    );
  }
}
