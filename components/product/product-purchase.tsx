"use client";

import { useState } from "react";
import { Check } from "lucide-react";

import { AddToCartButton } from "@/components/commerce/AddToCartButton";
import { BitcoinIcon } from "@/components/commerce/bitcoin-icon";
import { StockStatusBadge } from "@/components/commerce/stock-status-badge";
import type { StockStatus } from "@/lib/products/stock";
import { cn } from "@/lib/utils";

type ProductPurchaseProps = {
  productHandle: string;
  price: number;
  subscribePrice: number;
  stockStatus: StockStatus;
  className?: string;
};

const purchaseTrustItems = ["Third-Party Tested", "COA Available"] as const;

export function ProductPurchase({
  productHandle,
  price,
  subscribePrice,
  stockStatus,
  className,
}: ProductPurchaseProps) {
  const [subscribe, setSubscribe] = useState(false);
  const [quantity, setQuantity] = useState(1);

  const displayPrice = subscribe ? subscribePrice : price;
  const isOutOfStock = stockStatus === "out_of_stock";

  return (
    <div
      className={cn(
        "flex flex-col gap-8 rounded-2xl border border-linen bg-lab-white p-6 shadow-[0_2px_16px_rgba(26,77,109,0.06)] md:p-8",
        className
      )}
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-baseline gap-3">
          <span className="font-display text-4xl font-bold tracking-[-0.02em] text-ink">
            ${displayPrice}
          </span>
          {subscribe && (
            <span className="font-[family-name:var(--font-mono)] text-sm text-ash line-through">
              ${price}
            </span>
          )}
        </div>

        <div
          className="inline-flex w-fit border border-linen"
          role="group"
          aria-label="Purchase type"
        >
          <button
            type="button"
            onClick={() => setSubscribe(false)}
            className={cn(
              "px-4 py-2 text-sm transition-colors duration-200 ease-out",
              !subscribe
                ? "bg-petrol text-lab-white"
                : "bg-lab-white text-ink hover:bg-biotech-mist/40"
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
                ? "bg-petrol text-lab-white"
                : "bg-lab-white text-ink hover:bg-biotech-mist/40"
            )}
          >
            Subscribe
          </button>
        </div>

        {subscribe && (
          <p className="font-[family-name:var(--font-mono)] text-sm text-ash">
            subscribe ↓ ${subscribePrice}/mo · cancel anytime
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <span className="mono text-ash">Quantity</span>
        <div className="inline-flex w-fit items-center border border-linen">
          <button
            type="button"
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
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
            onClick={() => setQuantity((q) => q + 1)}
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
          {isOutOfStock ? "Out of Stock" : "Pay with Bitcoin"}
        </AddToCartButton>

        <p className="text-xs leading-relaxed text-ash">
          Bitcoin payments are processed through BTCPay Server.
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

        <div className="pt-1">
          <span className="inline-flex items-center gap-1.5 rounded-pill border border-linen bg-paper/50 px-3 py-1 text-xs text-ash">
            <BitcoinIcon className="size-3" />
            Bitcoin accepted
          </span>
        </div>
      </div>
    </div>
  );
}
