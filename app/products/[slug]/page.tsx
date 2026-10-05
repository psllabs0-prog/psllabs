import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProductTemplate } from "@/components/product/product-template";
import { ResearchPeptideTemplate } from "@/components/product/research-peptide-template";
import { JsonLd } from "@/components/seo/json-ld";
import { getProductAvailability } from "@/lib/inventory/availability";
import { getOtherProducts, getProduct } from "@/lib/products";
import {
  getCatalogProductByHandle,
  getActiveCatalogProducts,
} from "@/lib/products/catalog";
import { getPublicCatalogProduct } from "@/lib/products/public-catalog";
import { skuToSlug } from "@/lib/products/slug";
import { PRODUCT_VIAL_IMAGE } from "@/lib/products/images";
import { createPageMetadata, SITE_URL } from "@/lib/seo";

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
  if (!product) return { title: "Product not found" };

  return createPageMetadata({
    title: product.name,
    description: product.shortDescription,
    path: catalog.href,
  });
}

function priceValidUntilOneYear(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

function schemaAvailability(
  status: "in_stock" | "low_stock" | "out_of_stock"
): string {
  return status === "out_of_stock"
    ? "https://schema.org/OutOfStock"
    : "https://schema.org/InStock";
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

  const productUrl = `${SITE_URL}${catalogEntry.href}`;

  const researchPeptideHandles = new Set([
    "retatrutide",
    "ghk-cu",
    "bpc-157",
    "tesamorelin",
    "reconstitution-solution",
  ]);

  if (researchPeptideHandles.has(handle)) {
    const catalog = getCatalogProductByHandle(handle);
    const productLd = {
      "@context": "https://schema.org",
      "@type": "Product",
      name: catalog
        ? `${product.name}${catalog.strength ? ` ${catalog.strength}` : ""}`
        : product.name,
      sku: catalog?.sku,
      description: product.shortDescription,
      url: productUrl,
      image: `${SITE_URL}${product.imageSrc ?? PRODUCT_VIAL_IMAGE.src}`,
      brand: {
        "@type": "Brand",
        name: "PSL Labs",
      },
      offers: {
        "@type": "Offer",
        price: String(product.price),
        priceCurrency: "USD",
        availability: schemaAvailability(availability.status),
        priceValidUntil: priceValidUntilOneYear(),
        url: productUrl,
      },
    };

    return (
      <>
        <JsonLd data={productLd} />
        <ResearchPeptideTemplate
          product={product}
          availability={availability}
        />
      </>
    );
  }

  const catalog = getCatalogProductByHandle(handle);
  const productLd =
    catalog?.status === "active"
      ? {
          "@context": "https://schema.org",
          "@type": "Product",
          name: `${product.name}${catalog.strength ? ` ${catalog.strength}` : ""}`,
          sku: catalog.sku,
          description: product.shortDescription,
          url: productUrl,
          image: `${SITE_URL}${product.imageSrc ?? PRODUCT_VIAL_IMAGE.src}`,
          brand: {
            "@type": "Brand",
            name: "PSL Labs",
          },
          offers: {
            "@type": "Offer",
            price: String(product.price),
            priceCurrency: "USD",
            availability: schemaAvailability(availability.status),
            priceValidUntil: priceValidUntilOneYear(),
            url: productUrl,
          },
        }
      : null;

  return (
    <>
      {productLd && <JsonLd data={productLd} />}
      <ProductTemplate
        product={product}
        otherProducts={otherProducts}
        availability={availability}
      />
    </>
  );
}
