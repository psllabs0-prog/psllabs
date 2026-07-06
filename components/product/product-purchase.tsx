"use client";

import { Check } from "lucide-react";

import { AddToCartButton } from "@/components/commerce/AddToCartButton";
import { StockStatusBadge } from "@/components/commerce/stock-status-badge";
import { formatPrice } from "@/lib/cart/format";
import type { StockStatus } from "@/lib/products/stock";
import { cn } from "@/lib/utils";

import { useProductQuantity } from "./product-quantity-provider";

type ProductPurchaseProps = {
  productHandle: string;
  stockStatus: StockStatus;
  className?: string;
};

const purchaseTrustItems = ["Third-Party Tested", "COA Pending"] as const;

export function ProductPurchase({
  productHandle,
  stockStatus,
  className,
}: ProductPurchaseProps) {
  const { quantity, setQuantity, unitPrice, totalPrice } = useProductQuantity();
  const isOutOfStock = stockStatus === "out_of_stock";

  return (
    <div
      className={cn(
        "flex flex-col gap-8 rounded-2xl border border-linen bg-lab-white p-6 shadow-[0_2px_16px_rgba(26,77,109,0.06)] md:p-8",
        className
      )}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline gap-3">
          <span className="font-display text-4xl font-bold tracking-[-0.02em] text-ink">
            {formatPrice(totalPrice)}
          </span>
          {quantity > 1 && (
            <span className="text-sm text-ash">{formatPrice(unitPrice)} each</span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <span className="mono text-ash">Quantity</span>
        <div className="inline-flex w-fit items-center border border-linen">
          <button
            type="button"
            onClick={() => setQuantity(Math.max(1, quantity - 1))}
            disabled={isOutOfStock}
            className="px-4 py-2 text-lg transition-opacity duration-200 ease-out hover:opacity-70 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Decrease quantity"
          >
            −
          </button>
          <span className="min-w-12 border-x border-linen px-4 py-2 text-center font-[family-name:var(--font-mono)]">
            {quantity}
          </span>
          <button
            type="button"
            onClick={() => setQuantity(quantity + 1)}
            disabled={isOutOfStock}
            className="px-4 py-2 text-lg transition-opacity duration-200 ease-out hover:opacity-70 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Increase quantity"
          >
            +
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-5 border-t border-linen pt-6">
        <StockStatusBadge status={stockStatus} />

        <AddToCartButton
          productId={productHandle}
          quantity={quantity}
          disabled={isOutOfStock}
          className={cn(isOutOfStock && "opacity-60")}
        >
          {isOutOfStock ? "Out of Stock" : "Add to Cart"}
        </AddToCartButton>

        <p className="text-xs leading-relaxed text-ash">
          Items are saved to your cart for review at checkout.
        </p>

        <ul className="flex flex-col gap-2.5">
          {purchaseTrustItems.map((item) => (
            <li
              key={item}
              className="flex items-center gap-2 text-sm text-ink"
            >
              <Check
                className="size-3.5 shrink-0 text-biotech-deep"
                strokeWidth={2.5}
                aria-hidden
              />
              {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
