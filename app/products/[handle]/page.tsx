import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProductTemplate } from "@/components/product/product-template";
import { ResearchPeptideTemplate } from "@/components/product/research-peptide-template";
import { getOtherProducts, getProduct, productHandles } from "@/lib/products";
import { createPageMetadata } from "@/lib/seo";

type PageProps = {
  params: Promise<{ handle: string }>;
};

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

  if (handle === "glp-3-rt") {
    return (
      <ResearchPeptideTemplate product={product} otherProducts={otherProducts} />
    );
  }

  return <ProductTemplate product={product} otherProducts={otherProducts} />;
}
