import { computeTotals, type AppliedDiscount } from "@/lib/checkout/totals";
import { DISCOUNT_CODES_ENABLED, lookupActiveDiscountCode } from "@/lib/checkout/discount-codes";
import { normalizeReferralCode } from "@/lib/partners/referral-logic";
import { referralCodesEnabled } from "@/lib/partners/referral-config";
import { lookupReferralDiscount } from "@/lib/partners/referral-store";
import { getRates } from "@/lib/btcpostage/client";
import { getBtcpostageFromAddress } from "@/lib/btcpostage/config";
import type { BtcpostageAddress, BtcpostageRate } from "@/lib/btcpostage/types";
import { getPriorityShippingConfig, priorityCardRateConfigured, type PriorityShippingConfig } from "./config";
import { getPriorityShippingPriceUsd, PRIORITY_ORIGIN_ZIP, PRIORITY_PACKAGE, PRIORITY_QUOTE_TTL_MS, priorityCostCovered, readPriorityTransitDays } from "./policy";
import { parseShippingQuoteRequest } from "./request";
import { GUEST_SHIPPING_ACCOUNT_ID, issuePriorityShippingQuote, type PriorityQuoteContext } from "./quote";
import type { ShippingOptionsResponse, ShippingSelection } from "./types";

type OptionsDependencies = {
  config?: PriorityShippingConfig | null;
  now?: number;
  fromAddress?: BtcpostageAddress;
  rates?: (input: Parameters<typeof getRates>[0]) => Promise<BtcpostageRate[]>;
  referralLookup?: typeof lookupReferralDiscount;
  promoLookup?: typeof lookupActiveDiscountCode;
  referralsEnabled?: () => boolean;
  cardRateConfigured?: (priceUsd: number) => boolean;
  admin?: boolean;
};

export type ShippingOptionsResult = { ok: true; data: ShippingOptionsResponse }
  | { ok: false; status: number; error: string };

export async function getShippingOptionsForCheckout(raw: unknown, account: { id: string; email: string },
  deps: OptionsDependencies = {}): Promise<ShippingOptionsResult> {
  const parsed = parseShippingQuoteRequest(raw, account.email);
  if (!parsed) return { ok: false, status: 400, error: "Enter a valid U.S. physical shipping address and cart to check Priority Mail. Standard shipping remains available for eligible orders." };
  const standard = { method: "standard" as const, priceUsd: computeTotals(parsed.subtotalCents / 100).shipping };
  const unavailable = (reason: string): ShippingOptionsResult => ({ ok: true, data: { standard, priority: { available: false, reason } } });
  const config = deps.config === undefined ? getPriorityShippingConfig() : deps.config;
  if (!config) return unavailable("Priority Mail is not currently available. You can continue with standard shipping.");
  if (parsed.items.reduce((sum, item) => sum + item.quantity, 0) > config.maxUnits) {
    return unavailable("This cart exceeds the verified Priority Mail package size. Choose standard shipping or contact support.");
  }
  let discount: AppliedDiscount | null = null;
  const isReferral = !!normalizeReferralCode(parsed.requestedCode);
  if (parsed.requestedCode) {
    if (isReferral) {
      if (deps.admin || !(deps.referralsEnabled ?? referralCodesEnabled)()) return { ok: false, status: 400, error: "This referral code is not available for this order." };
      const referral = await (deps.referralLookup ?? lookupReferralDiscount)(parsed.requestedCode, parsed.email);
      if (!referral) return { ok: false, status: 400, error: "This referral code is not eligible for this order." };
      discount = { ...referral, exclusive: referral.percent > 0 };
    } else if (DISCOUNT_CODES_ENABLED) {
      const promo = await (deps.promoLookup ?? lookupActiveDiscountCode)(parsed.requestedCode);
      if (!promo) return { ok: false, status: 400, error: "Invalid or expired code." };
      discount = { code: promo.code, percent: promo.discountPercent };
    } else return { ok: false, status: 400, error: "Invalid or unavailable code." };
  }
  const totals = computeTotals(parsed.subtotalCents / 100, parsed.shipping.state, discount, { paymentMethod: parsed.paymentMethod });
  const discountCents = Math.round(totals.discountAmount * 100);
  const priceUsd = getPriorityShippingPriceUsd(parsed.subtotalCents - discountCents);
  if (parsed.paymentMethod === "card" && !(deps.cardRateConfigured ?? priorityCardRateConfigured)(priceUsd)) {
    return unavailable("Priority Mail is not available for card checkout yet. You can continue with standard shipping.");
  }
  try {
    const from = deps.fromAddress ?? getBtcpostageFromAddress();
    if (from.zip.slice(0, 5) !== PRIORITY_ORIGIN_ZIP || from.country !== "US") return unavailable("Priority Mail cannot be verified for the shipping origin. Choose standard shipping.");
    const rates = await (deps.rates ?? getRates)({ from, to: { name: `${parsed.shipping.firstName} ${parsed.shipping.lastName}`,
      street1: parsed.shipping.address, city: parsed.shipping.city, state: parsed.shipping.state,
      zip: parsed.shipping.zip, country: "US" }, carrier: "USPS", pkg: { weightLbs: 0, weightOz: PRIORITY_PACKAGE.weightOz,
        heightIn: PRIORITY_PACKAGE.heightIn, widthIn: PRIORITY_PACKAGE.widthIn, depthIn: PRIORITY_PACKAGE.lengthIn, packageType: "Parcel" } });
    const eligible = rates.filter(rate => rate.carrier.toUpperCase() === "USPS" && rate.service === config.serviceCode &&
      rate.currency === "USD" && /^\d+(?:\.\d{1,2})?$/.test(rate.rate) && Number(rate.rate) > 0 &&
      readPriorityTransitDays(rate.estDeliveryDays) !== null &&
      priorityCostCovered(Number(rate.rate), priceUsd, config.extraCostReserveUsd));
    const rate = eligible.sort((a, b) => Number(a.rate) - Number(b.rate))[0];
    if (!rate) return unavailable("Priority Mail is unavailable at a verified price and delivery estimate for your address. Standard shipping remains available.");
    const now = deps.now ?? Date.now();
    const transitDays = readPriorityTransitDays(rate.estDeliveryDays)!;
    const selection: ShippingSelection = { method: "priority", carrier: "USPS", providerServiceCode: rate.service,
      serviceDisplayName: "USPS Priority Mail", transitDays,
      deliveryEstimate: `Estimated ${transitDays} business ${transitDays === 1 ? "day" : "days"} after carrier acceptance; not guaranteed.`,
      quotedPostageUsd: Number(rate.rate), package: { ...PRIORITY_PACKAGE }, quotedAt: new Date(now).toISOString(),
      quoteExpiresAt: new Date(now + PRIORITY_QUOTE_TTL_MS).toISOString() };
    // An account is no longer required. Never accept a caller's account ID as
    // quote authority; the HMAC binds all validated guest checkout details.
    const context: PriorityQuoteContext = { accountId: GUEST_SHIPPING_ACCOUNT_ID, ...parsed, discountCents,
      discountCode: isReferral ? discount?.code ?? null : totals.discountCode };
    const signed = issuePriorityShippingQuote(context, selection, config, now);
    return { ok: true, data: { standard, priority: { available: true, method: "priority", priceUsd,
      quoteToken: signed.quoteToken, expiresAt: signed.expiresAt, selection } } };
  } catch {
    return unavailable("We could not verify Priority Mail for this address. You can continue with standard shipping or try again.");
  }
}
