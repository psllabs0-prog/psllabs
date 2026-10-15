import { isResearchStatus, type ResearchStatus } from "@/lib/research-auth/qualification";

export const CHECKOUT_RESEARCH_ACK_VERSION = "psl-research-checkout-v1";
export const RESEARCH_USE_CHECKOUT_STATEMENT = "Research use only, not for human consumption";

export type CheckoutResearchDeclaration = {
  version: typeof CHECKOUT_RESEARCH_ACK_VERSION;
  researchStatus: ResearchStatus;
  researchUseOnly: true;
};

/** Private order evidence of a buyer's declaration, never researcher credentials. */
export type OrderResearchAcknowledgement = CheckoutResearchDeclaration & {
  statement: typeof RESEARCH_USE_CHECKOUT_STATEMENT;
  acceptedAt: string;
  accountId: string;
};

export function readCheckoutResearchDeclaration(value: unknown): CheckoutResearchDeclaration | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (raw.version !== CHECKOUT_RESEARCH_ACK_VERSION || !isResearchStatus(raw.researchStatus) ||
      raw.researchUseOnly !== true) return null;
  return { version: CHECKOUT_RESEARCH_ACK_VERSION, researchStatus: raw.researchStatus, researchUseOnly: true };
}

export function readStoredResearchAcknowledgement(value: unknown): OrderResearchAcknowledgement | null {
  const declaration = readCheckoutResearchDeclaration(value);
  if (!declaration) return null;
  const raw = value as Record<string, unknown>;
  if (raw.statement !== RESEARCH_USE_CHECKOUT_STATEMENT || typeof raw.acceptedAt !== "string" ||
      !Number.isFinite(Date.parse(raw.acceptedAt)) || new Date(raw.acceptedAt).toISOString() !== raw.acceptedAt ||
      typeof raw.accountId !== "string" || !raw.accountId.trim() || raw.accountId.length > 150) return null;
  return { ...declaration, statement: RESEARCH_USE_CHECKOUT_STATEMENT, acceptedAt: raw.acceptedAt, accountId: raw.accountId };
}
