"use client";

import Link from "next/link";
import { Download } from "lucide-react";

import { ProductVialImage } from "@/components/product/product-vial-image";
import { PillButton } from "@/components/ui/pill-button";
import type { CatalogProduct } from "@/lib/products/catalog";
import { cn } from "@/lib/utils";

type ProductCatalogCardProps = {
  product: CatalogProduct;
  className?: string;
};

export function ProductCatalogCard({ product, className }: ProductCatalogCardProps) {
  const handleCoaDownload = () => {
    // TODO: Link to batch-specific COA PDF or /testing page anchor.
    console.log("COA download requested for:", product.handle);
  };

  return (
    <article
      className={cn(
        "overflow-hidden rounded-2xl border border-linen bg-lab-white shadow-[0_4px_24px_rgba(26,77,109,0.07),0_24px_64px_rgba(26,77,109,0.06)]",
        className
      )}
    >
      <div className="grid grid-cols-1 lg:grid-cols-2">
        {/* Image stage */}
        <div className="relative flex items-center justify-center p-6 md:p-8 lg:p-10">
          <span className="absolute left-6 top-6 z-20 rounded-pill border border-biotech-blue/20 bg-lab-white/90 px-4 py-1.5 font-[family-name:var(--font-mono)] text-[0.65rem] uppercase tracking-[0.1em] text-biotech-deep backdrop-blur-sm md:left-10 md:top-10">
            {product.purityBadge}
          </span>
          <span className="absolute right-6 top-6 z-20 rounded-md border border-linen bg-lab-white/80 px-3 py-1 font-[family-name:var(--font-mono)] text-[0.65rem] uppercase tracking-wider text-ash backdrop-blur-sm md:right-10 md:top-10">
            RUO
          </span>
          <ProductVialImage
            src={product.imageSrc}
            alt={product.imageAlt}
            size="lg"
            bordered={false}
            rounded="none"
            className="min-h-[420px] w-full rounded-none rounded-t-2xl md:min-h-[520px] lg:rounded-none lg:rounded-l-2xl lg:rounded-tr-none"
          />
        </div>

        {/* Details */}
        <div className="flex flex-col gap-10 p-8 md:gap-12 md:p-12 lg:p-14 xl:p-16">
          <div className="flex flex-col gap-5">
            <p className="mono text-biotech-deep/80">{product.tag}</p>
            <h2 className="font-display text-display-md font-bold text-ink">
              {product.name}
            </h2>
            <p className="text-body-lg leading-relaxed text-ash">
              {product.description}
            </p>
          </div>

          <div className="flex flex-col gap-4">
            <p className="mono text-ash">Specifications</p>
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-x-8 sm:gap-y-4">
              {product.specifications.map((spec) => (
                <div
                  key={spec.label}
                  className="flex flex-col gap-1 border-b border-biotech-pale/80 pb-3"
                >
                  <dt className="font-[family-name:var(--font-mono)] text-[0.65rem] uppercase tracking-wider text-ash">
                    {spec.label}
                  </dt>
                  <dd className="text-sm font-medium text-ink md:text-base">
                    {spec.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="flex flex-col gap-3 rounded-lg border border-biotech-pale bg-biotech-mist/40 p-5">
            <p className="mono text-biotech-deep/80">Testing &amp; quality</p>
            <p className="text-sm leading-relaxed text-ash md:text-base">
              {product.testingSummary}
            </p>
          </div>

          <div className="mt-auto flex flex-col gap-6 border-t border-linen pt-8">
            <p className="font-display text-4xl font-bold tracking-[-0.02em] text-ink">
              ${product.price}
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <PillButton href={product.href} className="w-full sm:w-auto">
                View product
              </PillButton>
              <button
                type="button"
                onClick={handleCoaDownload}
                className="inline-flex w-full items-center justify-center gap-2 rounded-pill border border-biotech-blue/30 bg-lab-white px-6 py-3.5 text-sm font-medium text-biotech-deep transition-opacity duration-200 ease-out hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-petrol sm:w-auto"
              >
                <Download className="size-4" strokeWidth={1.25} aria-hidden />
                Download COA
              </button>
              <Link
                href="/testing"
                className="text-center text-sm text-petrol underline underline-offset-4 transition-opacity duration-200 ease-out hover:opacity-70 sm:ml-2"
              >
                Testing standards
              </Link>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
