import Link from "next/link";
import { CheckCircle2, FileText } from "lucide-react";

import { ProductVialImage } from "@/components/product/product-vial-image";
import { StockStatusBadge } from "@/components/commerce/stock-status-badge";
import { PillButton } from "@/components/ui/pill-button";
import { formatPrice } from "@/lib/cart/format";
import { hasAvailableReport } from "@/lib/batch-reports";
import type { ProductAvailability } from "@/lib/inventory/availability";
import type { CatalogProduct } from "@/lib/products/catalog";

type AvailableMaterialsSectionProps = {
  products: CatalogProduct[];
  availabilityMap: Map<string, ProductAvailability>;
};

export function AvailableMaterialsSection({
  products,
  availabilityMap,
}: AvailableMaterialsSectionProps) {
  return (
    <section className="border-t border-linen bg-paper px-6 py-14 md:px-16 md:py-20 lg:px-24">
      <div className="mx-auto max-w-[1440px]">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="flex max-w-2xl flex-col gap-2">
            <p className="mono text-accent">ACTIVE CATALOG</p>
            <h2 className="font-display text-2xl font-bold tracking-[-0.02em] text-ink md:text-3xl">
              Available Research Materials
            </h2>
            <p className="text-sm leading-relaxed text-ash md:text-base">
              Materials currently available for laboratory research. Each active lot has a published third-party lab report.
            </p>
          </div>
          <Link
            href="/products"
            className="mono text-xs font-medium text-accent underline underline-offset-4 hover:opacity-80 md:text-sm shrink-0"
          >
            View Full Catalog →
          </Link>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 lg:gap-8">
          {products.map((product) => {
            const availability = availabilityMap.get(product.handle);
            const isDocPublished = hasAvailableReport(product.handle);

            return (
              <article
                key={product.handle}
                className="premium-card flex flex-col overflow-hidden transition-all duration-200 hover:border-linen-dark"
              >
                <div className="relative border-b border-linen bg-surface">
                  <ProductVialImage
                    src={product.imageSrc}
                    alt={product.imageAlt}
                    context="card"
                    bordered={false}
                    rounded="none"
                    className="rounded-none aspect-square object-contain"
                  />
                  <div className="pointer-events-none absolute right-3 top-3 z-10">
                    <span className="badge-accent backdrop-blur-sm">
                      Research Use Only
                    </span>
                  </div>
                </div>

                <div className="flex flex-1 flex-col justify-between p-6">
                  <div className="flex flex-col gap-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="font-display text-xl font-bold text-ink">
                        {product.name}
                      </h3>
                      <span className="font-mono text-sm font-medium text-ash shrink-0">
                        {product.strength}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {availability && (
                        <StockStatusBadge
                          status={availability.status}
                          available={availability.available}
                        />
                      )}
                      <span className="inline-flex items-center gap-1 rounded-full border border-border-strong bg-paper px-2.5 py-0.5 font-mono text-[0.7rem] text-ink">
                        {isDocPublished ? (
                          <>
                            <CheckCircle2 className="size-3 text-verified-green" aria-hidden />
                            <span>COA Published</span>
                          </>
                        ) : (
                          <>
                            <FileText className="size-3 text-ash" aria-hidden />
                            <span>Pending COA</span>
                          </>
                        )}
                      </span>
                    </div>
                  </div>

                  <div className="mt-6 flex flex-col gap-4 border-t border-linen pt-4">
                    <div className="flex items-baseline justify-between">
                      <span className="mono text-xs text-ash">Price</span>
                      <span className="font-mono text-2xl font-bold text-ink">
                        {formatPrice(product.price)}
                      </span>
                    </div>

                    <PillButton
                      href={product.href}
                      variant="primary"
                      className="w-full text-center"
                    >
                      View Details
                    </PillButton>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
