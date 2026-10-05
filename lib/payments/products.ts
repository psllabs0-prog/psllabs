import {
  getActiveCatalogProducts,
  getCatalogProductByHandle,
} from "@/lib/products/catalog";

export type CheckoutProduct = {
  id: string;
  name: string;
  description: string;
  priceUsd: number;
};

function fromCatalogHandle(handle: string): CheckoutProduct | undefined {
  const catalog = getCatalogProductByHandle(handle);
  if (!catalog || catalog.status !== "active") return undefined;
  return {
    id: catalog.handle,
    name: catalog.name,
    description: catalog.description,
    priceUsd: catalog.price,
  };
}

export function getCheckoutProduct(
  productId: string
): CheckoutProduct | undefined {
  return fromCatalogHandle(productId);
}

export function getAllCheckoutProducts(): CheckoutProduct[] {
  return getActiveCatalogProducts().map((catalog) => ({
    id: catalog.handle,
    name: catalog.name,
    description: catalog.description,
    priceUsd: catalog.price,
  }));
}
