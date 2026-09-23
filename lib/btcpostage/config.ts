import type { BtcpostageAddress } from "./types";

const API_BASE = "https://btcpostage.com/api";

export function getBtcpostageApiBase(): string {
  return API_BASE;
}

export function isBtcpostageConfigured(): boolean {
  return Boolean(
    process.env.BTCPOSTAGE_API_KEY?.trim() &&
      process.env.BTCPOSTAGE_API_SECRET?.trim()
  );
}

/** Server-only credentials. Never pass to client responses. */
export function getBtcpostageCredentials(): { key: string; secret: string } {
  const key = process.env.BTCPOSTAGE_API_KEY?.trim() ?? "";
  const secret = process.env.BTCPOSTAGE_API_SECRET?.trim() ?? "";
  if (!key || !secret) {
    throw new Error("BTCPostage is not configured (API key/secret missing).");
  }
  return { key, secret };
}

/**
 * Test mode: only include test_mode=true for supported USPS purchases.
 * Does not treat labels as real customer shipments.
 */
export function isBtcpostageTestMode(): boolean {
  const raw = (process.env.BTCPOSTAGE_TEST_MODE ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

export function getBtcpostageFromAddress(): BtcpostageAddress {
  const street1 = process.env.BTCPOSTAGE_FROM_STREET?.trim() ?? "";
  const city = process.env.BTCPOSTAGE_FROM_CITY?.trim() ?? "";
  const state = process.env.BTCPOSTAGE_FROM_STATE?.trim() ?? "";
  const zip = process.env.BTCPOSTAGE_FROM_ZIP?.trim() ?? "";
  const country = (process.env.BTCPOSTAGE_FROM_COUNTRY?.trim() || "US").toUpperCase();
  const name = process.env.BTCPOSTAGE_FROM_NAME?.trim() ?? "";
  if (!street1 || !city || !state || !zip || !name) {
    throw new Error(
      "BTCPostage from-address env vars are incomplete (NAME/STREET/CITY/STATE/ZIP)."
    );
  }
  return {
    name,
    street1,
    street2: process.env.BTCPOSTAGE_FROM_STREET2?.trim() || "",
    city,
    state,
    zip,
    country,
    phone: process.env.BTCPOSTAGE_FROM_PHONE?.trim() || "",
  };
}

/** Public admin config — no secrets. */
export function getBtcpostagePublicConfig(): {
  configured: boolean;
  testMode: boolean;
} {
  return {
    configured: isBtcpostageConfigured(),
    testMode: isBtcpostageTestMode(),
  };
}
