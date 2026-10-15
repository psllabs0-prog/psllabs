import { randomBytes } from "node:crypto";

import { computeTotals } from "@/lib/checkout/totals";
import {
  DISCOUNT_CODES_ENABLED,
  lookupActiveDiscountCode,
} from "@/lib/checkout/discount-codes";
import { normalizeCountryCode, US_COUNTRY, US_STATES } from "@/lib/checkout/us-states";
import { sanitizeAttributionFromBody } from "@/lib/attribution/logic";
import type { OrderAttribution } from "@/lib/attribution/types";
import { checkoutWithStockCheck, ensureInventorySchema } from "@/lib/inventory/store";
import type { Order, OrderItem, PaymentMethod } from "@/lib/orders/types";
import { getAllCheckoutProducts, getCheckoutProduct } from "@/lib/payments/products";
import { getCatalogProductByHandle } from "@/lib/products/catalog";
import type { PrivacyConsentBinding, PublicPrivacyConsent } from "@/lib/privacy/types";
import { lookupReferralDiscount, reserveReferralOrder } from "@/lib/partners/referral-store";
import { normalizeReferralCode } from "@/lib/partners/referral-logic";
import { referralCodesEnabled } from "@/lib/partners/referral-config";
import { readCheckoutResearchDeclaration, RESEARCH_USE_CHECKOUT_STATEMENT } from "@/lib/checkout/research-acknowledgement";
import { markStatusIfPending, saveOrderResearchAcknowledgement } from "@/lib/orders/store";

const MAX_QUANTITY = 10;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_STATES = new Set<string>(US_STATES.map((s) => s.value));

export type CheckoutBody = {
  items?: unknown;
  email?: unknown;
  shipping?: unknown;
  currency?: unknown;
  /** Optional promo code — re-validated server-side; amount never trusted from client. */
  discountCode?: unknown;
  /** Optional payment method — "bitcoin" | "btcpay" | "card". */
  paymentMethod?: unknown;
  /** Optional paid-acquisition attribution from client localStorage. */
  attribution?: unknown;
  /** Required explicit checkout choice, separate from account and cookie consent. */
  researchAcknowledgement?: unknown;
};

export type PrepareOrderOptions = {
  paymentMethod?: PaymentMethod | "btcpay" | null;
  /** Set only by the card route after checking its provider-side promotion configuration. */
  cardReferralPromotionConfigured?: boolean;
  /** Authenticated account supplied by the server, never accepted from body. */
  researchAccount?: { id: string; email: string } | null;
  /** Read from the request's HttpOnly receipt by the server, never from body. */
  privacyConsent?: { consent: PublicPrivacyConsent; binding: PrivacyConsentBinding | null } | null;
};

export function checkoutAttribution(
  raw: unknown,
  privacy: PrepareOrderOptions["privacyConsent"],
): OrderAttribution | null {
  const consent = privacy?.consent;
  const binding = privacy?.binding;
  if (!consent || !binding || consent.choice !== "saved" || !consent.measurement ||
      consent.gpc || consent.admin || consent.expiresAt <= Date.now() ||
      consent.version !== binding.version || consent.revision !== binding.revision) return null;
  const attribution = sanitizeAttributionFromBody(raw) ?? {
    utmSource: null, utmMedium: null, utmCampaign: null, utmContent: null,
    utmTerm: null, landingPage: null, referrer: null, gclid: null, fbclid: null,
    msclkid: null, ttclid: null, oppref: null, firstPaidTouchAt: null,
    lastPaidTouchAt: null, firstPaid: null, lastPaid: null,
  };
  const cleanLocation = (value: string | null, referrer = false): string | null => {
    if (!value) return null;
    try {
      const url = new URL(value, "https://www.psllabs.org");
      if (!["http:", "https:"].includes(url.protocol)) return null;
      return referrer ? `${url.origin}${url.pathname}` : url.pathname;
    } catch { return null; }
  };
  const cleanTouch = <T extends { landingPage: string | null; referrer: string | null; gclid: string | null; fbclid: string | null; msclkid: string | null; ttclid: string | null; oppref?: string | null }>(touch: T): T => ({
    ...touch,
    landingPage: cleanLocation(touch.landingPage),
    referrer: cleanLocation(touch.referrer, true),
    gclid: consent.capabilities.googleMeasurement ? touch.gclid : null,
    fbclid: consent.capabilities.metaMeasurement ? touch.fbclid : null,
    oppref: consent.capabilities.openaiMeasurement ? touch.oppref ?? null : null,
    ttclid: null, msclkid: null,
  });
  return {
    ...cleanTouch(attribution),
    firstPaid: attribution.firstPaid ? cleanTouch(attribution.firstPaid) : null,
    lastPaid: attribution.lastPaid ? cleanTouch(attribution.lastPaid) : null,
    lastEmail: attribution.lastEmail ? cleanTouch(attribution.lastEmail) : null,
    lastAffiliate: attribution.lastAffiliate ? cleanTouch(attribution.lastAffiliate) : null,
    googleAdsMeasurementConsent: consent.capabilities.googleMeasurement,
    openaiAdsMeasurementOptOut: !consent.capabilities.openaiMeasurement,
    privacyConsent: { digest: binding.digest, revision: binding.revision, version: binding.version },
  };
}

