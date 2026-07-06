"use client";

import { useCart } from "@/components/cart/cart-provider";
import { cn } from "@/lib/utils";

type AddToCartButtonProps = {
  productId: string;
  quantity?: number;
  className?: string;
  variant?: "primary" | "compact";
  disabled?: boolean;
  children?: React.ReactNode;
};

export function AddToCartButton({
  productId,
  quantity = 1,
  className,
  variant = "primary",
  disabled = false,
  children,
}: AddToCartButtonProps) {
  const { addItem } = useCart();

  function handleAddToCart() {
    if (disabled) return;
    addItem(productId, quantity);
  }

  const baseStyles =
    "rounded-pill bg-ink font-medium text-lab-white transition-opacity duration-200 ease-out hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";

  const variantStyles =
    variant === "primary"
      ? "w-full px-6 py-3.5 text-base"
      : "shrink-0 px-6 py-3.5 text-sm min-h-[44px]";

  return (
    <div className={cn("flex flex-col", className)}>
      <button
        type="button"
        onClick={handleAddToCart}
        disabled={disabled}
        className={cn(baseStyles, variantStyles)}
      >
        {children ?? "Add to Cart"}
      </button>
    </div>
  );
}
