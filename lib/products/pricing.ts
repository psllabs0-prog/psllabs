/** Authorized USD sale pricing. Only these released SKUs participate. */
export const PRODUCT_PRICING = {
  retatrutide: { compareAtPriceCents: 7499, salePriceCents: 5999 },
  "ghk-cu": { compareAtPriceCents: 3499, salePriceCents: 2499 },
  "bpc-157": { compareAtPriceCents: 5999, salePriceCents: 4799 },
  tesamorelin: { compareAtPriceCents: 8999, salePriceCents: 6999 },
  "reconstitution-solution": { compareAtPriceCents: 1799, salePriceCents: 1199 },
} as const;

export type SaleProductHandle = keyof typeof PRODUCT_PRICING;

export function getProductPricing(handle: string) {
  if (!Object.prototype.hasOwnProperty.call(PRODUCT_PRICING, handle)) return null;
  const price = PRODUCT_PRICING[handle as SaleProductHandle];
  return { ...price, savingsCents: price.compareAtPriceCents - price.salePriceCents };
}

/** Dollars at the existing catalog/checkout interfaces; cents remain the source. */
export function getSalePriceUsd(handle: SaleProductHandle): number {
  return PRODUCT_PRICING[handle].salePriceCents / 100;
}
