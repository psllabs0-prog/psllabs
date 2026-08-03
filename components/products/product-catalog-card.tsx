import { ProductVialImage } from "@/components/product/product-vial-image";
import { PillButton } from "@/components/ui/pill-button";
import { formatPrice } from "@/lib/cart/format";
import type { CatalogProduct } from "@/lib/products/catalog";
import { cn } from "@/lib/utils";

type ProductCatalogCardProps = {
  product: CatalogProduct;
  className?: string;
};

export function ProductCatalogCard({
  product,
  className,
}: ProductCatalogCardProps) {
  const comingSoon = product.status === "coming_soon";

  return (
    <article
      className={cn(
        "premium-card flex flex-col overflow-hidden",
        comingSoon
          ? "opacity-90 ring-1 ring-linen"
          : "premium-card-hover",
        className
      )}
    >
      <div className={cn("relative", comingSoon && "grayscale-[0.35]")}>
        <ProductVialImage
          src={product.imageSrc}
          alt={product.imageAlt}
          context="card"
          bordered={false}
          rounded="none"
          className="rounded-none"
        />
        {comingSoon ? (
          <span className="badge-accent absolute left-4 top-4 z-20 backdrop-blur-sm">
            Coming Soon
          </span>
        ) : (
          <span className="badge-verified absolute left-4 top-4 z-20 backdrop-blur-sm">
            {product.purityBadge}
          </span>
        )}
        <span className="badge-accent absolute right-4 top-4 z-20 backdrop-blur-sm">
          Research Use Only
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-5 p-6 md:p-8">
        <div className="flex flex-col gap-2">
          <p className="mono text-biotech-deep/80">{product.tag}</p>
          <h2 className="font-display text-2xl font-bold tracking-[-0.02em] text-ink">
            {product.name}
          </h2>
          <p className="text-sm text-ash">{product.strength}</p>
          <p className="text-sm leading-relaxed text-ash">
            {product.description}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="rounded-pill border border-biotech-pale bg-biotech-mist/50 px-3 py-1 font-[family-name:var(--font-mono)] text-[0.65rem] uppercase tracking-wider text-biotech-deep">
            {comingSoon ? "Coming Soon" : product.purityBadge}
          </span>
          <span className="rounded-pill border border-linen bg-paper/60 px-3 py-1 font-[family-name:var(--font-mono)] text-[0.65rem] uppercase tracking-wider text-ash">
            Research Use Only
          </span>
        </div>

        {comingSoon ? (
          <>
            <p className="mt-auto font-display text-2xl font-bold tracking-[-0.02em] text-ash">
              Coming Soon
            </p>
            <PillButton href="/#newsletter" className="w-full">
              Notify Me
            </PillButton>
          </>
        ) : (
          <>
            <p className="mt-auto font-display text-3xl font-bold tracking-[-0.02em] text-ink">
              {formatPrice(product.price)}
            </p>
            <PillButton href={product.href} className="w-full">
              View Details
            </PillButton>
          </>
        )}
      </div>
    </article>
  );
}
