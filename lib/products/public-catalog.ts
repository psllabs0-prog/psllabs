import {
  getCatalogProductByHandle,
  getCatalogProductBySlug,
  type CatalogProduct,
} from "./catalog";

/** Only released catalog products may have public purchase pages. */
export function getPublicCatalogProduct(slugOrHandle: string): CatalogProduct | undefined {
  const product =
    getCatalogProductBySlug(slugOrHandle) ??
    getCatalogProductByHandle(slugOrHandle);
  return product?.status === "active" ? product : undefined;
}
