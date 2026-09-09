/** Canonical testing disclosure. Use wherever broad lab claims would overstate scope. */
export const TESTING_SCOPE_STATEMENT =
  "The report only covers the tests shown on the original laboratory file.";

/**
 * Internal placeholder for counsel-approved claim window (days).
 * Do not render this string in public UI.
 *
 * TODO: Replace with counsel-approved claim window when a fixed deadline is approved.
 */
export const CLAIM_WINDOW_PLACEHOLDER =
  "[CLAIM_WINDOW - pending counsel approval]";

/** Public wording until counsel provides a final claim-window number. */
export const PUBLIC_CLAIM_WINDOW_NOTICE =
  "Report order issues promptly after carrier-confirmed delivery. Include your order number and clear photos so we can review the claim. A fixed review deadline has not been published. Contact support@psllabs.org as soon as you notice a problem.";

export const LEGAL_ENTITY_NAME = "PSL Group LLC";

/**
 * Explicit policy dates. Update only when that policy document itself changes.
 * Do not derive from build time, deploy time, or unrelated commits.
 */
export const TERMS_LAST_UPDATED = "September 8, 2026";
export const PRIVACY_LAST_UPDATED = "September 8, 2026";

/** @deprecated Prefer TERMS_LAST_UPDATED or PRIVACY_LAST_UPDATED. */
export const LEGAL_LAST_UPDATED = TERMS_LAST_UPDATED;
