import { NextResponse } from "next/server";
import { DISCOUNT_CODES_ENABLED, lookupActiveDiscountCode } from "@/lib/checkout/discount-codes";
import { computeTotals } from "@/lib/checkout/totals";
import { normalizeReferralCode } from "@/lib/partners/referral-logic";
import { referralCodesEnabled } from "@/lib/partners/referral-config";
import { lookupReferralDiscount } from "@/lib/partners/referral-store";
import { isSameOriginMutation } from "@/lib/security/request-origin";
import { consumeRequestLimit } from "@/lib/security/request-rate-limit";
import { readRequestPrivacyConsent } from "@/lib/privacy/server";
import { isDesignPreview } from "@/lib/design-preview";
import { configuredReferralPromotionCode } from "@/lib/tagada/referral-checkout";

export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers });
/** Preview only. Server checkout independently locks first-order eligibility. */
export async function POST(request: Request) {
  if (!DISCOUNT_CODES_ENABLED && !referralCodesEnabled()) return json({ error: "Discount codes are not available." }, 404);
  if (!isSameOriginMutation(request)) return json({ error: "Same-origin request required." }, 403);
  if (!/^application\/json(?:;|$)/i.test(request.headers.get("content-type") ?? "")) return json({ error: "JSON required." }, 415);
  if (isDesignPreview()) return json({ error: "Referral code checks are available on the live site." }, 503);
  try {
    const text = await request.text();
    if (text.length > 2000) return json({ error: "Request is too large." }, 413);
    const body = JSON.parse(text) as Record<string, unknown>;
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Invalid request format." }, 400);
    const rawCode = typeof body.code === "string" ? body.code : "";
    if (!rawCode || rawCode.length > 80) return json({ error: "Invalid or unavailable code." }, 400);
    const rateLimit = await consumeRequestLimit(request, "referral-code-check", 15, 900);
    if (rateLimit) return rateLimit;
    if (referralCodesEnabled() && normalizeReferralCode(rawCode)) {
      const email = typeof body.email === "string" && body.email.length <= 254 ? body.email.trim() : "";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Enter your checkout email before applying a referral code." }, 400);
      const privacy = await readRequestPrivacyConsent(request);
      if (privacy.consent.admin) return json({ error: "Referral codes are unavailable in admin sessions." }, 400);
      const discount = await lookupReferralDiscount(rawCode, email);
      if (!discount) return json({ error: "This referral code is not eligible for this order." }, 400);
      const cardSupported = discount.percent === 0 || configuredReferralPromotionCode() !== null;
      return json({ code: discount.code, discountPercent: discount.percent, exclusive: discount.percent > 0,
        referral: true,
        message: discount.percent === 0 ? "Referral code recorded. The first-order discount has already been used; your partner can still earn on this eligible order."
          : "10% first-order referral discount applied.",
        supportedPaymentMethods: cardSupported ? ["bitcoin", "card"] : ["bitcoin"] });
    }
    const discount = await lookupActiveDiscountCode(rawCode);
    if (!discount) return json({ error: "Invalid or unavailable code." }, 400);
    const subtotal = typeof body.subtotal === "number" && Number.isFinite(body.subtotal) ? Math.max(0, body.subtotal) : 0;
    const totals = computeTotals(subtotal, "", { code: discount.code, percent: discount.discountPercent });
    return json({ code: discount.code, discountPercent: discount.discountPercent, discountAmount: totals.discountAmount });
  } catch {
    return json({ error: "Unable to validate this code. Please try again later." }, 503);
  }
}
