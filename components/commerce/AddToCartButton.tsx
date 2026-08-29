"use client";

import { useState } from "react";

import { useCart } from "@/components/cart/cart-provider";
import { cn } from "@/lib/utils";

type AddToCartButtonProps = {
  productId: string;
  quantity?: number;
  maxAvailable?: number;
  className?: string;
  variant?: "primary" | "compact";
  disabled?: boolean;
  children?: React.ReactNode;
};

export function AddToCartButton({
  productId,
  quantity = 1,
  maxAvailable,
  className,
  variant = "primary",
  disabled = false,
  children,
}: AddToCartButtonProps) {
  const { addItem } = useCart();
  const [error, setError] = useState<string | null>(null);

  function handleAddToCart() {
    if (disabled) return;
    setError(null);
    const result = addItem(productId, quantity, maxAvailable);
    if (!result.ok) {
      setError(result.error);
    }
  }

  const baseStyles =
    "rounded-pill bg-accent font-medium text-page transition-opacity duration-200 ease-out hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50";

  const variantStyles =
    variant === "primary"
      ? "w-full px-6 py-3.5 text-base"
      : "shrink-0 px-6 py-3.5 text-sm min-h-[44px]";

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <button
        type="button"
        onClick={handleAddToCart}
        disabled={disabled}
        className={cn(baseStyles, variantStyles)}
      >
        {children ?? "Add to Cart"}
      </button>
      {error && (
        <p role="alert" className="text-sm text-signal">
          {error}
        </p>
      )}
    </div>
  );
}
