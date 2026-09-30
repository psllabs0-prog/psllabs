import crypto from "node:crypto";

import { getXPublishingConfig, reusesAnotherSecret, type XGate } from "@/lib/x-publishing/config";

type Env = Record<string, string | undefined>;

export const X_DRAFT_TOKEN_MIN_LENGTH = 32;
const TOKEN_NAME = "X_DRAFT_ASSISTANT_TOKEN";

export type XDraftConfig = {
  environment: string;
  gate: XGate;
  /** Partition drafts are written to; null when disabled. Mirrors the /admin-social mode. */
  isTest: boolean | null;
};

function isTrue(value: string | undefined): boolean {
  const v = value?.trim().toLowerCase();
  return v === "true" || v === "1";
}

function tokenGate(env: Env): XGate {
  const token = env[TOKEN_NAME]?.trim() ?? "";
  if (token.length < X_DRAFT_TOKEN_MIN_LENGTH) {
    return { enabled: false, reason: `${TOKEN_NAME} is missing or shorter than ${X_DRAFT_TOKEN_MIN_LENGTH} characters` };
  }
  if (reusesAnotherSecret(token, env, TOKEN_NAME)) {
    return { enabled: false, reason: `${TOKEN_NAME} reuses another configured secret (it must differ from X_PUBLISHER_TOKEN and every other secret)` };
  }
  return { enabled: true, reason: "token configured" };
}

/**
 * Fails closed. The draft assistant needs its own flag and dedicated token,
 * never runs on Preview, and writes to the same partition /admin-social shows:
 * live items on Production, TEST items everywhere else.
 */
export function getXDraftConfig(env: Env = process.env): XDraftConfig {
  const publishing = getXPublishingConfig(env);
  const environment = publishing.environment;
  const disabled = (reason: string): XDraftConfig => ({ environment, gate: { enabled: false, reason }, isTest: null });

  if (env.VERCEL_ENV === "preview") return disabled("Preview deployment — the draft assistant is disabled");
  if (!isTrue(env.X_DRAFT_ASSISTANT_ENABLED)) return disabled("X_DRAFT_ASSISTANT_ENABLED is not true");
  const token = tokenGate(env);
  if (!token.enabled) return disabled(token.reason);
  if (publishing.admin.mode === "disabled") return disabled(publishing.admin.reason);
  return {
    environment,
    gate: { enabled: true, reason: "Draft assistant enabled (draft insertion only)" },
    isTest: publishing.admin.mode === "test",
  };
}

function digest(value: string): Buffer {
  return crypto.createHash("sha256").update(value, "utf8").digest();
}

/** Accepts only `Authorization: Bearer <X_DRAFT_ASSISTANT_TOKEN>`; constant-time comparison. */
export function verifyXDraftAuthorization(header: string | null, env: Env = process.env): boolean {
  if (!tokenGate(env).enabled || !header) return false;
  const match = /^Bearer ([^\s]+)$/.exec(header.trim());
  if (!match) return false;
  return crypto.timingSafeEqual(digest(match[1]), digest(env[TOKEN_NAME]!.trim()));
}

/** Key for batch-token signatures, derived so the raw token is never used directly as an HMAC key elsewhere. */
export function batchSigningKey(env: Env = process.env): Buffer | null {
  if (!tokenGate(env).enabled) return null;
  return crypto.createHmac("sha256", env[TOKEN_NAME]!.trim()).update("psl:x-drafts:batch-token:v1").digest();
}
