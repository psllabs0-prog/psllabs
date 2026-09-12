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

/** Compliance gate — never invent a mailing address. */
export function getRetentionReadiness(): {
  ready: boolean;
  reasons: string[];
  fromEmail: string | null;
  postalAddress: string | null;
  autoSendEnabled: boolean;
} {
  const fromEmail = getMarketingFromEmail();
  const postalAddress = getMarketingPostalAddress();
  const reasons: string[] = [];
  if (!fromEmail) reasons.push("MARKETING_FROM_EMAIL missing");
  if (!postalAddress) reasons.push("MARKETING_POSTAL_ADDRESS missing");
  const autoSendEnabled = isRetentionAutoSendEnabled();
  if (!autoSendEnabled) reasons.push("RETENTION_AUTO_SEND_ENABLED is not true");
  return {
    ready: reasons.length === 0,
    reasons,
    fromEmail,
    postalAddress,
    autoSendEnabled,
  };
}

export function retentionProductsUrl(siteUrl: string): string {
  const u = new URL("/products", siteUrl.replace(/\/$/, ""));
  for (const [k, v] of Object.entries(RETENTION_UTM)) {
    u.searchParams.set(k, v);
  }
  return u.toString();
}

function unsubSecret(): string {
  return (
    process.env.MARKETING_UNSUB_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    "dev-only-unsub-secret"
  );
}

export function createUnsubscribeToken(email: string): string {
  const normalized = email.trim().toLowerCase();
  const sig = crypto
    .createHmac("sha256", unsubSecret())
    .update(`unsub:${normalized}`)
    .digest("hex")
    .slice(0, 32);
  return Buffer.from(`${normalized}:${sig}`).toString("base64url");
}

export function verifyUnsubscribeToken(
  token: string
): { ok: true; email: string } | { ok: false } {
  try {
    const raw = Buffer.from(token, "base64url").toString("utf8");
    const idx = raw.lastIndexOf(":");
    if (idx <= 0) return { ok: false };
    const email = raw.slice(0, idx).trim().toLowerCase();
    const sig = raw.slice(idx + 1);
    const expected = createUnsubscribeToken(email);
    const expectedRaw = Buffer.from(expected, "base64url").toString("utf8");
    const expectedSig = expectedRaw.slice(expectedRaw.lastIndexOf(":") + 1);
    if (
      !email.includes("@") ||
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
