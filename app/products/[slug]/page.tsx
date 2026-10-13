import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProductTemplate } from "@/components/product/product-template";
import { ResearchPeptideTemplate } from "@/components/product/research-peptide-template";
import { JsonLd } from "@/components/seo/json-ld";
import { createProductData } from "@/components/seo/product-data";
import { getProductAvailability } from "@/lib/inventory/availability";
import { getOtherProducts, getProduct } from "@/lib/products";
import {
  getCatalogProductByHandle,
  getActiveCatalogProducts,
} from "@/lib/products/catalog";
import { getPublicCatalogProduct } from "@/lib/products/public-catalog";
import { skuToSlug } from "@/lib/products/slug";
import { getProductRender } from "@/lib/products/renders";
import { createPageMetadata } from "@/lib/seo";
import { createBreadcrumbData } from "@/lib/structured-data";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return getActiveCatalogProducts().map((product) => ({ slug: skuToSlug(product.sku) }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const catalog = getPublicCatalogProduct(slug);
  if (!catalog) return { title: "Product not found", robots: { index: false, follow: false } };

  const product = getProduct(catalog.handle);
  if (!product) return { title: "Product not found", robots: { index: false, follow: false } };

  const strength = catalog.strength.replace(/(\d)(mg|ml)$/i, "$1 $2");
  const image = getProductRender(product.handle);
  return createPageMetadata({
    title: product.handle === "reconstitution-solution"
      ? `${product.name} ${strength} | Batch Report`
      : `${product.name} ${strength}: Research Material & COA`,
    description: product.handle === "reconstitution-solution"
      ? "Reconstitution Solution 5 ml for laboratory research. View the original Janoshik batch report and reported benzyl alcohol concentration. Not for human or animal use."
      : `${product.name} ${strength} for laboratory research. View the original Janoshik batch report, tested-sample purity and reported amount. Not for human or animal use.`,
    path: catalog.href,
    image: { url: image?.src ?? catalog.imageSrc, alt: image?.alt ?? catalog.imageAlt },
  });
}

export default async function ProductPage({ params }: PageProps) {
  const { slug } = await params;
  const catalogEntry = getPublicCatalogProduct(slug);

  if (!catalogEntry) {
    notFound();
  }

  const handle = catalogEntry.handle;
  const product = getProduct(handle);
  if (!product) {
    notFound();
  }

  const otherProducts = getOtherProducts(handle).filter(
    (other) => getCatalogProductByHandle(other.handle)?.status === "active"
  );
  const availability = await getProductAvailability(
    handle,
    product.stockStatus
  ).catch(() => ({
    handle,
    tracked: false,
    stock: 0,
    reserved: 0,
    available: product.stockStatus === "out_of_stock" ? 0 : 9999,
    status: product.stockStatus,
  }));

  const productLd = createProductData({ product, catalog: catalogEntry, availability });
  const breadcrumbLd = createBreadcrumbData([
    { name: "Home", path: "" },
    { name: "Products", path: "/products" },
    { name: `${product.name} ${catalogEntry.strength}`, path: catalogEntry.href },
  ]);

  const researchPeptideHandles = new Set([
    "retatrutide",
    "ghk-cu",
    "bpc-157",
    "tesamorelin",
    "reconstitution-solution",
  ]);

  if (researchPeptideHandles.has(handle)) {
    return (
      <>
        <JsonLd data={productLd} />
        <JsonLd data={breadcrumbLd} />
        <ResearchPeptideTemplate
          product={product}
          availability={availability}
        />
      </>
    );
  }

  return (
    <>
      <JsonLd data={productLd} />
      <JsonLd data={breadcrumbLd} />
      <ProductTemplate
        product={product}
        otherProducts={otherProducts}
        availability={availability}
      />
    </>
  );
}
