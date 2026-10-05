"use client";

import Link from "next/link";

import { AddToCartButton } from "@/components/commerce/AddToCartButton";
import { StockStatusBadge } from "@/components/commerce/stock-status-badge";
import { FLAT_SHIPPING_USD, FREE_SHIPPING_THRESHOLD } from "@/lib/cart/constants";
import { formatPrice } from "@/lib/cart/format";
import type { ProductAvailability } from "@/lib/inventory/availability";
import type { StockStatus } from "@/lib/products/stock";
import { cn } from "@/lib/utils";

import { useProductQuantity } from "./product-quantity-provider";

type ProductPurchaseProps = {
  productHandle: string;
  stockStatus: StockStatus;
  availability?: ProductAvailability;
  className?: string;
};

const MAX_QUANTITY = 10;

export function ProductPurchase({ productHandle, stockStatus, availability, className }: ProductPurchaseProps) {
  const { quantity, setQuantity, unitPrice, totalPrice } = useProductQuantity();
  const status = availability?.status ?? stockStatus;
  const available = availability?.available;
  const maxQuantity = available !== undefined
    ? Math.min(MAX_QUANTITY, Math.max(0, available))
    : MAX_QUANTITY;
  const isOutOfStock = status === "out_of_stock" || maxQuantity <= 0;

  return (
    <div className={cn("flex flex-col gap-5 rounded-2xl border border-border-strong bg-surface p-5 sm:p-6", className)}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-xs text-ash">{quantity > 1 ? `${quantity} vials` : "Price per vial"}</p>
          <span className="font-mono text-3xl font-medium tracking-tight text-ink sm:text-4xl">{formatPrice(totalPrice)}</span>
          {quantity > 1 && <span className="mt-1 block font-mono text-xs text-ash">{formatPrice(unitPrice)} each</span>}
        </div>
        <div>
          <span className="mb-2 block text-xs text-ash">Quantity</span>
          <div className="inline-flex w-fit items-center overflow-hidden rounded-lg border border-border-strong bg-paper">
            <button type="button" onClick={() => setQuantity(Math.max(1, quantity - 1))} disabled={isOutOfStock} className="min-h-11 min-w-10 px-3 text-lg hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40" aria-label="Decrease quantity">−</button>
            <span className="min-w-9 px-2 text-center font-mono text-sm">{quantity}</span>
            <button type="button" onClick={() => setQuantity(Math.min(maxQuantity, quantity + 1))} disabled={isOutOfStock || quantity >= maxQuantity} className="min-h-11 min-w-10 px-3 text-lg hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40" aria-label="Increase quantity">+</button>
          </div>
        </div>
      </div>

      <StockStatusBadge status={status} available={availability?.available} />

      <AddToCartButton productId={productHandle} quantity={quantity} maxAvailable={availability?.tracked ? maxQuantity : undefined} disabled={isOutOfStock} className={cn("min-h-12", isOutOfStock && "opacity-60")}>
        {isOutOfStock ? "Out of Stock" : "Add to Cart"}
      </AddToCartButton>

      <div className="space-y-2 border-t border-border-strong pt-4 text-sm leading-relaxed text-[#aab0b9]">
        <p><span className="font-medium text-ink">{formatPrice(FLAT_SHIPPING_USD)} shipping</span>{" · Free on product subtotals of "}{formatPrice(FREE_SHIPPING_THRESHOLD)} or more.</p>
        <p>Usually ships within 1–2 business days after payment clears. Tracked delivery to U.S. physical addresses.</p>
        <Link href="/shipping" className="inline-flex min-h-11 items-center text-xs text-ink underline decoration-ash underline-offset-4 hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">Shipping policy</Link>
      </div>
    </div>
  );
}
