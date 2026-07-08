import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProductTemplate } from "@/components/product/product-template";
import { ResearchPeptideTemplate } from "@/components/product/research-peptide-template";
import { getProductAvailability } from "@/lib/inventory/availability";
import { getOtherProducts, getProduct, productHandles } from "@/lib/products";
import { createPageMetadata } from "@/lib/seo";

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

export default async function ProductPage({ params }: PageProps) {
  const { handle } = await params;
  const product = getProduct(handle);

  if (!product) {
    notFound();
  }

  const otherProducts = getOtherProducts(handle);
  let availability = await getProductAvailability(handle, product.stockStatus).catch(
    () => ({
      handle,
      tracked: false,
      stock: 0,
      reserved: 0,
      available: product.stockStatus === "out_of_stock" ? 0 : 9999,
      status: product.stockStatus,
    })
  );

  if (handle === "retatrutide") {
    return (
      <ResearchPeptideTemplate product={product} availability={availability} />
    );
  }

  return (
    <ProductTemplate
      product={product}
      otherProducts={otherProducts}
      availability={availability}
    />
  );
}