type RawItem = { handle?: unknown; quantity?: unknown };
type RawShipping = {
  firstName?: unknown;
  lastName?: unknown;
  address?: unknown;
  city?: unknown;
  state?: unknown;
  zip?: unknown;
  country?: unknown;
};

export type PrepareOrderResult =
  | { ok: true; order: Order }
  | { ok: false; error: string; status: number };

const str = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

/**
 * Validate checkout payload, price from the server catalog, compute totals,
 * persist a pending order, and reserve inventory. Shared by BTCPay and card paths.
 */
export async function prepareReservedOrder(
  body: CheckoutBody,
  options?: PrepareOrderOptions
): Promise<PrepareOrderResult> {
  if (process.env.PSL_VISUAL_PREVIEW === "1") {
    return { ok: false, error: "Preview only. Payments and order creation are disabled.", status: 503 };
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Invalid checkout request.", status: 400 };
  }
  const researchDeclaration = readCheckoutResearchDeclaration(body.researchAcknowledgement);
  if (!researchDeclaration) return {
    ok: false, error: "Choose your research status and confirm research use only, not for human consumption.", status: 400,
  };
  const accountId = options?.researchAccount?.id;
  if (typeof accountId !== "string" || !accountId.trim() || accountId.length > 150) return {
    ok: false, error: "Sign in to your research account before checkout.", status: 401,
  };
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return { ok: false, error: "Cart is empty.", status: 400 };
  }
  if (body.items.length > getAllCheckoutProducts().length) {
    return { ok: false, error: "Cart contains too many product lines.", status: 400 };
  }

  const email = str(body.email);
  if (!email || email.length > 254 || !EMAIL_PATTERN.test(email)) {
    return {
      ok: false,
      error: "A valid email address is required.",
      status: 400,
    };
  }

  const rawShipping = (body.shipping ?? {}) as RawShipping;
  const shipping = {
    firstName: str(rawShipping.firstName),
    lastName: str(rawShipping.lastName),
    address: str(rawShipping.address),
    city: str(rawShipping.city),
    state: str(rawShipping.state).toUpperCase(),
    zip: str(rawShipping.zip),
    country: normalizeCountryCode(str(rawShipping.country) || US_COUNTRY),
  };
  if (
    !shipping.firstName ||
    !shipping.lastName ||
    !shipping.address ||
    !shipping.city ||
    !shipping.zip
  ) {
    return {
      ok: false,
      error: "Complete shipping details are required.",
      status: 400,
    };
  }
  if (!VALID_STATES.has(shipping.state)) {
    return {
      ok: false,
      error: "A valid U.S. state is required.",
      status: 400,
    };
  }

  const currency =
    typeof body.currency === "string" && body.currency.trim()
      ? body.currency.trim().toUpperCase()
      : "USD";
  if (currency !== "USD") {
    return { ok: false, error: "PSL Labs checkout prices are in USD. Select USD to continue.", status: 400 };
  }

  const items: OrderItem[] = [];
  const seenHandles = new Set<string>();
  let subtotalRaw = 0;

  for (const raw of body.items as RawItem[]) {
    const handle = str(raw?.handle).toLowerCase();
    const quantity = raw?.quantity;

    if (!handle) {
      return {
        ok: false,
        error: "Each item requires a product handle.",
        status: 400,
      };
    }
    if (
      !Number.isInteger(quantity) ||
      (quantity as number) < 1 ||
      (quantity as number) > MAX_QUANTITY
    ) {
      return {
        ok: false,
        error: `Quantity for "${handle}" must be between 1 and ${MAX_QUANTITY}.`,
        status: 400,
      };
    }

    const product = getCheckoutProduct(handle);
    if (!product) {
      return {
        ok: false,
        error: `Unknown product: ${handle}`,
        status: 404,
      };
    }
    if (seenHandles.has(product.id)) {
      return { ok: false, error: "Each product may appear only once in your cart.", status: 400 };
    }
    seenHandles.add(product.id);

    const qty = quantity as number;
    const lineTotal = Math.round(product.priceUsd * qty * 100) / 100;
    subtotalRaw += lineTotal;
    items.push({
      handle,
      name: product.name,
      strength: getCatalogProductByHandle(handle)?.strength ?? "",
      quantity: qty,
      unitPrice: product.priceUsd,
      lineTotal,
    });
  }

  // Re-validate promo on the server — never trust client discount amounts.
  let appliedDiscount: { code: string; percent: number; exclusive?: boolean } | null = null;
  let referralDiscount = false;
  const requestedCode = str(body.discountCode);
  if (requestedCode) {
    if (normalizeReferralCode(requestedCode)) {
      if (!referralCodesEnabled()) return { ok: false, error: "Referral discounts are temporarily unavailable.", status: 503 };
      try {
        if (options?.privacyConsent?.consent.admin) return { ok: false, error: "Referral discounts are unavailable in admin sessions.", status: 400 };
        const discount = await lookupReferralDiscount(requestedCode, email);
        if (!discount) return { ok: false, error: "This referral code is not eligible for this order.", status: 400 };
        appliedDiscount = { ...discount, exclusive: discount.percent > 0 };
        referralDiscount = true;
      } catch {
        return { ok: false, error: "Unable to validate the referral code. Please try again later.", status: 503 };
      }
    } else
    if (DISCOUNT_CODES_ENABLED) {
      try {
        const discount = await lookupActiveDiscountCode(requestedCode);
        if (!discount) {
          return {
            ok: false,
            error: "Invalid or expired code",
            status: 400,
          };
        }
        appliedDiscount = {
          code: discount.code,
          percent: discount.discountPercent,
        };
      } catch (error) {
        console.error("[checkout] discount lookup failed:", error);
        return {
          ok: false,
          error: "Unable to validate discount code. Please try again.",
          status: 500,
        };
      }
    } else return { ok: false, error: "Invalid or unavailable code.", status: 400 };
  }

  const rawMethod =
    options?.paymentMethod ??
    (typeof body.paymentMethod === "string" ? body.paymentMethod : null);
  const paymentMethod: PaymentMethod | null =
    rawMethod === "bitcoin" || rawMethod === "btcpay"
      ? "bitcoin"
      : rawMethod === "card"
        ? "card"
        : null;

  if (referralDiscount && paymentMethod === null) return {
    ok: false, error: "Choose a payment method before using a referral code.", status: 400,
  };
  // Tagada owns card pricing. A first-order reduction must exist there, and its
  // actual session totals are checked again before any payment can start.
  if (referralDiscount && paymentMethod === "card" && (appliedDiscount?.percent ?? 0) > 0 &&
      options?.cardReferralPromotionConfigured !== true) return {
    ok: false, error: "The first-order referral discount is not configured for card checkout yet. Use Bitcoin for this discount or remove the code to pay the regular card price.", status: 409,
  };

  const totals = computeTotals(subtotalRaw, shipping.state, appliedDiscount, {
    paymentMethod,
  });
  if (totals.total <= 0) {
    return {
      ok: false,
      error: "Order total must be greater than zero.",
      status: 400,
    };
  }

  const orderId = `psl_${Date.now()}_${randomBytes(16).toString("hex")}`;
  const now = new Date().toISOString();
  const attribution = checkoutAttribution(body.attribution, options?.privacyConsent);
  const order: Order = {
    orderId,
    createdAt: now,
    updatedAt: now,
    status: "pending",
    currency,
    email,
    shipping,
    items,
    subtotal: totals.subtotal,
    // Repeat customers can use the code for commission attribution without a
    // second first-order discount. Preserve that code even with zero reduction.
    discountCode: referralDiscount ? appliedDiscount!.code : totals.discountCode,
    discountAmount: totals.discountAmount,
    taxRate: totals.taxRate,
    tax: totals.tax,
    shippingCost: totals.shipping,
    total: totals.total,
    invoiceId: null,
    invoiceCreatedAt: null,
    paidAt: null,
    paymentMethod,
    emailSent: false,
    emailError: null,
    customerEmailSent: false,
    customerEmailError: null,
    shippedAt: null,
    trackingNumber: null,
    trackingCarrier: null,
    feedbackEmailSent: false,
    trackingEmailSent: false,
    trackingSavedAt: null,
    deliveryFollowupSent: false,
    stockDecremented: false,
    attribution,
    researchAcknowledgement: { ...researchDeclaration, statement: RESEARCH_USE_CHECKOUT_STATEMENT, acceptedAt: now, accountId },
  };

  try {
    // The wrapper uses the same reservation function after a locked first-customer recheck.
    if (referralDiscount) await ensureInventorySchema();
    const stockCheck = referralDiscount ? await reserveReferralOrder(order) : await checkoutWithStockCheck(order);
    if (!stockCheck.ok) {
      return { ok: false, error: stockCheck.error, status: 409 };
    }
    // Unlike optional attribution, this declaration must be durable before
    // returning an order to either payment provider. Never infer old acceptance.
    await saveOrderResearchAcknowledgement(orderId, order.researchAcknowledgement!);
  } catch (error) {
    // Release the pending reservation if mandatory evidence could not be saved.
    // No provider session or invoice has been created at this boundary.
    try { await markStatusIfPending(orderId, "cancelled"); }
    catch { console.error("[checkout] Unable to cancel the failed pending reservation."); }
    console.error("[checkout] Failed to persist order:", error);
    return {
      ok: false,
      error: "Unable to start checkout. Please try again.",
      status: 500,
    };
  }

  return { ok: true, order };
}
