import { PartnerInputError, validPartnerCode, validatePartnerInput } from "./logic";
import type { PartnerInput } from "./types";

export const REFERRAL_PILOT = {
  version: "psl-referral-pilot-v1",
  discountPercent: 10,
  commissionPercent: 10,
  maximumPartners: 10,
  holdDays: 30,
  supportedPaymentMethods: ["bitcoin"] as const,
} as const;

/** UI capability only. Actual redemption is gated independently by server configuration. */
export const REFERRAL_CODE_FIELD_VISIBLE = true;

export function normalizeReferralCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.trim().toLowerCase();
  return validPartnerCode(code) ? code : null;
}

export function validateReferralApplication(value: unknown, now = new Date()): PartnerInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new PartnerInputError("Invalid application.");
  const input = value as Record<string, unknown>;
  if (input.acceptTerms !== true) throw new PartnerInputError("Please accept the research-only partner terms.");
  if (typeof input.audiencePurpose !== "string" || input.audiencePurpose.trim().length < 20 ||
      input.audiencePurpose.length > 1500 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f<>]/.test(input.audiencePurpose)) {
    throw new PartnerInputError("Describe your audience and proposed laboratory-research content in 20–1,500 characters.");
  }
  return validatePartnerInput({
    businessName: input.name, contactName: input.name, email: input.email,
    website: input.website ?? "", source: "Referral pilot application", destination: "/products",
    notes: `Research-only pilot terms ${REFERRAL_PILOT.version} accepted ${now.toISOString()}.\nAudience and purpose: ${input.audiencePurpose.trim()}`,
  });
}

export type ReferralCommissionCheck = {
  productSubtotal: number;
  discountAmount: number;
  refundedProductAmount: number;
  currency: string;
  paidAt: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  status: string;
  firstPaidOrder: boolean;
  selfReferral: boolean;
  reportingExcluded: boolean;
  financeVerified: boolean;
  refundOrVoidDetected: boolean;
  refundReviewConfirmed: boolean;
  fraudCleared: boolean;
};

export type ReferralCommissionCalculation = {
  eligibleProductSubtotal: number;
  amount: number;
  status: "held" | "payable" | "ineligible";
  reason: string;
  payableAfter: string | null;
};

function cents(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > 1_000_000) throw new PartnerInputError("Invalid referral amount.");
  return Math.round((value + Number.EPSILON) * 100);
}

/** Integer-cent calculation; tax, shipping, fees, and repeat orders never enter the base. */
export function calculateReferralCommission(input: ReferralCommissionCheck, now = new Date()): ReferralCommissionCalculation {
  const subtotal = cents(input.productSubtotal);
  const discount = cents(input.discountAmount);
  const refunded = cents(input.refundedProductAmount);
  if (discount > subtotal || refunded > subtotal - discount) throw new PartnerInputError("Refunds cannot exceed the discounted product subtotal.");
  const base = subtotal - discount - refunded;
  const result = { eligibleProductSubtotal: base / 100, amount: Math.round(base * REFERRAL_PILOT.commissionPercent / 100) / 100,
    payableAfter: null as string | null };
  if (discount !== Math.round(subtotal * REFERRAL_PILOT.discountPercent / 100) ||
      input.currency !== "USD" || !input.paidAt || !["paid", "shipped"].includes(input.status) ||
      !input.firstPaidOrder || input.selfReferral || input.reportingExcluded || input.refundOrVoidDetected || base <= 0) {
    return { ...result, amount: 0, status: "ineligible", reason: "Unpaid, repeat, excluded, self-referred, refunded, voided, or unsupported order." };
  }
  if (!input.financeVerified) return { ...result, status: "held", reason: "Verified payment record required." };
  const delivery = input.deliveredAt ? Date.parse(input.deliveredAt) : NaN;
  if (!input.shippedAt || !Number.isFinite(delivery) || delivery < Date.parse(input.shippedAt) || delivery > now.getTime()) {
    return { ...result, status: "held", reason: "Confirm completed delivery before the hold period begins." };
  }
  result.payableAfter = new Date(delivery + REFERRAL_PILOT.holdDays * 86400000).toISOString();
  if (now.getTime() < Date.parse(result.payableAfter)) return { ...result, status: "held", reason: "30-day post-delivery hold." };
  if (!input.refundReviewConfirmed || !input.fraudCleared) return { ...result, status: "held", reason: "Manual refund and fraud review required." };
  return { ...result, status: "payable", reason: "Eligible for manual payout; no transfer has been initiated." };
}
