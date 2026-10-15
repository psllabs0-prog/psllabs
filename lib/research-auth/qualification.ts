/** Stated research role; this is not a credential or license verification. */
export const RESEARCH_STATUSES = [
  { value: "academic_institutional", label: "Academic / institutional research" },
  { value: "commercial_laboratory", label: "Commercial / laboratory research" },
  { value: "independent_researcher", label: "Independent laboratory researcher" },
] as const;

export type ResearchStatus = typeof RESEARCH_STATUSES[number]["value"];
export const RESEARCH_QUALIFICATION_VERSION = "2026-10-14";

export function isResearchStatus(value: unknown): value is ResearchStatus {
  return RESEARCH_STATUSES.some(status => status.value === value);
}

export function hasResearchQualification(user: {
  researchStatus?: unknown; ageConfirmed?: unknown; researchUseConfirmed?: unknown;
  qualificationVersion?: unknown;
}): boolean {
  return isResearchStatus(user.researchStatus) && user.ageConfirmed === true &&
    user.researchUseConfirmed === true && user.qualificationVersion === RESEARCH_QUALIFICATION_VERSION;
}

/** Only local storefront paths may be used after sign-in. No URL credentials or external hosts. */
export function safeResearchReturnPath(value: unknown): string {
  if (typeof value !== "string" || value.length > 1500 || !value.startsWith("/") ||
      value.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(value)) return "/";
  try {
    const url = new URL(value, "https://www.psllabs.org");
    const path = decodeURIComponent(url.pathname);
    if (url.origin !== "https://www.psllabs.org" || /[\\%]/.test(path) ||
        /^\/(?:api|admin[^/]*|research-account)(?:\/|$)/i.test(path)) return "/";
    // Query strings may contain private payment-return tokens or advertising identifiers.
    // Restore the requested page only; its public state can be selected again there.
    return url.pathname;
  } catch { return "/"; }
}
