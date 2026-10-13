import { isDesignPreview } from "@/lib/design-preview";

/** Server-only deployment switch. Missing or non-exact values fail closed. */
export function referralCodesEnabled(): boolean {
  return !isDesignPreview() && process.env.REFERRAL_CODES_ENABLED === "true";
}
