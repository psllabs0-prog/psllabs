import { getActiveCatalogProducts } from "@/lib/products/catalog";

export type ReceiptProductDefinition = {
  sku: string;
  handle: string;
  name: string;
  listedForSale: boolean;
};

/** Private stock identity only. It has no public listing, price, checkout or COA. */
export const INTERNAL_BAC_WATER_10ML: ReceiptProductDefinition = {
  sku: "PSL-BW-10ML",
  handle: "bac-water-10ml",
  name: "Bacteriostatic Water · 10 mL (internal, not for sale)",
  listedForSale: false,
};

export function getReceiptProductDefinitions(): ReceiptProductDefinition[] {
  return [
    ...getActiveCatalogProducts().map(({ sku, handle, name }) => ({
      sku,
      handle,
      name,
      listedForSale: true,
    })),
    INTERNAL_BAC_WATER_10ML,
  ];
}
