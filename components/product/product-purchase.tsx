"use client";

import { useState } from "react";

import { AddToCartButton } from "@/components/commerce/AddToCartButton";
import { cn } from "@/lib/utils";

type ProductPurchaseProps = {
  productHandle: string;
  price: number;
  subscribePrice: number;
  className?: string;
};

export function ProductPurchase({
  productHandle,
  price,
  subscribePrice,
  className,
}: ProductPurchaseProps) {
  const [subscribe, setSubscribe] = useState(false);
  const [quantity, setQuantity] = useState(1);

  const displayPrice = subscribe ? subscribePrice : price;

  return (
    <div className={cn("flex flex-col gap-6", className)}>
      <div className="flex flex-col gap-3">
        <div className="flex items-baseline gap-3">
          <span className="font-[family-name:var(--font-display)] text-3xl text-[var(--color-ink)]">
            ${displayPrice}
          </span>
          {subscribe && (
            <span className="font-[family-name:var(--font-mono)] text-sm text-[var(--color-stone)] line-through">
              ${price}
            </span>
          )}
        </div>

        <div
          className="inline-flex w-fit border border-[var(--color-sage)]"
          role="group"
          aria-label="Purchase type"
        >
          <button
            type="button"
            onClick={() => setSubscribe(false)}
            className={cn(
              "px-4 py-2 text-sm transition-colors duration-200 ease-out",
              !subscribe
                ? "bg-[var(--color-sage)] text-[var(--color-lab-white)]"
                : "bg-[var(--color-lab-white)] text-[var(--color-ink)] hover:opacity-80"
            )}
          >
            One-time
          </button>
          <button
            type="button"
            onClick={() => setSubscribe(true)}
            className={cn(
              "px-4 py-2 text-sm transition-colors duration-200 ease-out",
              subscribe
                ? "bg-[var(--color-sage)] text-[var(--color-lab-white)]"
                : "bg-[var(--color-lab-white)] text-[var(--color-ink)] hover:opacity-80"
            )}
          >
            Subscribe
          </button>
        </div>

        {subscribe && (
          <p className="font-[family-name:var(--font-mono)] text-sm text-[var(--color-stone)]">
            subscribe ↓ ${subscribePrice}/mo · cancel anytime
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <span className="mono text-[var(--color-stone)]">QUANTITY</span>
        <div className="inline-flex w-fit items-center border border-[var(--color-sage)]">
          <button
            type="button"
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            className="px-4 py-2 text-lg transition-opacity duration-200 ease-out hover:opacity-70"
            aria-label="Decrease quantity"
          >
            −
          </button>
          <span className="min-w-12 border-x border-[var(--color-sage)] px-4 py-2 text-center font-[family-name:var(--font-mono)]">
            {quantity}
          </span>
          <button
            type="button"
            onClick={() => setQuantity((q) => q + 1)}
            className="px-4 py-2 text-lg transition-opacity duration-200 ease-out hover:opacity-70"
            aria-label="Increase quantity"
          >
            +
          </button>
        </div>
      </div>

      <AddToCartButton productId={productHandle} quantity={quantity}>
        Pay with Crypto
      </AddToCartButton>
    </div>
  );
}
