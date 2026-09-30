import crypto from "node:crypto";

import { X_ACCOUNT_ID } from "./constants";

type Env = Record<string, string | undefined>;

export const X_PUBLISHER_TOKEN_MIN_LENGTH = 32;

export type XGate = { enabled: boolean; reason: string };

export type XAdminMode = {
  /** live: Production items. test: local/isolated items only. disabled: Preview or misconfigured. */
  mode: "live" | "test" | "disabled";
  reason: string;
};

export type XPublishingConfig = {
  environment: string;
  expectedAccount: XGate;
  machine: XGate;
  live: XGate;
  dryRun: XGate;
  admin: XAdminMode;
};

function isTrue(value: string | undefined): boolean {
  const v = value?.trim().toLowerCase();
  return v === "true" || v === "1";
}

const OTHER_SECRET_NAME_RE = /SECRET|PASSWORD|TOKEN|API_KEY|PRIVATE|DATABASE_URL|POSTGRES/i;

/** True when `token` equals or is contained in any other secret-like variable (never compares `ownName`). */
export function reusesAnotherSecret(token: string, env: Env, ownName = "X_PUBLISHER_TOKEN"): boolean {
  return Object.entries(env).some(([name, value]) => {
    if (name === ownName || !OTHER_SECRET_NAME_RE.test(name)) return false;
    const v = value?.trim();
    return Boolean(v) && (v === token || v!.includes(token));
  });
}

function tokenGate(env: Env): XGate {
  const token = env.X_PUBLISHER_TOKEN?.trim() ?? "";
  if (token.length < X_PUBLISHER_TOKEN_MIN_LENGTH) {
    return {
      enabled: false,
      reason: `X_PUBLISHER_TOKEN is missing or shorter than ${X_PUBLISHER_TOKEN_MIN_LENGTH} characters`,
    };
  }
  if (reusesAnotherSecret(token, env)) {
    return { enabled: false, reason: "X_PUBLISHER_TOKEN reuses another configured secret" };
  }
  return { enabled: true, reason: "token configured" };
}

export function expectedAccountGate(env: Env = process.env): XGate {
  const configured = env.X_EXPECTED_ACCOUNT_ID;
  if (configured === undefined || configured.trim() === "") {
    return { enabled: false, reason: "X_EXPECTED_ACCOUNT_ID is not set" };
  }
  if (configured.trim() !== X_ACCOUNT_ID) {
    return { enabled: false, reason: "X_EXPECTED_ACCOUNT_ID does not match the locked destination account" };
  }
  return { enabled: true, reason: "destination account locked" };
}

function environmentName(env: Env): string {
  if (env.VERCEL_ENV) return env.VERCEL_ENV;
  return env.VERCEL ? "vercel" : "local";
}

/**
 * Fails closed. Live publishing requires Production, the explicit flag, the
 * dedicated token, and the exact expected account ID. Preview can never
 * publish and has no override. Dry-run is test-data-only and refused on any
 * Vercel deployment.
 */
export function getXPublishingConfig(env: Env = process.env): XPublishingConfig {
  const environment = environmentName(env);
  const expectedAccount = expectedAccountGate(env);
  const token = tokenGate(env);

  const machine: XGate =
    env.VERCEL_ENV === "preview"
      ? { enabled: false, reason: "Preview deployment — X publishing endpoints are disabled" }
      : token;

  let live: XGate;
  if (!machine.enabled) live = machine;
  else if (!isTrue(env.X_PUBLISHING_ENABLED)) live = { enabled: false, reason: "X_PUBLISHING_ENABLED is not true" };
  else if (env.VERCEL_ENV !== "production") live = { enabled: false, reason: "Live publishing runs only on the Production deployment" };
  else if (!expectedAccount.enabled) live = expectedAccount;
  else live = { enabled: true, reason: "Live publishing enabled" };

  let dryRun: XGate;
  if (!machine.enabled) dryRun = machine;
  else if (!isTrue(env.X_PUBLISHING_DRY_RUN_ENABLED)) dryRun = { enabled: false, reason: "X_PUBLISHING_DRY_RUN_ENABLED is not true" };
  else if (env.VERCEL || env.VERCEL_ENV) dryRun = { enabled: false, reason: "Dry-run is only available outside Vercel (isolated environments)" };
  else dryRun = { enabled: true, reason: "Dry-run enabled (test items only)" };

  let admin: XAdminMode;
  if (env.VERCEL_ENV === "preview") admin = { mode: "disabled", reason: "Preview deployment — the X queue is read-only here" };
  else if (!expectedAccount.enabled) admin = { mode: "disabled", reason: expectedAccount.reason };
  else if (env.VERCEL_ENV === "production") admin = { mode: "live", reason: "Production — approvals authorize public posts" };
  else admin = { mode: "test", reason: "Non-production — drafts are TEST items and can never reach X" };

  return { environment, expectedAccount, machine, live, dryRun, admin };
}

function digest(value: string): Buffer {
  return crypto.createHash("sha256").update(value, "utf8").digest();
}

/** Accepts only `Authorization: Bearer <X_PUBLISHER_TOKEN>`; constant-time comparison. */
export function verifyXPublisherAuthorization(header: string | null, env: Env = process.env): boolean {
  if (!tokenGate(env).enabled || !header) return false;
  const token = env.X_PUBLISHER_TOKEN!.trim();
  const match = /^Bearer ([^\s]+)$/.exec(header.trim());
  if (!match) return false;
  return crypto.timingSafeEqual(digest(match[1]), digest(token));
}
