"use client";

import { AddToCartButton } from "@/components/commerce/AddToCartButton";
import type { StockStatus } from "@/lib/products/stock";
import { cn } from "@/lib/utils";

import { useProductQuantity } from "./product-quantity-provider";

type MobileStickyCartProps = {
  productHandle: string;
  productName: string;
  stockStatus: StockStatus;
};

export function MobileStickyCart({
  productHandle,
  productName,
  stockStatus,
}: MobileStickyCartProps) {
  const { quantity, totalPrice } = useProductQuantity();
  const isOutOfStock = stockStatus === "out_of_stock";

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-linen bg-lab-white px-6 py-4 lg:hidden">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-sm text-ash">{productName}</p>
          <p className="font-display text-xl font-bold text-ink">${totalPrice}</p>
        </div>
        <AddToCartButton
          productId={productHandle}
          quantity={quantity}
          variant="compact"
          disabled={isOutOfStock}
          className={cn(isOutOfStock && "opacity-60")}
        >
          {isOutOfStock ? "Out of Stock" : "Pay with Bitcoin"}
        </AddToCartButton>
      </div>
    </div>
  );
}
