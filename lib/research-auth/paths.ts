export const RESEARCH_SIGN_IN_PATH = "/research-account/sign-in";
export const RESEARCH_PATH_HEADER = "x-psl-research-request-path";

/** Small, explicit public surface: no store navigation or catalog is rendered here. */
export function isPublicResearchPage(path: string): boolean {
  return ["/terms", "/privacy", "/contact", "/research-account/sign-in", "/research-account/sign-up",
    "/research-account/forgot-password", "/research-account/reset-password"].includes(path);
}

export function isResearchRecoveryPage(path: string): boolean {
  return ["/payment-return", "/success", "/cancel", "/unsubscribe", "/newsletter/confirm"].includes(path);
}

export function isOperationalResearchPath(path: string): boolean {
  if (/^\/admin[^/]*(?:\/|$)/i.test(path)) return true;
  // These routes retain their existing independent admin, service, provider,
  // one-time email, order-receipt or partner authentication. No catalog API is exempt.
  if (/^\/api\/(?:admin|cron|integrations\/n8n)(?:\/|$)/.test(path)) return true;
  if (/^\/api\/partners\/(?:auth|account)(?:\/|$)/.test(path)) return true;
  return ["/api/btcpay-webhook", "/api/tagada-webhook", "/api/discord/interactions",
    "/api/privacy/consent", "/api/contact", "/api/marketing/unsubscribe", "/api/newsletter/confirm",
    "/api/checkout/card", "/api/order-status", "/api/customer-feedback"].includes(path);
}

export function isResearchAuthApiPath(path: string): boolean {
  return path === "/api/research-auth" || path.startsWith("/api/research-auth/");
}

export function isResearchStaticPath(path: string): boolean {
  return path.startsWith("/_next/static/") || path === "/_next/image" || path === "/favicon.ico" || path === "/robots.txt" || path === "/sitemap.xml" ||
    /\.(?:css|js|map|png|jpg|jpeg|webp|avif|svg|ico|woff2?|ttf|webmanifest)$/i.test(path);
}

export function researchPathRequiresAccount(path: string): boolean {
  return !isPublicResearchPage(path) && !isResearchRecoveryPage(path) && !isOperationalResearchPath(path) &&
    !isResearchAuthApiPath(path) && !isResearchStaticPath(path);
}
