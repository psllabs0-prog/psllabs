import { PRIORITY_BASE_SHIPPING_USD, PRIORITY_DISCOUNTED_SHIPPING_USD } from "@/lib/shipping/policy";

export type TagadaShippingRate = {
  id: string;
  name: string;
  amount: number;
  currency: string;
};

export type TagadaShippingBinding = { method: "standard" | "priority"; rateId?: string | null };

/** Server-side configuration; IDs are selected by service and exact customer-price tier. */
export function configuredTagadaShippingRateId(
  method: "standard" | "priority",
  shippingUsd: number,
  env: Record<string, string | undefined> = process.env,
): string | null {
  const cents = Math.round(shippingUsd * 100);
  const key = method === "standard"
    ? cents === 0 ? "TAGADA_SHIPPING_STANDARD_FREE_RATE_ID" : cents === 999 ? "TAGADA_SHIPPING_STANDARD_PAID_RATE_ID" : null
    : cents === Math.round(PRIORITY_BASE_SHIPPING_USD * 100) ? "TAGADA_SHIPPING_PRIORITY_2499_RATE_ID"
      : cents === Math.round(PRIORITY_DISCOUNTED_SHIPPING_USD * 100) ? "TAGADA_SHIPPING_PRIORITY_2299_RATE_ID" : null;
  const value = key ? env[key]?.trim() : null;
  return value && /^[A-Za-z0-9_-]{1,150}$/.test(value) ? value : null;
}

/** Exact USD amount plus a bound ID, or one unambiguous named Standard/Ground rate. */
export function pickTagadaShippingRate(
  rates: TagadaShippingRate[],
  expectedShippingUsd: number,
  binding: TagadaShippingBinding = { method: "standard" },
): TagadaShippingRate | null {
  if (!Number.isFinite(expectedShippingUsd) || expectedShippingUsd < 0) return null;
  if (binding.method !== "standard" && binding.method !== "priority") return null;
  const expectedCents = Math.round(expectedShippingUsd * 100);
  const exact = rates.filter(rate => rate.currency === "USD" && Number.isSafeInteger(rate.amount) &&
    rate.amount === expectedCents && typeof rate.id === "string" && rate.id.length > 0);
  if (binding.rateId) {
    // Provider labels can also be service codes such as GroundAdvantage or
    // PriorityMailExpress. Word boundaries do not separate their camelcase parts.
    const contradictsMethod = (name: string) => {
      const service = name.toLowerCase().replace(/[^a-z]/g, "");
      return binding.method === "priority" ? /ground|standard|express|overnight|nextday/.test(service)
        : /priority|express|expedited|overnight|nextday/.test(service);
    };
    const matches = exact.filter(rate => rate.id === binding.rateId && !contradictsMethod(rate.name));
    return matches.length === 1 ? matches[0] : null;
  }
  // Priority always requires an explicit server-configured tier ID. A same-price
  // Standard rate, a near-price rate or an ambiguous service cannot authorize it.
  if (binding.method !== "standard") return null;
  const matches = exact.filter(rate => !/priority|express|expedited/i.test(rate.name) &&
    (/\bground\s+advantage\b/i.test(rate.name) || /^(?:free\s+)?standard(?:\s+(?:u\.?s\.?|domestic))?(?:\s+(?:shipping|delivery))?$/i.test(rate.name.trim())));
  return matches.length === 1 ? matches[0] : null;
}
