import crypto from "crypto";

import { getMarketingUnsubSecret, isRetentionTestMode } from "@/lib/retention/config";

const CONFIRM_PREFIX = "nc1_";
const UNSUB_PREFIX = "nu1_";
const CONFIRM_RE = /^nc1_[A-Za-z0-9_-]{43}$/;
const UNSUB_RE = /^nu1_([0-9a-f]{32})_([0-9a-f]{32})$/;

export const CONFIRMATION_TOKEN_TTL_MS = 48 * 60 * 60 * 1000;

/** 256-bit random confirmation token; only its SHA-256 hash is stored. */
export function createConfirmationToken(): { token: string; hash: string } {
  const token = `${CONFIRM_PREFIX}${crypto.randomBytes(32).toString("base64url")}`;
  return { token, hash: hashConfirmationToken(token) };
}

export function isConfirmationTokenShape(token: unknown): token is string {
  return typeof token === "string" && CONFIRM_RE.test(token);
}

export function hashConfirmationToken(token: string): string {
  return crypto.createHash("sha256").update(`newsletter-confirm:v1:${token}`, "utf8").digest("hex");
}

export function newSubscriptionPublicId(): string {
  return crypto.randomBytes(16).toString("hex");
}

function signingSecret(): string | null {
  const dedicated = getMarketingUnsubSecret();
  if (dedicated) return dedicated;
  const allowFallback = isRetentionTestMode() || process.env.NODE_ENV === "test" || process.env.NODE_ENV === "development";
  return allowFallback ? "dev-only-unsub-secret" : null;
}

function hmac(purpose: string, value: string): string | null {
  const secret = signingSecret();
  if (!secret) return null;
  return crypto.createHmac("sha256", secret).update(`${purpose}:${value}`).digest("hex").slice(0, 32);
}

/** Opaque per-subscription unsubscribe token; contains no address. */
export function createNewsletterUnsubscribeToken(publicId: string): string {
  const sig = hmac("newsletter-unsub:v1", publicId);
  if (!sig) throw new Error("MARKETING_UNSUB_SECRET is required to create unsubscribe tokens");
  return `${UNSUB_PREFIX}${publicId}_${sig}`;
}

export function isNewsletterUnsubscribeTokenShape(token: string): boolean {
  return UNSUB_RE.test(token);
}

export function verifyNewsletterUnsubscribeToken(token: string): { ok: true; publicId: string } | { ok: false } {
  const m = UNSUB_RE.exec(token);
  if (!m) return { ok: false };
  const expected = hmac("newsletter-unsub:v1", m[1]);
  if (!expected || !crypto.timingSafeEqual(Buffer.from(m[2]), Buffer.from(expected))) return { ok: false };
  return { ok: true, publicId: m[1] };
}

/** Keyed hash for rate-limit buckets so no raw IP or address is stored. */
export function rateLimitKey(kind: "ip" | "email", value: string): string | null {
  const sig = hmac(`newsletter-rate:${kind}`, value);
  return sig ? `${kind}:${sig}` : null;
}
