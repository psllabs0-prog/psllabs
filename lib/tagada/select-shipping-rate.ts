export type TagadaShippingRate = {
  id: string;
  name: string;
  amount: number;
  currency: string;
};

/** Pick the Tagada shipping rate closest to our computed order shipping (USD). */
export function pickTagadaShippingRate(
  rates: TagadaShippingRate[],
  expectedShippingUsd: number
): TagadaShippingRate | null {
  if (rates.length === 0) return null;

  const expectedCents = Math.round(expectedShippingUsd * 100);
  const exact = rates.find((rate) => rate.amount === expectedCents);
  if (exact) return exact;

  if (expectedCents === 0) {
    const free = rates.find((rate) => rate.amount === 0);
    if (free) return free;
  }

  return rates.reduce((best, rate) =>
    Math.abs(rate.amount - expectedCents) < Math.abs(best.amount - expectedCents)
      ? rate
      : best
  );
}
