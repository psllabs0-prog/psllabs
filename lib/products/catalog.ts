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
    handle: "ghk-cu",
    sku: "PSL-GHK-50MG",
    tag: "RESEARCH PEPTIDE",
    name: "GHK-Cu",
    strength: "50mg",
    description:
      "Copper peptide for extracellular matrix research. In vitro applications in dermal fibroblast studies.",
    price: 19.99,
    href: "/products#coming-soon",
    imageSrc: PRODUCT_VIAL_IMAGE.src,
    imageAlt: "Vial of lyophilized GHK-Cu powder",
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
      "Pentadecapeptide for angiogenic signaling research. Studied in rodent models of connective tissue repair.",
    price: 39.99,
    href: "/products#coming-soon",
    imageSrc: PRODUCT_VIAL_IMAGE.src,
    imageAlt: "Vial of lyophilized BPC-157 powder",
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
      "Mitochondrial-derived peptide for metabolic pathway research. In vitro studies of glucose utilization and fatty acid oxidation.",
    price: 29.99,
    href: "/products#coming-soon",
    imageSrc: PRODUCT_VIAL_IMAGE.src,
    imageAlt: "Vial of lyophilized MOTS-c powder",
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
      "Growth hormone secretagogue receptor agonist for metabolic research. In vitro and animal model applications.",
    price: 99.99,
    href: "/products#coming-soon",
    imageSrc: PRODUCT_VIAL_IMAGE.src,
    imageAlt: "Vial of lyophilized Tesamorelin powder",
    purityBadge: "Coming soon",
    status: "coming_soon",
  },
  {
    handle: "kpv",
    sku: "PSL-KPV-10MG",
    tag: "RESEARCH PEPTIDE",
    name: "KPV",
    strength: "10mg",
    description:
      "Tripeptide for inflammatory signaling pathway research. In vitro applications.",
    price: 29.99,
    href: "/products#coming-soon",
    imageSrc: PRODUCT_VIAL_IMAGE.src,
    imageAlt: "Vial of lyophilized KPV powder",
    purityBadge: "Coming soon",
    status: "coming_soon",
  },
  {
    handle: "reconstitution-solution",
    sku: "PSL-RS-10ML",
    tag: "LABORATORY REAGENT",
    name: "Reconstitution Solution",
    strength: "10ml",
    description:
      "A sterile solution used to prepare research compounds.",
    price: 14.99,
    href: "/products#coming-soon",
    imageSrc: PRODUCT_VIAL_IMAGE.src,
    imageAlt: "Bottle of sterile reconstitution solution",
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
