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
    strength: "Lyophilized · quantity per COA",
    description:
      "Lyophilized research peptide for laboratory and in vitro use. Every batch is identity-verified by independent HPLC with a published Certificate of Analysis matched to your vial lot number.",
    price: 94,
    href: "/products/retatrutide",
    imageSrc: "/Retatrutide.png",
    imageAlt: "Retatrutide research peptide vial",
    purityBadge: "99%+ Purity",
  },
];

export function getCatalogProducts(): CatalogProduct[] {
  return catalogProducts;
}
