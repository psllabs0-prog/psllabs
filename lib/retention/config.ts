import crypto from "crypto";

export const RETENTION_UTM = {
  utm_source: "email",
  utm_medium: "email",
  utm_campaign: "post_purchase_30d_v1",
  utm_content: "products_batch_reports",
} as const;

export function isRetentionAutoSendEnabled(): boolean {
  return process.env.RETENTION_AUTO_SEND_ENABLED?.trim().toLowerCase() === "true";
}

export function isRetentionTestMode(): boolean {
  return (
    process.env.RETENTION_TEST_MODE?.trim().toLowerCase() === "true" ||
    process.env.SUPPORT_TEST_MODE?.trim().toLowerCase() === "true"
  );
}

export function getMarketingFromEmail(): string | null {
  return process.env.MARKETING_FROM_EMAIL?.trim() || null;
}

export function getMarketingPostalAddress(): string | null {
  return process.env.MARKETING_POSTAL_ADDRESS?.trim() || null;
}

/** Dedicated unsubscribe signing secret — required for production retention readiness. */
export function getMarketingUnsubSecret(): string | null {
  return process.env.MARKETING_UNSUB_SECRET?.trim() || null;
}

/**
 * Signing secret for tokens.
 * Production retention readiness requires MARKETING_UNSUB_SECRET.
 * Dev/test may use a controlled fallback so unit tests can run without prod secrets.
 */
function unsubSecretForSigning(): string | null {
  const dedicated = getMarketingUnsubSecret();
  if (dedicated) return dedicated;

  const allowFallback =
    isRetentionTestMode() ||
    process.env.NODE_ENV === "test" ||
    process.env.NODE_ENV === "development";

  if (!allowFallback) return null;
  return "dev-only-unsub-secret";
}

/** Compliance gate — never invent a mailing address or unsigned unsub tokens. */
export function getRetentionReadiness(): {
  ready: boolean;
  reasons: string[];
  fromEmail: string | null;
  postalAddress: string | null;
  autoSendEnabled: boolean;
  unsubSecretConfigured: boolean;
} {
  const fromEmail = getMarketingFromEmail();
  const postalAddress = getMarketingPostalAddress();
  const unsubSecretConfigured = Boolean(getMarketingUnsubSecret());
  const reasons: string[] = [];
  if (!fromEmail) reasons.push("MARKETING_FROM_EMAIL missing");
  if (!postalAddress) reasons.push("MARKETING_POSTAL_ADDRESS missing");
  if (!unsubSecretConfigured) reasons.push("MARKETING_UNSUB_SECRET missing");
  const autoSendEnabled = isRetentionAutoSendEnabled();
  if (!autoSendEnabled) reasons.push("RETENTION_AUTO_SEND_ENABLED is not true");
  return {
    ready: reasons.length === 0,
    reasons,
    fromEmail,
    postalAddress,
    autoSendEnabled,
    unsubSecretConfigured,
  };
}

export function retentionProductsUrl(siteUrl: string): string {
  const u = new URL("/products", siteUrl.replace(/\/$/, ""));
  for (const [k, v] of Object.entries(RETENTION_UTM)) {
    u.searchParams.set(k, v);
  }
  return u.toString();
}

/** Human confirmation page (visible email body link). */
export function humanUnsubscribeUrl(siteUrl: string, token: string): string {
  const base = siteUrl.replace(/\/$/, "");
  return `${base}/unsubscribe?token=${encodeURIComponent(token)}`;
}

/** List-Unsubscribe / one-click API URL (email header only). */
export function listUnsubscribeApiUrl(siteUrl: string, token: string): string {
  const base = siteUrl.replace(/\/$/, "");
  return `${base}/api/marketing/unsubscribe?token=${encodeURIComponent(token)}`;
}

export function createUnsubscribeToken(email: string): string {
  const secret = unsubSecretForSigning();
  if (!secret) {
    throw new Error("MARKETING_UNSUB_SECRET is required to create unsubscribe tokens");
  }
  const normalized = email.trim().toLowerCase();
  const sig = crypto
    .createHmac("sha256", secret)
    .update(`unsub:${normalized}`)
    .digest("hex")
    .slice(0, 32);
  return Buffer.from(`${normalized}:${sig}`).toString("base64url");
}

export function verifyUnsubscribeToken(
  token: string
): { ok: true; email: string } | { ok: false } {
  try {
    const secret = unsubSecretForSigning();
    if (!secret || !token) return { ok: false };

    const raw = Buffer.from(token, "base64url").toString("utf8");
    const idx = raw.lastIndexOf(":");
    if (idx <= 0) return { ok: false };
    const email = raw.slice(0, idx).trim().toLowerCase();
    const sig = raw.slice(idx + 1);
    if (!email.includes("@") || !sig) return { ok: false };

    const expectedSig = crypto
      .createHmac("sha256", secret)
      .update(`unsub:${email}`)
      .digest("hex")
      .slice(0, 32);

    if (
      sig.length !== expectedSig.length ||
      !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))
    ) {
      return { ok: false };
    }
    return { ok: true, email };
  } catch {
    return { ok: false };
  }
}

export const RETENTION_SUBJECT = "Current availability & batch documentation";

/** Days after paid_at before a retention candidate is due (experiment). */
export function getRetentionDelayDays(): number {
  const raw = process.env.RETENTION_DELAY_DAYS?.trim();
  const n = raw ? Number(raw) : 30;
  if (!Number.isFinite(n) || n < 1) return 30;
  return Math.min(n, 365);
}
