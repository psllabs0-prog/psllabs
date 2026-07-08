import { PRODUCT_VIAL_IMAGE } from "./images";

export type CatalogProduct = {
  handle: string;
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
    handle: "retatrutide",
    tag: "RESEARCH PEPTIDE",
    name: "Retatrutide",
    strength: "10mg",
    description:
      "Lyophilized research peptide for laboratory and in vitro use. Independent batch documentation available for selected lots.",
    price: 69.99,
    href: "/products/retatrutide",
    imageSrc: PRODUCT_VIAL_IMAGE.src,
    imageAlt: PRODUCT_VIAL_IMAGE.alt,
    purityBadge: "Batch-specific purity",
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
