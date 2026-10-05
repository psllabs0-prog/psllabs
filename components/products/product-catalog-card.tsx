import Link from "next/link";

import { ProductVialImage } from "@/components/product/product-vial-image";
import { StockStatusBadge } from "@/components/commerce/stock-status-badge";
import { PillButton } from "@/components/ui/pill-button";
import { formatPrice } from "@/lib/cart/format";
import type { ProductAvailability } from "@/lib/inventory/availability";
import type { CatalogProduct } from "@/lib/products/catalog";
import { cn } from "@/lib/utils";

type ProductCatalogCardProps = {
  product: CatalogProduct;
  availability?: ProductAvailability;
  className?: string;
};

export function ProductCatalogCard({
  product,
  availability,
  className,
}: ProductCatalogCardProps) {
  const comingSoon = product.status === "coming_soon";

  return (
    <article
      data-catalog-product={product.handle}
      className={cn(
        "public-section-card group flex h-full flex-col overflow-hidden",
        comingSoon ? "opacity-90" : "focus-within:border-accent/50 hover:border-accent/35 motion-safe:transition-[transform,border-color,box-shadow] motion-safe:duration-300 motion-safe:hover:-translate-y-1",
        className
      )}
    >
      {!comingSoon && (
        <Link href={product.href} aria-label={`View ${product.name}`} className="relative block border-b border-linen focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent">
          <ProductVialImage
            src={product.imageSrc}
            alt={product.imageAlt}
            context="card"
            bordered={false}
            rounded="none"
            className="aspect-[6/5] rounded-none"
          />
          <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-wrap items-start gap-2 p-4">
            <span className="badge-verified max-w-full whitespace-normal text-left backdrop-blur-sm">
              {product.purityBadge}
            </span>
            <span className="badge-accent max-w-full whitespace-normal text-left backdrop-blur-sm">
              Research Use Only
            </span>
          </div>
        </Link>
      )}

      <div className="flex flex-1 flex-col gap-5 p-6">
        {comingSoon && (
          <span className="badge-accent w-fit">Coming Soon</span>
        )}

        <div className="flex flex-col gap-2">
          {!comingSoon && (
            <p className="mono text-accent">{product.tag}</p>
          )}
          <h2 className="font-display text-2xl font-bold tracking-[-0.02em] text-ink">
            {product.name}
          </h2>
          <p className="font-mono text-sm text-ash">{product.strength}</p>
          <p className="text-sm leading-relaxed text-ash">
            {product.description}
          </p>
        </div>

        {comingSoon ? (
          <PillButton href="/#newsletter" className="mt-auto w-full">
            Notify Me
          </PillButton>
        ) : (
          <>
            <p className="mt-auto font-mono text-3xl font-medium tracking-tight text-ink">
              {formatPrice(product.price)}
            </p>
            {availability && (
              <StockStatusBadge
                status={availability.status}
                available={availability.available}
              />
            )}
            <PillButton href={product.href} variant="secondary" className="w-full border-border-strong bg-paper/60 group-hover:border-accent/40">
              View Details
            </PillButton>
          </>
        )}
      </div>
    </article>
  );
}
