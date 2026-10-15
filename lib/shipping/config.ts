import { isPriorityServiceCode, PRIORITY_MAX_UNITS, PRIORITY_ORIGIN_ZIP } from "./policy";
import { configuredTagadaShippingRateId } from "@/lib/tagada/select-shipping-rate";

export type PriorityShippingConfig = {
  maxUnits: number;
  serviceCode: string;
  extraCostReserveUsd: number;
  signingSecret: string;
};

/** Every prerequisite is explicit. An enabled flag alone cannot expose an unverified offer. */
export function getPriorityShippingConfig(env: Record<string, string | undefined> = process.env): PriorityShippingConfig | null {
  if (!["1", "true"].includes(env.PSL_PRIORITY_SHIPPING_ENABLED?.trim().toLowerCase() ?? "") ||
      env.PSL_VISUAL_PREVIEW === "1" || ["1", "true", "yes"].includes(env.BTCPOSTAGE_TEST_MODE?.trim().toLowerCase() ?? "")) return null;
  const maxUnits = Number(env.PSL_PRIORITY_MAX_UNITS);
  const serviceCode = env.PSL_PRIORITY_BTCP_SERVICE_CODE?.trim() ?? "";
  const reserveRaw = env.PSL_PRIORITY_EXTRA_COST_RESERVE_USD?.trim() ?? "";
  const extraCostReserveUsd = Number(reserveRaw);
  const signingSecret = env.PSL_SHIPPING_QUOTE_SECRET?.trim() || env.BTCPOSTAGE_API_SECRET?.trim() || "";
  if (!Number.isSafeInteger(maxUnits) || maxUnits < 1 || maxUnits > PRIORITY_MAX_UNITS || !isPriorityServiceCode(serviceCode) ||
      !reserveRaw || !/^\d+(?:\.\d{1,5})?$/.test(reserveRaw) || !Number.isFinite(extraCostReserveUsd) || extraCostReserveUsd < 0 || extraCostReserveUsd > 100 ||
      signingSecret.length < 32 || env.BTCPOSTAGE_FROM_ZIP?.trim().slice(0, 5) !== PRIORITY_ORIGIN_ZIP ||
      (env.BTCPOSTAGE_FROM_COUNTRY?.trim().toUpperCase() || "US") !== "US" ||
      !env.BTCPOSTAGE_API_KEY?.trim() || !env.BTCPOSTAGE_API_SECRET?.trim()) return null;
  return { maxUnits, serviceCode, extraCostReserveUsd, signingSecret };
}

export function priorityCardRateConfigured(priceUsd: number, env: Record<string, string | undefined> = process.env): boolean {
  return configuredTagadaShippingRateId("priority", priceUsd, env) !== null;
}
