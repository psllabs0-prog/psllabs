import { createHash, randomBytes } from "node:crypto";
import {
  NO_PRIVACY_CAPABILITIES, PRIVACY_CONSENT_TTL_MS, PRIVACY_CONSENT_VERSION,
  UNKNOWN_PRIVACY_CONSENT, type PrivacyCapabilities, type PrivacyChoices,
  type PrivacyConsentBinding, type PublicPrivacyConsent,
} from "./types";

export type ConsentRecord = PrivacyConsentBinding & PrivacyChoices & { expiresAt: number };
export interface ConsentStore {
  read(digest: string): Promise<ConsentRecord | null>;
  save(digest: string, choices: PrivacyChoices, expiresAt: number, expectedRevision?: number): Promise<ConsentRecord | null>;
  revoke(digest: string): Promise<void>;
}
export type ConsentContext = { gpc: boolean; admin: boolean };
export type ConsentRead = { consent: PublicPrivacyConsent; binding: PrivacyConsentBinding | null };
const TOKEN_PATTERN = /^[a-f0-9]{64}$/;
export class ConsentConflictError extends Error {}
export const createConsentToken = () => randomBytes(32).toString("hex");
export function consentDigest(token: string | undefined): string | null {
  return token && TOKEN_PATTERN.test(token) ? createHash("sha256").update(token).digest("hex") : null;
}
export function createPrivacyService(dependencies: {
  store: ConsentStore;
  capabilities?: () => PrivacyCapabilities;
  now?: () => number;
}) {
  const now = dependencies.now ?? Date.now;
  const capabilities = dependencies.capabilities ?? (() => NO_PRIVACY_CAPABILITIES);
  function present(record: ConsentRecord | null, context: ConsentContext): ConsentRead {
    const base = { ...UNKNOWN_PRIVACY_CONSENT, ...context, capabilities: capabilities() };
    if (!record || record.version !== PRIVACY_CONSENT_VERSION || record.expiresAt <= now()) {
      // Renewal still needs the current revision for the atomic grant check.
      return { consent: { ...base, revision: record?.revision ?? 0 }, binding: null };
    }
    const allowed = !context.gpc && !context.admin;
    return {
      consent: { ...base, choice: "saved", revision: record.revision, expiresAt: record.expiresAt,
        measurement: allowed && record.measurement,
        personalization: allowed && record.measurement && record.personalization },
      binding: allowed && record.measurement
        ? { digest: record.digest, revision: record.revision, version: record.version } : null,
    };
  }
  async function read(token: string | undefined, context: ConsentContext): Promise<ConsentRead> {
    const digest = consentDigest(token);
    if (!digest) return present(null, context);
    try {
      if (context.gpc || context.admin) await dependencies.store.revoke(digest);
      return present(await dependencies.store.read(digest), context);
    } catch {
      // Measurement must never make shopping or privacy controls fail open.
      return present(null, context);
    }
  }
  async function save(token: string | undefined, choices: PrivacyChoices, context: ConsentContext, expectedRevision = 0) {
    const currentToken = token && TOKEN_PATTERN.test(token) ? token : createConsentToken();
    const digest = consentDigest(currentToken)!;
    const available = capabilities();
    const permitted = !context.gpc && !context.admin && choices.measurement &&
      (available.googleMeasurement || available.openaiMeasurement || available.metaMeasurement);
    const record = await dependencies.store.save(digest, {
      measurement: permitted, personalization: permitted && available.metaPersonalization && choices.personalization,
    }, now() + PRIVACY_CONSENT_TTL_MS, permitted ? expectedRevision : undefined);
    if (!record) throw new ConsentConflictError("Preferences changed in another tab. Please review your current choice.");
    return { ...present(record, context), token: currentToken };
  }
  async function current(binding: PrivacyConsentBinding | null | undefined,
    provider: "google" | "openai" | "meta", personalization = false): Promise<boolean> {
    if (!binding || !TOKEN_PATTERN.test(binding.digest) ||
        !Number.isSafeInteger(binding.revision) || binding.revision < 1 ||
        binding.version !== PRIVACY_CONSENT_VERSION) return false;
    const caps = capabilities();
    if (!(provider === "google" ? caps.googleMeasurement : provider === "openai"
      ? caps.openaiMeasurement : caps.metaMeasurement) || (personalization && !caps.metaPersonalization)) return false;
    try {
      const record = await dependencies.store.read(binding.digest);
      return Boolean(record && record.version === binding.version && record.revision === binding.revision &&
        record.expiresAt > now() && record.measurement && (!personalization || record.personalization));
    } catch { return false; }
  }
  return { read, save, current };
}
