"use client";

import { AddToCartButton } from "@/components/commerce/AddToCartButton";
import { formatPrice } from "@/lib/cart/format";
import type { ProductAvailability } from "@/lib/inventory/availability";
import type { StockStatus } from "@/lib/products/stock";
import { cn } from "@/lib/utils";

import { useProductQuantity } from "./product-quantity-provider";

type MobileStickyCartProps = {
  productHandle: string;
  productName: string;
  stockStatus: StockStatus;
  availability?: ProductAvailability;
};

export function MobileStickyCart({
  productHandle,
  productName,
  stockStatus,
  availability,
}: MobileStickyCartProps) {
  const { quantity, totalPrice } = useProductQuantity();
  const maxAvailable = availability?.tracked ? availability.available : undefined;
  const isOutOfStock =
    stockStatus === "out_of_stock" || (maxAvailable !== undefined && maxAvailable <= 0);

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-linen bg-surface px-6 py-4 lg:hidden">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-sm text-ash">{productName}</p>
          <p className="font-mono text-xl font-medium text-ink">
            {formatPrice(totalPrice)}
          </p>
        </div>
        <AddToCartButton
          productId={productHandle}
          quantity={quantity}
          maxAvailable={maxAvailable}
          variant="compact"
          disabled={isOutOfStock}
          className={cn(isOutOfStock && "opacity-60")}
        >
          {isOutOfStock ? "Out of Stock" : "Add to Cart"}
        </AddToCartButton>
      </div>
    </div>
  );
}
