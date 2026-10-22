"use client";

import { ShoppingBag } from "lucide-react";

import { useCart } from "@/components/cart/cart-provider";
import { cn } from "@/lib/utils";

type CartIconButtonProps = {
  className?: string;
};

export function CartIconButton({ className }: CartIconButtonProps) {
  const { totalQuantity, openCart, isHydrated } = useCart();

  return (
    <button
      type="button"
      onClick={openCart}
      aria-label={
        totalQuantity > 0
          ? `Open cart, ${totalQuantity} ${totalQuantity === 1 ? "item" : "items"}`
          : "Open cart"
      }
      className={cn(
        "relative inline-flex size-11 items-center justify-center rounded-sm text-ink transition-colors duration-200 ease-out hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        className
      )}
    >
      <ShoppingBag className="size-6" strokeWidth={1.35} aria-hidden />
      {isHydrated && totalQuantity > 0 && (
        <span aria-hidden className="absolute -right-0.5 -top-0.5 flex size-5 items-center justify-center rounded-full bg-accent font-mono text-xs font-medium text-page">
          {totalQuantity > 99 ? "99+" : totalQuantity}
        </span>
      )}
    </button>
  );
}
