import { getProductImage } from "./images";
import { retatrutideSource } from "./retatrutide-source";
import { productPathFromSku, skuToSlug } from "./slug";

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

const retatrutideImage = getProductImage("retatrutide");
const ghkCuImage = getProductImage("ghk-cu");
const bpc157Image = getProductImage("bpc-157");
const motsCImage = getProductImage("mots-c");
const tesamorelinImage = getProductImage("tesamorelin");
const kpvImage = getProductImage("kpv");
const reconstitutionImage = getProductImage("reconstitution-solution");

export const catalogProducts: CatalogProduct[] = [
  {
    handle: retatrutideSource.handle,
    sku: retatrutideSource.sku,
    tag: retatrutideSource.tag,
    name: retatrutideSource.name,
    strength: retatrutideSource.nominalStrength,
    description: retatrutideSource.description,
    price: retatrutideSource.price,
    href: productPathFromSku(retatrutideSource.sku),
    imageSrc: retatrutideImage.src,
    imageAlt: retatrutideImage.alt,
    purityBadge: retatrutideSource.purityBadge,
    status: "active",
  },
  {
    handle: "ghk-cu",
    sku: "PSL-GHKCU-50MG",
    tag: "RESEARCH PEPTIDE",
    name: "GHK-Cu",
    strength: "50mg",
    description:
      "Copper peptide reference standard for laboratory research. HPLC-verified purity. Batch-specific documentation available for selected lots.",
    price: 24.99,
    href: productPathFromSku("PSL-GHKCU-50MG"),
    imageSrc: ghkCuImage.src,
    imageAlt: ghkCuImage.alt,
    purityBadge: "Batch-specific purity",
    status: "active",
  },
  {
    handle: "bpc-157",
    sku: "PSL-BPC157-10MG",
    tag: "RESEARCH PEPTIDE",
    name: "BPC-157",
    strength: "10mg",
    description:
      "Pentadecapeptide for angiogenic signaling research. Studied in rodent models of connective tissue repair.",
    price: 39.99,
    href: productPathFromSku("PSL-BPC157-10MG"),
    imageSrc: bpc157Image.src,
    imageAlt: bpc157Image.alt,
    purityBadge: "Coming soon",
    status: "coming_soon",
  },
  {
    handle: "mots-c",
    sku: "PSL-MOTSC-10MG",
    tag: "RESEARCH PEPTIDE",
    name: "MOTS-c",
    strength: "10mg",
    description:
      "Mitochondrial-derived peptide for metabolic pathway research. In vitro studies of glucose utilization and fatty acid oxidation.",
    price: 29.99,
    href: productPathFromSku("PSL-MOTSC-10MG"),
    imageSrc: motsCImage.src,
    imageAlt: motsCImage.alt,
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
      "Synthetic peptide reference standard for laboratory research. HPLC-verified purity. Batch-specific documentation available for selected lots.",
    price: 89.99,
    href: productPathFromSku("PSL-TESA-10MG"),
    imageSrc: tesamorelinImage.src,
    imageAlt: tesamorelinImage.alt,
    purityBadge: "Batch-specific purity",
    status: "active",
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
    href: productPathFromSku("PSL-KPV-10MG"),
    imageSrc: kpvImage.src,
    imageAlt: kpvImage.alt,
    purityBadge: "Coming soon",
    status: "coming_soon",
  },
  {
    handle: "reconstitution-solution",
    sku: "PSL-RS-5ML",
    tag: "LABORATORY REAGENT",
    name: "Reconstitution Solution",
    strength: "5ml",
    description:
      "Laboratory solution for preparing research compounds. Batch-specific documentation available for selected lots.",
    price: 12.99,
    href: productPathFromSku("PSL-RS-5ML"),
    imageSrc: reconstitutionImage.src,
    imageAlt: reconstitutionImage.alt,
    purityBadge: "Batch-specific documentation",
    status: "active",
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

export function getCatalogProductBySlug(
  slug: string
): CatalogProduct | undefined {
  const normalized = slug.trim().toLowerCase();
  return catalogProducts.find(
    (product) => skuToSlug(product.sku) === normalized
  );
}

export function getHandleFromSlug(slug: string): string | undefined {
  return getCatalogProductBySlug(slug)?.handle;
}

/** Product detail URL for a catalog handle (SKU-based when listed in catalog). */
export function productPathFromHandle(handle: string): string {
  const catalog = getCatalogProductByHandle(handle);
  if (catalog) return productPathFromSku(catalog.sku);
  return `/products/${handle}`;
}

export function catalogProductSlugs(): string[] {
  return catalogProducts.map((product) => skuToSlug(product.sku));
}
