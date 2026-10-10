import { getSql } from "../db/sql";
import { verifyAdminSessionToken } from "../admin/auth";
import { readGoogleAdsConfig } from "../google-ads/config";
import { readOpenAIAdsConfig } from "../openai-ads/client";
import { createPrivacyService, type ConsentRecord, type ConsentStore } from "./service";
import { PRIVACY_CONSENT_COOKIE, PRIVACY_CONSENT_VERSION, type PrivacyConsentBinding } from "./types";

function parseRecord(row: Record<string, unknown> | undefined): ConsentRecord | null {
  if (!row) return null;
  return { digest: String(row.digest), revision: Number(row.revision), version: Number(row.version),
    expiresAt: Number(row.expires_at), measurement: row.measurement === true,
    personalization: row.personalization === true };
}
const store: ConsentStore = {
  async read(digest) {
    const sql = getSql();
    const rows = await sql`SELECT digest, revision, version, expires_at, measurement, personalization
      FROM privacy_consent_receipts WHERE digest = ${digest} LIMIT 1`;
    return parseRecord(rows[0]);
  },
  async save(digest, choices, expiresAt, expectedRevision) {
    const sql = getSql();
    // Only an explicit preference submission can initialize this first-party table.
    await sql`CREATE TABLE IF NOT EXISTS privacy_consent_receipts (
      digest TEXT PRIMARY KEY, revision BIGINT NOT NULL DEFAULT 1,
      version INTEGER NOT NULL, expires_at BIGINT NOT NULL,
      measurement BOOLEAN NOT NULL DEFAULT FALSE, personalization BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
    const rows = await sql`INSERT INTO privacy_consent_receipts
      (digest, revision, version, expires_at, measurement, personalization)
      SELECT ${digest}, 1, ${PRIVACY_CONSENT_VERSION}, ${expiresAt}, ${choices.measurement}, ${choices.personalization}
      WHERE ${expectedRevision === undefined || expectedRevision === 0}
        OR EXISTS (SELECT 1 FROM privacy_consent_receipts WHERE digest = ${digest} AND revision = ${expectedRevision ?? 0})
      ON CONFLICT (digest) DO UPDATE SET revision = privacy_consent_receipts.revision + 1,
        version = EXCLUDED.version, expires_at = EXCLUDED.expires_at,
        measurement = EXCLUDED.measurement, personalization = EXCLUDED.personalization, updated_at = NOW()
      WHERE ${expectedRevision === undefined} OR privacy_consent_receipts.revision = ${expectedRevision ?? 0}
      RETURNING digest, revision, version, expires_at, measurement, personalization`;
    const record = parseRecord(rows[0]);
    return record;
  },
  async revoke(digest) {
    const sql = getSql();
    await sql`UPDATE privacy_consent_receipts SET measurement = FALSE, personalization = FALSE,
      revision = revision + 1, updated_at = NOW()
      WHERE digest = ${digest} AND (measurement = TRUE OR personalization = TRUE)`;
  },
};
export function privacyCapabilities() {
  return {
    // A new consent version and verified eligible events are required before enabling Meta.
    metaMeasurement: false, metaPersonalization: false,
    tiktokMeasurement: false, tiktokPersonalization: false,
    googleMeasurement: Boolean(readGoogleAdsConfig()), openaiMeasurement: readOpenAIAdsConfig().ok,
  };
}
export const privacyService = createPrivacyService({ store, capabilities: privacyCapabilities });
export function requestCookie(request: Request, name: string): string | undefined {
  const pair = request.headers.get("cookie")?.split(";").find((part) => part.trim().startsWith(`${name}=`));
  if (!pair) return undefined;
  try { return decodeURIComponent(pair.trim().slice(name.length + 1)); } catch { return undefined; }
}
export function requestPrivacyContext(request: Request) {
  return { gpc: request.headers.get("sec-gpc") === "1",
    admin: verifyAdminSessionToken(requestCookie(request, "psl_admin_session") ?? "") };
}
export function readRequestPrivacyConsent(request: Request) {
  return privacyService.read(requestCookie(request, PRIVACY_CONSENT_COOKIE), requestPrivacyContext(request));
}
export function isCurrentMeasurementConsent(binding: PrivacyConsentBinding | null | undefined,
  provider: "google" | "openai" | "meta" | "tiktok") {
  return privacyService.current(binding, provider);
}
