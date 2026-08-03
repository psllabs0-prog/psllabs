import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProductTemplate } from "@/components/product/product-template";
import { ResearchPeptideTemplate } from "@/components/product/research-peptide-template";
import { JsonLd } from "@/components/seo/json-ld";
import { getProductAvailability } from "@/lib/inventory/availability";
import { getOtherProducts, getProduct, productHandles } from "@/lib/products";
import { getCatalogProductByHandle } from "@/lib/products/catalog";
import { PRODUCT_VIAL_IMAGE } from "@/lib/products/images";
import { createPageMetadata, SITE_URL } from "@/lib/seo";

type PageProps = {
  params: Promise<{ handle: string }>;
};

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return productHandles.map((handle) => ({ handle }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { handle } = await params;
  const product = getProduct(handle);
  if (!product) return { title: "Product not found" };

  return createPageMetadata({
    title: product.name,
    description: product.shortDescription,
    path: `/products/${handle}`,
  });
}

function priceValidUntilOneYear(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

export default async function ProductPage({ params }: PageProps) {
  const { handle } = await params;
  const product = getProduct(handle);

  if (!product) {
    notFound();
  }

  const otherProducts = getOtherProducts(handle);
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

  if (handle === "retatrutide") {
    const productLd = {
      "@context": "https://schema.org",
      "@type": "Product",
      name: "Retatrutide 10mg",
      sku: "PSL-RT-10MG",
      description:
        "Lyophilized research peptide for laboratory and in vitro use. Batch-verified with independent third-party Certificate of Analysis.",
      url: `${SITE_URL}/products/retatrutide`,
      image: `${SITE_URL}${PRODUCT_VIAL_IMAGE.src}`,
      brand: {
        "@type": "Brand",
        name: "PSL Labs",
      },
      offers: {
        "@type": "Offer",
        price: String(product.price),
        priceCurrency: "USD",
        availability: "https://schema.org/InStock",
        priceValidUntil: priceValidUntilOneYear(),
        url: `${SITE_URL}/products/retatrutide`,
      },
    };

    return (
      <>
        {/* Validate Product markup: https://search.google.com/test/rich-results */}
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
          url: `${SITE_URL}/products/${handle}`,
          image: `${SITE_URL}${product.imageSrc ?? PRODUCT_VIAL_IMAGE.src}`,
          brand: {
            "@type": "Brand",
            name: "PSL Labs",
          },
          offers: {
            "@type": "Offer",
            price: String(product.price),
            priceCurrency: "USD",
            availability: "https://schema.org/InStock",
            priceValidUntil: priceValidUntilOneYear(),
            url: `${SITE_URL}/products/${handle}`,
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
