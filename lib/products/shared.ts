import type { Product } from "./types";

export const defaultBullets = [
  "Independent batch documentation for published lots",
  "Laboratory reports published when available",
  "Research use only",
] as const;

export function getOtherProducts(
  handle: string,
  catalog: Record<string, Product>
): Product[] {
  return Object.values(catalog).filter((p) => p.handle !== handle);
}
