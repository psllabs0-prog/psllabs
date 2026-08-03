import { PRODUCT_VIAL_IMAGE } from "./images";
import { retatrutideSource } from "./retatrutide-source";

export type CatalogProductStatus = "active" | "coming_soon";

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
  status: CatalogProductStatus;
};

const PLACEHOLDER_IMAGE = {
  src: PRODUCT_VIAL_IMAGE.src,
  alt: "Research peptide vial",
} as const;

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
    status: "active",
  },
  {
    handle: "reconstitution-solution",
    sku: "PSL-RS-30ML",
    tag: "LABORATORY REAGENT",
    name: "Reconstitution Solution",
    strength: "30mL",
    description:
      "Sterile bacteriostatic water for reconstituting lyophilized research peptides in the laboratory.",
    price: 14.99,
    href: "/products/reconstitution-solution",
    imageSrc: PLACEHOLDER_IMAGE.src,
    imageAlt: "Reconstitution solution vial",
    purityBadge: "Laboratory use",
    status: "active",
  },
  {
    handle: "ghk-cu",
    sku: "PSL-GHK-50MG",
    tag: "RESEARCH PEPTIDE",
    name: "GHK-Cu",
    strength: "50mg",
    description: "Copper peptide for tissue remodeling research.",
    price: 19.99,
    href: "/products#coming-soon",
    imageSrc: PLACEHOLDER_IMAGE.src,
    imageAlt: "GHK-Cu research peptide",
    purityBadge: "Coming soon",
    status: "coming_soon",
  },
  {
    handle: "bpc-157",
    sku: "PSL-BPC-10MG",
    tag: "RESEARCH PEPTIDE",
    name: "BPC-157",
    strength: "10mg",
    description:
      "Pentadecapeptide for connective tissue and wound healing research.",
    price: 39.99,
    href: "/products#coming-soon",
    imageSrc: PLACEHOLDER_IMAGE.src,
    imageAlt: "BPC-157 research peptide",
    purityBadge: "Coming soon",
    status: "coming_soon",
  },
  {
    handle: "mots-c",
    sku: "PSL-MOTS-10MG",
    tag: "RESEARCH PEPTIDE",
    name: "MOTS-c",
    strength: "10mg",
    description:
      "Mitochondrial-derived peptide for metabolic function research.",
    price: 29.99,
    href: "/products#coming-soon",
    imageSrc: PLACEHOLDER_IMAGE.src,
    imageAlt: "MOTS-c research peptide",
    purityBadge: "Coming soon",
    status: "coming_soon",
  },
  {
    handle: "tesamorelin",
    sku: "PSL-TESA-10MG",
    tag: "RESEARCH PEPTIDE",
    name: "Tesamorelin",
    strength: "10mg",
    description:
      "Growth hormone-releasing hormone analog for metabolic research.",
    price: 99.99,
    href: "/products#coming-soon",
    imageSrc: PLACEHOLDER_IMAGE.src,
    imageAlt: "Tesamorelin research peptide",
    purityBadge: "Coming soon",
    status: "coming_soon",
  },
  {
    handle: "kpv",
    sku: "PSL-KPV-10MG",
    tag: "RESEARCH PEPTIDE",
    name: "KPV",
    strength: "10mg",
    description: "Tripeptide for inflammatory pathway research.",
    price: 29.99,
    href: "/products#coming-soon",
    imageSrc: PLACEHOLDER_IMAGE.src,
    imageAlt: "KPV research peptide",
    purityBadge: "Coming soon",
    status: "coming_soon",
  },
];

export function getCatalogProducts(): CatalogProduct[] {
  return catalogProducts;
}

export function getActiveCatalogProducts(): CatalogProduct[] {
  return catalogProducts.filter((p) => p.status === "active");
}

export function getComingSoonCatalogProducts(): CatalogProduct[] {
  return catalogProducts.filter((p) => p.status === "coming_soon");
}

export function getCatalogProductByHandle(
  handle: string
): CatalogProduct | undefined {
  return catalogProducts.find((product) => product.handle === handle);
}
