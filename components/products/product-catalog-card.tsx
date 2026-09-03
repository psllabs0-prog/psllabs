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
      className={cn(
        "premium-card flex flex-col overflow-hidden",
        comingSoon ? "opacity-90 ring-1 ring-linen" : "premium-card-hover",
        className
      )}
    >
      {!comingSoon && (
        <div className="relative">
          <ProductVialImage
            src={product.imageSrc}
            alt={product.imageAlt}
            context="card"
            bordered={false}
            rounded="none"
            className="rounded-none"
          />
          <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-wrap items-start gap-2 p-4">
            <span className="badge-verified max-w-full whitespace-normal text-left backdrop-blur-sm">
              {product.purityBadge}
            </span>
            <span className="badge-accent max-w-full whitespace-normal text-left backdrop-blur-sm">
              Research Use Only
            </span>
          </div>
        </div>
      )}

      <div className="flex flex-1 flex-col gap-5 p-6 md:p-8">
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
            <div className="flex flex-wrap gap-2">
              <span className="rounded-pill border border-border-strong bg-paper px-3 py-1 font-mono text-[0.65rem] uppercase tracking-wider text-accent">
                {product.purityBadge}
              </span>
              <span className="rounded-pill border border-linen bg-paper px-3 py-1 font-mono text-[0.65rem] uppercase tracking-wider text-ash">
                Research Use Only
              </span>
            </div>
            <p className="mt-auto font-mono text-3xl font-medium tracking-tight text-ink">
              {formatPrice(product.price)}
            </p>
            {availability && (
              <StockStatusBadge
                status={availability.status}
                available={availability.available}
              />
            )}
            <PillButton href={product.href} className="w-full">
              View Details
            </PillButton>
          </>
        )}
      </div>
    </article>
  );
}
