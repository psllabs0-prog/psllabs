import { PartnerInputError, validatePartnerInput } from "./logic";
import { REFERRAL_PILOT } from "./referral-logic";
import type { PartnerInput } from "./types";

export type PartnerRegistration = {
  partner: PartnerInput;
  preferredCode: string | null;
  payoutMethod: "zelle" | "arrange";
  payoutContact: string;
  termsVersion: string;
};

/** A payout contact is not a bank credential, and registration never subscribes to marketing. */
export function validatePartnerRegistration(value: unknown): PartnerRegistration {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new PartnerInputError("Invalid registration.");
  const input = value as Record<string, unknown>;
  if (input.acceptTerms !== true) throw new PartnerInputError("Please accept the partner program terms.");
  const preferred = typeof input.preferredCode === "string" ? input.preferredCode.trim().toLowerCase() : "";
  if (preferred && !/^[a-z0-9]{3,24}$/.test(preferred)) throw new PartnerInputError("Choose a code with 3–24 letters or numbers.");
  const payoutMethod = input.payoutMethod ?? "arrange";
  if (payoutMethod !== "zelle" && payoutMethod !== "arrange") throw new PartnerInputError("Choose a supported manual payout method.");
  const payoutContact = typeof input.payoutContact === "string" ? input.payoutContact.trim() : "";
  if (payoutContact.length > 254 || /[\u0000-\u001f\u007f<>]/.test(payoutContact)) throw new PartnerInputError("Enter a valid payout contact.");
  if (payoutMethod === "zelle" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payoutContact) && !/^\+?[\d ()-]{7,25}$/.test(payoutContact)) {
    throw new PartnerInputError("Enter the email or phone number used for Zelle.");
  }
  const partner = validatePartnerInput({ businessName: input.name, contactName: input.name, email: input.email,
    website: input.website ?? "", source: "Self-service referral registration", destination: "/products",
    notes: `Research-only partner terms ${REFERRAL_PILOT.version} accepted. Email verification required before activation.` });
  return { partner, preferredCode: preferred || null, payoutMethod, payoutContact, termsVersion: REFERRAL_PILOT.version };
}

export function validateManualPayout(value: Record<string, unknown>) {
  if (typeof value.partnerId !== "string" || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value.partnerId)) throw new PartnerInputError("Choose a partner.");
  if (!Array.isArray(value.orderIds) || value.orderIds.length === 0 || value.orderIds.length > 500 ||
      !value.orderIds.every(id => typeof id === "string" && /^psl_[a-zA-Z0-9_-]{1,100}$/.test(id)) ||
      new Set(value.orderIds).size !== value.orderIds.length) throw new PartnerInputError("Choose unique eligible referral orders.");
  if (value.paymentSentConfirmed !== true) throw new PartnerInputError("Confirm that you already sent this manual payment.");
  const reference = typeof value.reference === "string" ? value.reference.trim() : "";
  const method = typeof value.method === "string" ? value.method.trim() : "";
  const period = typeof value.period === "string" ? value.period : "";
  if (!/^[a-zA-Z0-9][a-zA-Z0-9 _./#-]{2,99}$/.test(reference)) throw new PartnerInputError("Enter a payment reference without private account details.");
  if (!["zelle", "bank", "other"].includes(method)) throw new PartnerInputError("Choose the method used for this manual payment.");
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(period)) throw new PartnerInputError("Choose the commission month.");
  if (typeof value.expectedAmount !== "number" || !Number.isFinite(value.expectedAmount) || value.expectedAmount <= 0 || value.expectedAmount > 1_000_000 || Math.abs(Math.round(value.expectedAmount * 100) - value.expectedAmount * 100) > 0.000001) throw new PartnerInputError("Enter the exact payment amount in USD.");
  return { partnerId: value.partnerId, orderIds: value.orderIds as string[], reference, method, period, expectedAmount: value.expectedAmount };
}
