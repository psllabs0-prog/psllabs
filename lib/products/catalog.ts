import { PRODUCT_VIAL_IMAGE } from "./images";
import { retatrutideSource } from "./retatrutide-source";

export type CatalogProduct = {
  handle: string;
  sku: string;
  tag: string;
  name: string;
  strength: string;
  description: string;
  price: number;
  href: string;
  imageSrc: string;
  imageAlt: string;
  purityBadge: string;
};

export const catalogProducts: CatalogProduct[] = [
  {
    handle: retatrutideSource.handle,
    sku: retatrutideSource.sku,
    tag: retatrutideSource.tag,
    name: retatrutideSource.name,
    strength: retatrutideSource.nominalStrength,
    description: retatrutideSource.description,
    price: retatrutideSource.price,
    href: retatrutideSource.href,
    imageSrc: PRODUCT_VIAL_IMAGE.src,
    imageAlt: PRODUCT_VIAL_IMAGE.alt,
    purityBadge: retatrutideSource.purityBadge,
  },
];

export function getCatalogProducts(): CatalogProduct[] {
  return catalogProducts;
}

export function getCatalogProductByHandle(
  handle: string
): CatalogProduct | undefined {
  return catalogProducts.find((product) => product.handle === handle);
}
