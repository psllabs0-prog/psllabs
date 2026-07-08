import type { Product } from "./types";

export const defaultBullets = [
  "Independent third-party testing",
  "Independent batch documentation for selected lots",
  "Research use only",
] as const;

export function getOtherProducts(handle: string, catalog: Record<string, Product>): Product[] {
  return Object.values(catalog).filter((p) => p.handle !== handle);
}
